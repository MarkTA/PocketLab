#include <zephyr/kernel.h>
#include <zephyr/sys/printk.h>

#include "power.h"
#include "led.h"
#include "ble.h"
#include "ads1220.h"
#include "resistance.h"

int main(void)
{
    power_init();
    led_init();
    resistance_init();

    power_5v_enable();
    k_msleep(10);

    power_analog_enable();
    k_msleep(10);

    printk("PocketLab EVT1 startup\n");

    if (ble_init() != 0) {
        printk("BLE startup failed\n");
        led_set_red();
    }

    if (!ads1220_init()) {
        printk("ADS1220 init failed\n");
    }

    // k_msleep(5 * 60 * 1000);
    //     power_shutdown();

    while (1) {
        k_sleep(K_SECONDS(1));
    }
}