#include "ble.h"
#include "led.h"
#include "voltage.h"
#include "ads1220.h"
#include "resistance.h"
#include "power.h"
#include "board_pins.h"

#include <hal/nrf_gpio.h>
#include <hal/nrf_pwm.h>

#include <zephyr/bluetooth/bluetooth.h>
#include <zephyr/bluetooth/conn.h>
#include <zephyr/bluetooth/gatt.h>
#include <zephyr/kernel.h>
#include <zephyr/sys/atomic.h>
#include <zephyr/sys/printk.h>

#include <errno.h>
#include <stdbool.h>
#include <stdint.h>
#include <string.h>
#include <stdio.h>


typedef enum {
    DMM_MODE_VOLTAGE,
    DMM_MODE_RESISTANCE,
    DMM_MODE_CONTINUITY,
} dmm_mode_t;

/* These flags cross BLE callback / continuity worker / system work contexts. */
static atomic_t current_dmm_mode = ATOMIC_INIT(DMM_MODE_VOLTAGE);
static atomic_t connected_state = ATOMIC_INIT(0);
static atomic_t continuity_active = ATOMIC_INIT(0);
static atomic_t buzzer_tone_active = ATOMIC_INIT(0);

/* Serializes all ADS1220 accesses and DMM mode changes. */
K_MUTEX_DEFINE(dmm_mutex);
K_SEM_DEFINE(continuity_wake, 0, 1);

#define CONTINUITY_ON_OHMS 30.0
#define CONTINUITY_OFF_OHMS 40.0
#define CONTINUITY_POLL_GAP_MS 1 /* Additional pause AFTER each fast ADC conversion. */
#define CONTINUITY_ON_CONFIRM_SAMPLES   2
#define CONTINUITY_OFF_CONFIRM_SAMPLES  2
#define CONTINUITY_MIN_BEEP_MS         25

/* Cached status is only accessed while dmm_mutex is held. */
static resistance_result_t continuity_result = RESISTANCE_RESULT_ERROR;
static double continuity_ohms;
static bool continuity_has_sample;


/* EVT1 buzzer: PWM drives the active-low red LED GPIO through the external
 * transistor driver. MODE_RELAY_EN is the independent hardware interlock.
 * That relay gate is forced LOW immediately on mode changes/disconnect. */
#define BUZZER_PWM_TOP 250  /* 1 MHz / 250 = 4 kHz */
#define BUZZER_PWM_DUTY 125 /* 50% */

/* EasyDMA requires the sequence to reside in RAM. */
static uint16_t buzzer_pwm_sequence[1] = { BUZZER_PWM_DUTY };
static bool buzzer_running;

static void buzzer_stop(void)
{
    if (buzzer_running) {
        NRF_PWM2->SHORTS = 0;
        NRF_PWM2->TASKS_STOP = 1;
        /* Do not let PWM retain ownership of GPIO_R. */
        NRF_PWM2->ENABLE = 0;
        NRF_PWM2->PSEL.OUT[0] = 0xFFFFFFFFu;
        buzzer_running = false;
    }
    nrf_gpio_cfg_output(PIN_LED_R);
    nrf_gpio_pin_clear(PIN_LED_R); /* MOSFET off */
    atomic_clear(&buzzer_tone_active);
}

static void buzzer_start(void)
{
    if (buzzer_running) {
        return;
    }

    buzzer_stop();
    led_set_connected(); /* Green on; red output inactive before PWM. */

    NRF_PWM2->ENABLE = 0;
    NRF_PWM2->PSEL.OUT[0] = PIN_LED_R;
    NRF_PWM2->PSEL.OUT[1] = 0xFFFFFFFFu;
    NRF_PWM2->PSEL.OUT[2] = 0xFFFFFFFFu;
    NRF_PWM2->PSEL.OUT[3] = 0xFFFFFFFFu;
    NRF_PWM2->PRESCALER = 4; /* 16 MHz / 2^4 = 1 MHz */
    NRF_PWM2->MODE = 0; /* up counter */
    NRF_PWM2->COUNTERTOP = BUZZER_PWM_TOP;
    NRF_PWM2->DECODER = 0; /* common load, refresh on every period */
    NRF_PWM2->LOOP = 1;
    NRF_PWM2->SEQ[0].PTR = (uint32_t)buzzer_pwm_sequence;
    NRF_PWM2->SEQ[0].CNT = 1;
    NRF_PWM2->SEQ[0].REFRESH = 0;
    NRF_PWM2->SEQ[0].ENDDELAY = 0;
    NRF_PWM2->SHORTS = PWM_SHORTS_LOOPSDONE_SEQSTART0_Msk;
    NRF_PWM2->ENABLE = 1;
    buzzer_running = true;
    atomic_set(&buzzer_tone_active, 1);
    NRF_PWM2->TASKS_SEQSTART[0] = 1;
    printk("[BUZZER] Continuity 4 kHz tone ON\n");
}

/* Cut the hardware gate immediately, even if an ADC conversion is in flight. */
static void continuity_disable_immediately(void)
{
    atomic_clear(&continuity_active);
    nrf_gpio_pin_clear(PIN_MODE_RELAY_EN);
    nrf_gpio_pin_clear(PIN_MUX_EN);
    buzzer_stop();
}

/* This thread is dormant outside continuity mode. Only one context at a
 * time ever touches ADS1220. The buzzer operates even without app polling. */
static void continuity_thread(void *a, void *b, void *c)
{
    ARG_UNUSED(a);
    ARG_UNUSED(b);
    ARG_UNUSED(c);

    uint8_t on_confirm_count = 0;
    uint8_t off_confirm_count = 0;
    int64_t buzzer_started_ms = 0;

    while (true) {
        k_sem_take(&continuity_wake, K_FOREVER);

        /*
         * Start each continuity session with clean debounce state.
         */
        on_confirm_count = 0;
        off_confirm_count = 0;
        buzzer_started_ms = 0;

        while (atomic_get(&continuity_active)) {
            k_mutex_lock(&dmm_mutex, K_FOREVER);

            if (atomic_get(&continuity_active) &&
                atomic_get(&connected_state) &&
                atomic_get(&current_dmm_mode) == DMM_MODE_CONTINUITY) {

                double ohms = 0.0;
                resistance_result_t result =
                    resistance_read_continuity(&ohms);

                /*
                 * A disconnect can happen during the ADC conversion.
                 * Never re-enable the tone after the urgent relay cutoff.
                 */
                if (atomic_get(&continuity_active) &&
                    atomic_get(&connected_state) &&
                    atomic_get(&current_dmm_mode) == DMM_MODE_CONTINUITY) {

                    continuity_result = result;
                    continuity_has_sample =
                        (result != RESISTANCE_RESULT_ERROR);

                    if (result == RESISTANCE_RESULT_OK) {
                        continuity_ohms = ohms;

                        /*
                         * -------------------------
                         * Buzzer currently OFF
                         * -------------------------
                         */
                        if (!atomic_get(&buzzer_tone_active)) {

                            off_confirm_count = 0;

                            if (ohms <= CONTINUITY_ON_OHMS) {
                                if (on_confirm_count <
                                    CONTINUITY_ON_CONFIRM_SAMPLES) {
                                    on_confirm_count++;
                                }

                                if (on_confirm_count >=
                                    CONTINUITY_ON_CONFIRM_SAMPLES) {

                                    buzzer_start();
                                    buzzer_started_ms =
                                        k_uptime_get();

                                    on_confirm_count = 0;
                                }
                            } else {
                                /*
                                 * Continuity disappeared before
                                 * confirmation completed.
                                 */
                                on_confirm_count = 0;
                            }
                        }

                        /*
                         * -------------------------
                         * Buzzer currently ON
                         * -------------------------
                         */
                        else {

                            on_confirm_count = 0;

                            /*
                             * Don't allow the tone to stop until
                             * the minimum beep duration has elapsed.
                             */
                            const int64_t tone_age_ms =
                                k_uptime_get() -
                                buzzer_started_ms;

                            if (tone_age_ms >=
                                CONTINUITY_MIN_BEEP_MS) {

                                if (ohms >=
                                    CONTINUITY_OFF_OHMS) {

                                    if (off_confirm_count <
                                        CONTINUITY_OFF_CONFIRM_SAMPLES) {
                                        off_confirm_count++;
                                    }

                                    if (off_confirm_count >=
                                        CONTINUITY_OFF_CONFIRM_SAMPLES) {

                                        buzzer_stop();
                                        off_confirm_count = 0;
                                    }
                                } else {
                                    /*
                                     * Reading returned below the
                                     * OFF threshold, so cancel the
                                     * pending turn-off.
                                     */
                                    off_confirm_count = 0;
                                }
                            }
                        }
                    } else {
                        /*
                         * OL or ADC error.
                         *
                         * Treat these like a possible loss of
                         * continuity, but still honor the minimum
                         * beep duration and confirmation count.
                         */
                        on_confirm_count = 0;

                        if (atomic_get(&buzzer_tone_active)) {

                            const int64_t tone_age_ms =
                                k_uptime_get() -
                                buzzer_started_ms;

                            if (tone_age_ms >=
                                CONTINUITY_MIN_BEEP_MS) {

                                if (off_confirm_count <
                                    CONTINUITY_OFF_CONFIRM_SAMPLES) {
                                    off_confirm_count++;
                                }

                                if (off_confirm_count >=
                                    CONTINUITY_OFF_CONFIRM_SAMPLES) {

                                    buzzer_stop();
                                    off_confirm_count = 0;
                                }
                            }
                        } else {
                            off_confirm_count = 0;
                        }
                    }
                }
            }

            k_mutex_unlock(&dmm_mutex);

            k_msleep(CONTINUITY_POLL_GAP_MS);
        }

        /*
         * Ensure no stale debounce state survives leaving
         * continuity mode.
         */
        on_confirm_count = 0;
        off_confirm_count = 0;
        buzzer_started_ms = 0;
    }
}

/* Dedicated low-priority worker; no additional source/CMake changes needed. */
K_THREAD_DEFINE(continuity_thread_id, 3072, continuity_thread,
                NULL, NULL, NULL, 10, 0, 0);

/* The BLE disconnect callback must not run blocking SPI/ADC operations.
 * Relay and resistance excitation are disabled synchronously; ADC
 * reconfiguration is deferred to system workqueue context. */
static void disconnect_safe_mode_work_handler(struct k_work *work)
{
    ARG_UNUSED(work);
    k_mutex_lock(&dmm_mutex, K_FOREVER);
    /* Reconnect may have selected another mode while this work was queued. */
    if (atomic_get(&current_dmm_mode) == DMM_MODE_VOLTAGE) {
        resistance_exit_mode();
        if (!ads1220_config_voltage()) {
            printk("[DMM] ERROR: voltage ADC config failed after disconnect\n");
        } else {
            printk("[DMM] Returned to voltage mode after disconnect\n");
        }
    }
    k_mutex_unlock(&dmm_mutex);
}
K_WORK_DEFINE(disconnect_safe_mode_work, disconnect_safe_mode_work_handler);


/* -------------------------------------------------------------------------- */
/* PocketLab UUIDs                                                            */
/* -------------------------------------------------------------------------- */

/*
 * Service:
 * 8f5b0001-6c4d-4a73-a8f1-3d9ea01c0001
 *
 * Command RX:
 * 8f5b0002-6c4d-4a73-a8f1-3d9ea01c0001
 *
 * Response TX:
 * 8f5b0003-6c4d-4a73-a8f1-3d9ea01c0001
 */

#define BT_UUID_POCKETLAB_SERVICE_VAL \
    BT_UUID_128_ENCODE(0x8f5b0001, 0x6c4d, 0x4a73, 0xa8f1, 0x3d9ea01c0001)

#define BT_UUID_POCKETLAB_COMMAND_RX_VAL \
    BT_UUID_128_ENCODE(0x8f5b0002, 0x6c4d, 0x4a73, 0xa8f1, 0x3d9ea01c0001)

#define BT_UUID_POCKETLAB_RESPONSE_TX_VAL \
    BT_UUID_128_ENCODE(0x8f5b0003, 0x6c4d, 0x4a73, 0xa8f1, 0x3d9ea01c0001)

static struct bt_uuid_128 pocketlab_service_uuid =
    BT_UUID_INIT_128(BT_UUID_POCKETLAB_SERVICE_VAL);

static struct bt_uuid_128 pocketlab_command_rx_uuid =
    BT_UUID_INIT_128(BT_UUID_POCKETLAB_COMMAND_RX_VAL);

static struct bt_uuid_128 pocketlab_response_tx_uuid =
    BT_UUID_INIT_128(BT_UUID_POCKETLAB_RESPONSE_TX_VAL);

/* -------------------------------------------------------------------------- */
/* State                                                                      */
/* -------------------------------------------------------------------------- */

static bool restart_advertising = false;

#define COMMAND_BUFFER_SIZE 64

static char last_command[COMMAND_BUFFER_SIZE];

/* Forward declaration because the write callback uses the service. */
static ssize_t command_write_cb(
    struct bt_conn *conn,
    const struct bt_gatt_attr *attr,
    const void *buf,
    uint16_t len,
    uint16_t offset,
    uint8_t flags);

static ssize_t command_read_cb(
    struct bt_conn *conn,
    const struct bt_gatt_attr *attr,
    void *buf,
    uint16_t len,
    uint16_t offset);

static void response_ccc_changed(
    const struct bt_gatt_attr *attr,
    uint16_t value);

/* -------------------------------------------------------------------------- */
/* PocketLab GATT service                                                     */
/* -------------------------------------------------------------------------- */

BT_GATT_SERVICE_DEFINE(
    pocketlab_service,

    BT_GATT_PRIMARY_SERVICE(&pocketlab_service_uuid),

    /*
     * Command RX
     *
     * READ is included because the existing app has diagnostic read-back
     * support in addition to normal command writes.
     */
    BT_GATT_CHARACTERISTIC(
        &pocketlab_command_rx_uuid.uuid,
        BT_GATT_CHRC_READ |
            BT_GATT_CHRC_WRITE |
            BT_GATT_CHRC_WRITE_WITHOUT_RESP,
        BT_GATT_PERM_READ | BT_GATT_PERM_WRITE,
        command_read_cb,
        command_write_cb,
        last_command),

    /*
     * Response TX
     */
    BT_GATT_CHARACTERISTIC(
        &pocketlab_response_tx_uuid.uuid,
        BT_GATT_CHRC_NOTIFY,
        BT_GATT_PERM_NONE,
        NULL,
        NULL,
        NULL),

    BT_GATT_CCC(
        response_ccc_changed,
        BT_GATT_PERM_READ | BT_GATT_PERM_WRITE));

/* -------------------------------------------------------------------------- */
/* Response handling                                                          */
/* -------------------------------------------------------------------------- */

int ble_send_response(const char *response)
{
    if (response == NULL) {
        return -EINVAL;
    }

    if (!atomic_get(&connected_state)) {
        return -ENOTCONN;
    }

    /*
     * Attribute 4 is the value attribute for RESPONSE_TX:
     *
     * 0 = primary service
     * 1 = COMMAND_RX characteristic declaration
     * 2 = COMMAND_RX value
     * 3 = RESPONSE_TX characteristic declaration
     * 4 = RESPONSE_TX value
     * 5 = CCC
     */
    int err = bt_gatt_notify(
        NULL,
        &pocketlab_service.attrs[4],
        response,
        strlen(response));

    if (err) {
        printk("BLE notify failed: %d\n", err);
        return err;
    }

    printk("BLE TX: %s\n", response);

    return 0;
}

/* -------------------------------------------------------------------------- */
/* Command handling                                                           */
/* -------------------------------------------------------------------------- */

static void handle_command(const char *command)
{
    printk("BLE RX: %s\n", command);

    if (strcmp(command, "PING") == 0) {
        ble_send_response("PONG");
        return;
    }

    if (strcmp(command, "INFO") == 0) {
        ble_send_response(
            "INFO MODEL=PocketLab-Base;"
            "FW=0.3.0-EVT1;"
            "HW=EVT1-NRF52840");
        return;
    }

    if (strcmp(command, "FEATURES") == 0) {
        ble_send_response("FEATURES DMM");
        return;
    }

    /*
     * Report current DMM state.
     *
     * In resistance mode, report the actual autorange-selected
     * reference resistor.
     */
    if (strcmp(command, "DMM:GET_STATE") == 0) {
        char response[96];
        k_mutex_lock(&dmm_mutex, K_FOREVER);
        dmm_mode_t mode = (dmm_mode_t)atomic_get(&current_dmm_mode);
        if (mode == DMM_MODE_CONTINUITY) {
            snprintf(response, sizeof(response),
                     "DMM:STATE MODE=CONTINUITY;RANGE=10K;RREF=10000");
        } else if (mode == DMM_MODE_RESISTANCE) {
            snprintf(response, sizeof(response),
                     "DMM:STATE MODE=RESISTANCE;RANGE=%s;RREF=%.0f",
                     resistance_get_range_name(), resistance_get_rref_ohms());
        } else {
            snprintf(response, sizeof(response), "DMM:STATE MODE=VOLTAGE;RANGE=FIXED");
        }
        k_mutex_unlock(&dmm_mutex);
        ble_send_response(response);
        return;
    }

    /* All mode transitions disable the buzzer/relay BEFORE changing the ADC. */
    if (strcmp(command, "DMM:SET_MODE VOLTAGE") == 0 ||
        strcmp(command, "DMM:SET_MODE RESISTANCE") == 0 ||
        strcmp(command, "DMM:SET_MODE CONTINUITY") == 0) {

        continuity_disable_immediately();
        k_mutex_lock(&dmm_mutex, K_FOREVER);
        continuity_has_sample = false;
        continuity_result = RESISTANCE_RESULT_ERROR;

        bool ok = false;
        char response[96];
        if (strcmp(command, "DMM:SET_MODE VOLTAGE") == 0) {
            resistance_exit_mode();
            atomic_set(&current_dmm_mode, DMM_MODE_VOLTAGE);
            ok = ads1220_config_voltage();
            if (ok) {
                k_msleep(25);
                snprintf(response, sizeof(response), "DMM:STATE MODE=VOLTAGE;RANGE=FIXED");
            }
        } else if (strcmp(command, "DMM:SET_MODE RESISTANCE") == 0) {
            ok = resistance_enter_mode();
            if (ok) {
                atomic_set(&current_dmm_mode, DMM_MODE_RESISTANCE);
                snprintf(response, sizeof(response),
                         "DMM:STATE MODE=RESISTANCE;RANGE=%s;RREF=%.0f",
                         resistance_get_range_name(), resistance_get_rref_ohms());
            }
        } else {
            /* Keep the existing 10K reference and relay setup, but use a
             * much faster ADC rate only in continuity mode. */
            ok = resistance_enter_mode();
            if (ok) {
                ok = ads1220_config_continuity();
            }
            if (ok) {
                atomic_set(&current_dmm_mode, DMM_MODE_CONTINUITY);
                snprintf(response, sizeof(response),
                         "DMM:STATE MODE=CONTINUITY;RANGE=10K;RREF=10000");
                atomic_set(&continuity_active, 1);
            }
        }

        if (!ok) {
            resistance_exit_mode();
            atomic_set(&current_dmm_mode, DMM_MODE_VOLTAGE);
            (void)ads1220_config_voltage();
        }
        k_mutex_unlock(&dmm_mutex);

        ble_send_response(ok ? response : "ERR ADC_CONFIG_FAILED");
        if (ok && atomic_get(&continuity_active)) {
            k_sem_give(&continuity_wake);
        }
        return;
    }

    if (strcmp(command, "DMM:READ") == 0) {
        char response[128];
        bool ok = false;
        k_mutex_lock(&dmm_mutex, K_FOREVER);
        dmm_mode_t mode = (dmm_mode_t)atomic_get(&current_dmm_mode);

        if (mode == DMM_MODE_VOLTAGE) {
            double volts;
            if (voltage_read(&volts)) {
                snprintf(response, sizeof(response), "DMM:VALUE %.6f;UNIT=V", volts);
                ok = true;
            }
        } else if (mode == DMM_MODE_RESISTANCE) {
            double ohms;
            resistance_result_t result = resistance_read(&ohms);
            if (result == RESISTANCE_RESULT_OPEN) {
                snprintf(response, sizeof(response),
                         "DMM:VALUE OL;UNIT=OHM;RANGE=%s;RREF=%.0f",
                         resistance_get_range_name(), resistance_get_rref_ohms());
                ok = true;
            } else if (result == RESISTANCE_RESULT_OK) {
                snprintf(response, sizeof(response),
                         "DMM:VALUE %.3f;UNIT=OHM;RANGE=%s;RREF=%.0f",
                         ohms, resistance_get_range_name(), resistance_get_rref_ohms());
                ok = true;
            }
        } else if (mode == DMM_MODE_CONTINUITY && continuity_has_sample) {
            const int detected = atomic_get(&buzzer_tone_active) ? 1 : 0;
            if (continuity_result == RESISTANCE_RESULT_OPEN) {
                snprintf(response, sizeof(response),
                         "DMM:VALUE OL;UNIT=OHM;MODE=CONTINUITY;CONT=0;RANGE=10K;RREF=10000");
                ok = true;
            } else if (continuity_result == RESISTANCE_RESULT_OK) {
                snprintf(response, sizeof(response),
                         "DMM:VALUE %.3f;UNIT=OHM;MODE=CONTINUITY;CONT=%d;RANGE=10K;RREF=10000",
                         continuity_ohms, detected);
                ok = true;
            }
        }
        k_mutex_unlock(&dmm_mutex);
        ble_send_response(ok ? response : "ERR DMM_READ_FAILED");
        return;
    }

    /*
     * Controlled software power-down.
     */
    if (strcmp(command, "POWER:SHUTDOWN") == 0) {
        continuity_disable_immediately();
        ble_send_response("OK SHUTTING_DOWN");

        /*
         * Give BLE a moment to transmit the acknowledgement
         * before removing power.
         */
        k_msleep(100);

        power_shutdown();

        return;
    }

    ble_send_response("ERR UNKNOWN_COMMAND");
}

/* -------------------------------------------------------------------------- */
/* GATT callbacks                                                             */
/* -------------------------------------------------------------------------- */

static ssize_t command_write_cb(
    struct bt_conn *conn,
    const struct bt_gatt_attr *attr,
    const void *buf,
    uint16_t len,
    uint16_t offset,
    uint8_t flags)
{
    ARG_UNUSED(conn);
    ARG_UNUSED(attr);
    ARG_UNUSED(flags);

    /*
     * Keep the first protocol implementation simple:
     * commands must arrive as a complete write starting at offset 0.
     */
    if (offset != 0) {
        return BT_GATT_ERR(BT_ATT_ERR_INVALID_OFFSET);
    }

    if (len == 0 || len >= COMMAND_BUFFER_SIZE) {
        return BT_GATT_ERR(BT_ATT_ERR_INVALID_ATTRIBUTE_LEN);
    }

    memcpy(last_command, buf, len);
    last_command[len] = '\0';

    /*
     * Strip CR/LF in case commands are ever sent from a terminal-like client.
     */
    while (len > 0 &&
           (last_command[len - 1] == '\r' ||
            last_command[len - 1] == '\n')) {
        last_command[len - 1] = '\0';
        len--;
    }

    handle_command(last_command);

    return len;
}

static ssize_t command_read_cb(
    struct bt_conn *conn,
    const struct bt_gatt_attr *attr,
    void *buf,
    uint16_t len,
    uint16_t offset)
{
    const char *value = attr->user_data;

    return bt_gatt_attr_read(
        conn,
        attr,
        buf,
        len,
        offset,
        value,
        strlen(value));
}

static void response_ccc_changed(
    const struct bt_gatt_attr *attr,
    uint16_t value)
{
    ARG_UNUSED(attr);

    if (value == BT_GATT_CCC_NOTIFY) {
        printk("PocketLab notifications enabled\n");
    } else {
        printk("PocketLab notifications disabled\n");
    }
}

/* -------------------------------------------------------------------------- */
/* Advertising                                                                */
/* -------------------------------------------------------------------------- */

static const struct bt_data ad[] = {
    BT_DATA_BYTES(
        BT_DATA_FLAGS,
        BT_LE_AD_GENERAL | BT_LE_AD_NO_BREDR),

    /*
     * Advertise the PocketLab service UUID.
     * The app currently scans all BLE devices, but this lets us filter by
     * service UUID later.
     */
    BT_DATA_BYTES(
        BT_DATA_UUID128_ALL,
        BT_UUID_POCKETLAB_SERVICE_VAL),
};

static const struct bt_data sd[] = {
    BT_DATA(
        BT_DATA_NAME_COMPLETE,
        CONFIG_BT_DEVICE_NAME,
        sizeof(CONFIG_BT_DEVICE_NAME) - 1),
};

static int start_advertising(void)
{
    int err = bt_le_adv_start(
        BT_LE_ADV_CONN_FAST_2,
        ad,
        ARRAY_SIZE(ad),
        sd,
        ARRAY_SIZE(sd));

    if (err) {
        printk("Advertising failed: %d\n", err);
        led_off();
        return err;
    }

    printk("Advertising as %s\n", CONFIG_BT_DEVICE_NAME);

    led_set_advertising();

    return 0;
}

/* -------------------------------------------------------------------------- */
/* Connection handling                                                        */
/* -------------------------------------------------------------------------- */

static void advertising_restart_work_handler(struct k_work *work)
{
    ARG_UNUSED(work);

    printk("Restarting advertising...\n");

    int err = start_advertising();

    if (err) {
        printk("Advertising restart failed: %d\n", err);
    }
}

K_WORK_DEFINE(
    advertising_restart_work,
    advertising_restart_work_handler);

static void connected(
    struct bt_conn *conn,
    uint8_t err)
{
    ARG_UNUSED(conn);

    if (err) {
        printk("BLE connection failed: %u\n", err);
        return;
    }

    atomic_set(&connected_state, 1);
    restart_advertising = false;

    printk("BLE connected\n");

    led_set_connected();
}

static void disconnected(
    struct bt_conn *conn,
    uint8_t reason)
{
    ARG_UNUSED(conn);

    atomic_clear(&connected_state);
    restart_advertising = true;

    /* Immediately remove buzzer enable and resistance excitation. */
    continuity_disable_immediately();
    atomic_set(&current_dmm_mode, DMM_MODE_VOLTAGE);

    printk("BLE disconnected: %u\n", reason);
    led_off();
    k_work_submit(&disconnect_safe_mode_work);
}

static void recycled(void)
{
    if (!restart_advertising) {
        return;
    }

    restart_advertising = false;

    printk("Connection recycled\n");

    k_work_submit(&advertising_restart_work);
}

BT_CONN_CB_DEFINE(connection_callbacks) = {
    .connected = connected,
    .disconnected = disconnected,
    .recycled = recycled,
};

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

int ble_init(void)
{
    int err;

    atomic_clear(&connected_state);
    restart_advertising = false;
    last_command[0] = '\0';

    /* Safe power-on relay state independent of RGB LED state. */
    continuity_disable_immediately();
    led_off();

    err = bt_enable(NULL);

    if (err) {
        printk("Bluetooth init failed: %d\n", err);
        return err;
    }

    printk("Bluetooth initialized\n");

    return start_advertising();
}

bool ble_is_connected(void)
{
    return atomic_get(&connected_state) != 0;
}