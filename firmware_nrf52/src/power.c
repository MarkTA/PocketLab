#include "power.h"
#include "board_pins.h"

#include <zephyr/kernel.h>
#include <hal/nrf_gpio.h>

void power_init(void)
{
    /* Outputs */
    nrf_gpio_cfg_output(PIN_POWER_HOLD);
    nrf_gpio_cfg_output(PIN_5V_EN);
    nrf_gpio_cfg_output(PIN_ANALOG_PWR_EN);

    /*
     * BQ24074 status outputs are open-drain and active-low.
     * The PCB already provides pull-ups to 3V3, but enabling the
     * MCU pull-ups as well gives us a defined state during bring-up.
     */
    nrf_gpio_cfg_input(PIN_BQ_PGOOD, NRF_GPIO_PIN_PULLUP);
    nrf_gpio_cfg_input(PIN_BQ_CHG, NRF_GPIO_PIN_PULLUP);

    /*
     * Immediately latch main power on.
     */
    power_hold_enable();

    /*
     * Leave downstream supplies off until explicitly enabled.
     */
    power_5v_disable();
    power_analog_disable();
}

void power_hold_enable(void)
{
    nrf_gpio_pin_set(PIN_POWER_HOLD);
}

void power_hold_disable(void)
{
    nrf_gpio_pin_clear(PIN_POWER_HOLD);
}

void power_5v_enable(void)
{
    nrf_gpio_pin_set(PIN_5V_EN);
}

void power_5v_disable(void)
{
    nrf_gpio_pin_clear(PIN_5V_EN);
}

void power_analog_enable(void)
{
    nrf_gpio_pin_set(PIN_ANALOG_PWR_EN);
}

void power_analog_disable(void)
{
    nrf_gpio_pin_clear(PIN_ANALOG_PWR_EN);
}

bool power_usb_present(void)
{
    /*
     * BQ24074 PGOOD is active-low:
     * LOW  = valid USB/input power present
     * HIGH = no valid input power
     */
    return nrf_gpio_pin_read(PIN_BQ_PGOOD) == 0;
}

bool power_is_charging(void)
{
    /*
     * BQ24074 CHG is active-low:
     * LOW  = charging
     * HIGH = not charging
     */
    return nrf_gpio_pin_read(PIN_BQ_CHG) == 0;
}

void power_shutdown(void)
{
    /*
     * Shut down downstream supplies first.
     */
    power_analog_disable();
    power_5v_disable();

    /*
     * Give the rails a moment to settle before removing main power.
     */
    k_msleep(20);

    /*
     * Release the power latch.
     * Once this goes LOW, MAIN_PWR_EN should fall and the MCU
     * will lose power.
     */
    power_hold_disable();

    /*
     * We should never meaningfully return from here because
     * the MCU is about to lose power.
     */
    while (1) {
        k_sleep(K_FOREVER);
    }
}
