#include "led.h"
#include "board_pins.h"

#include <hal/nrf_gpio.h>

static void led_all_off(void)
{
    
    nrf_gpio_pin_set(PIN_LED_G);
    nrf_gpio_pin_set(PIN_LED_B);
}

void led_init(void)
{
    
    nrf_gpio_cfg_output(PIN_LED_G);
    nrf_gpio_cfg_output(PIN_LED_B);

    led_all_off();
}

void led_off(void)
{
    led_all_off();
}

void led_set_green(void)
{
    led_all_off();
    nrf_gpio_pin_clear(PIN_LED_G);
}

void led_set_blue(void)
{
    led_all_off();
    nrf_gpio_pin_clear(PIN_LED_B);
}

void led_set_advertising(void)
{
    led_set_blue();
}

void led_set_connected(void)
{
    led_set_green();
}

void led_set_disconnected(void)
{
    led_all_off();
}