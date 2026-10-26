#include <zephyr/kernel.h>
#include <zephyr/sys/printk.h>

#include "power.h"
#include "led.h"
#include "ble.h"
#include "ads1220.h"
#include "resistance.h"
#include "board_pins.h"
#include <hal/nrf_gpio.h>

/* Power down after two minutes without a BLE connection. */
#define BLE_DISCONNECT_TIMEOUT_MS 120000LL

int main(void)
{
    power_init();
    /* EVT1: unused P1.05 remains LOW so the old MOSFET gate cannot turn on. */
    nrf_gpio_pin_clear(PIN_LED_R);
    nrf_gpio_cfg_output(PIN_LED_R);
    led_init();
    resistance_init();

    power_5v_enable();
    k_msleep(10);

    power_analog_enable();
    k_msleep(10);

    printk("PocketLab EVT1 startup\n");

    if (ble_init() != 0) {
        printk("BLE startup failed\n");
    }

    if (!ads1220_init()) {
        printk("ADS1220 init failed\n");
    }

    /*
     * The idle timer starts at boot, so a device that is never connected
     * also shuts down. While connected, the timer stays disarmed. An
     * unexpected disconnect starts a fresh two-minute grace period.
     *
     * Keep the final shutdown on the main thread: power_shutdown()
     * disables the rails, releases the power latch, and does not return.
     */
    int64_t disconnected_since_ms = k_uptime_get();
    printk("[POWER] No BLE connection; shutdown in 120 seconds\n");

    while (1) {
        if (ble_is_connected()) {
            disconnected_since_ms = -1;
        } else {
            if (disconnected_since_ms < 0) {
                disconnected_since_ms = k_uptime_get();
                printk("[POWER] BLE disconnected; shutdown in 120 seconds\n");
            }

            if (k_uptime_get() - disconnected_since_ms >= BLE_DISCONNECT_TIMEOUT_MS) {
                printk("[POWER] BLE idle timeout; shutting down\n");
                power_shutdown();
            }
        }

        k_sleep(K_SECONDS(1));
    }
}
