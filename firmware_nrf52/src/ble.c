#include "ble.h"
#include "led.h"
#include "voltage.h"
#include "ads1220.h"
#include "resistance.h"
#include "power.h"

#include <zephyr/bluetooth/bluetooth.h>
#include <zephyr/bluetooth/conn.h>
#include <zephyr/bluetooth/gatt.h>
#include <zephyr/kernel.h>
#include <zephyr/sys/printk.h>

#include <errno.h>
#include <stdbool.h>
#include <stdint.h>
#include <string.h>
#include <stdio.h>


typedef enum {
    DMM_MODE_VOLTAGE,
    DMM_MODE_RESISTANCE,
} dmm_mode_t;

static dmm_mode_t current_dmm_mode = DMM_MODE_VOLTAGE;

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

static bool connected_state = false;
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

    if (!connected_state) {
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
        if (current_dmm_mode == DMM_MODE_RESISTANCE) {
            char response[96];

            snprintf(
                response,
                sizeof(response),
                "DMM:STATE MODE=RESISTANCE;RANGE=%s;RREF=%.0f",
                resistance_get_range_name(),
                resistance_get_rref_ohms()
            );

            ble_send_response(response);
        } else {
            ble_send_response(
                "DMM:STATE MODE=VOLTAGE;RANGE=FIXED"
            );
        }

        return;
    }

    /*
     * Switch to voltage mode.
     */
    if (strcmp(command, "DMM:SET_MODE VOLTAGE") == 0) {

        resistance_exit_mode();

        if (!ads1220_config_voltage()) {
            ble_send_response("ERR ADC_CONFIG_FAILED");
            return;
        }

        k_msleep(25);

        current_dmm_mode = DMM_MODE_VOLTAGE;

        ble_send_response(
            "DMM:STATE MODE=VOLTAGE;RANGE=FIXED"
        );

        return;
    }

    /*
     * Switch to resistance mode.
     *
     * resistance_enter_mode() starts at the 10K reference.
     */
    if (strcmp(command, "DMM:SET_MODE RESISTANCE") == 0) {

        if (!resistance_enter_mode()) {
            ble_send_response("ERR ADC_CONFIG_FAILED");
            return;
        }

        current_dmm_mode = DMM_MODE_RESISTANCE;

        char response[96];

        snprintf(
            response,
            sizeof(response),
            "DMM:STATE MODE=RESISTANCE;RANGE=%s;RREF=%.0f",
            resistance_get_range_name(),
            resistance_get_rref_ohms()
        );

        ble_send_response(response);

        return;
    }

    /*
     * Take one DMM measurement.
     */
    if (strcmp(command, "DMM:READ") == 0) {
        char response[96];

        /*
         * Voltage measurement.
         */
        if (current_dmm_mode == DMM_MODE_VOLTAGE) {
            double volts;

            if (!voltage_read(&volts)) {
                ble_send_response("ERR DMM_READ_FAILED");
                return;
            }

            snprintf(
                response,
                sizeof(response),
                "DMM:VALUE %.6f;UNIT=V",
                volts
            );

            ble_send_response(response);
            return;
        }

        /*
         * Resistance measurement.
         *
         * resistance_read() performs autoranging and leaves the
         * TMUX on the range used for the final reading.
         */
        if (current_dmm_mode == DMM_MODE_RESISTANCE) {
            double ohms;

            resistance_result_t result =
                resistance_read(&ohms);

            /*
             * Open circuit is a valid measurement state.
             */
            if (result == RESISTANCE_RESULT_OPEN) {
                snprintf(
                    response,
                    sizeof(response),
                    "DMM:VALUE OL;UNIT=OHM;RANGE=%s;RREF=%.0f",
                    resistance_get_range_name(),
                    resistance_get_rref_ohms()
                );

                ble_send_response(response);
                return;
            }

            /*
             * Actual ADC / measurement failure.
             */
            if (result != RESISTANCE_RESULT_OK) {
                ble_send_response(
                    "ERR DMM_READ_FAILED"
                );
                return;
            }

            /*
             * Normal resistance result.
             */
            snprintf(
                response,
                sizeof(response),
                "DMM:VALUE %.3f;UNIT=OHM;RANGE=%s;RREF=%.0f",
                ohms,
                resistance_get_range_name(),
                resistance_get_rref_ohms()
            );

            ble_send_response(response);
            return;
        }
    }

    /*
     * Controlled software power-down.
     */
    if (strcmp(command, "POWER:SHUTDOWN") == 0) {
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
        led_set_disconnected();
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

    connected_state = true;
    restart_advertising = false;

    printk("BLE connected\n");

    led_set_connected();
}

static void disconnected(
    struct bt_conn *conn,
    uint8_t reason)
{
    ARG_UNUSED(conn);

    connected_state = false;
    restart_advertising = true;

    printk("BLE disconnected: %u\n", reason);

    led_set_disconnected();
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

    connected_state = false;
    restart_advertising = false;
    last_command[0] = '\0';

    led_set_disconnected();

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
    return connected_state;
}