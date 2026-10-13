#pragma once

#include <hal/nrf_gpio.h>

/* Power */
#define PIN_POWER_HOLD      NRF_GPIO_PIN_MAP(0, 23)
#define PIN_5V_EN           NRF_GPIO_PIN_MAP(1, 3)
#define PIN_ANALOG_PWR_EN   NRF_GPIO_PIN_MAP(1, 7)
#define PIN_ANALOG_PGOOD_N  NRF_GPIO_PIN_MAP(1, 4)

/* Relay */
#define PIN_MODE_RELAY_EN   NRF_GPIO_PIN_MAP(0, 19)

/* ADS1220 */
#define PIN_ADC_CS          NRF_GPIO_PIN_MAP(1, 12)
#define PIN_ADC_SCLK        NRF_GPIO_PIN_MAP(0, 27)
#define PIN_ADC_MOSI        NRF_GPIO_PIN_MAP(0, 8)
#define PIN_ADC_MISO        NRF_GPIO_PIN_MAP(0, 6)
#define PIN_ADC_DRDY        NRF_GPIO_PIN_MAP(1, 14)

/* Resistance mux */
#define PIN_MUX_A0          NRF_GPIO_PIN_MAP(1, 11)
#define PIN_MUX_EN          NRF_GPIO_PIN_MAP(1, 13)
#define PIN_MUX_A1          NRF_GPIO_PIN_MAP(1, 15)

/* I2C / module */
#define PIN_I2C_SCL         NRF_GPIO_PIN_MAP(0, 22)
#define PIN_I2C_SDA         NRF_GPIO_PIN_MAP(0, 24)
#define PIN_MODULE_INT_N    NRF_GPIO_PIN_MAP(0, 26)

/* RGB LED */
#define PIN_LED_R  NRF_GPIO_PIN_MAP(1, 5)
#define PIN_LED_G  NRF_GPIO_PIN_MAP(1, 6)
#define PIN_LED_B  NRF_GPIO_PIN_MAP(1, 1)

/* Charger status */
#define PIN_BQ_CHG          NRF_GPIO_PIN_MAP(0, 25)
#define PIN_BQ_PGOOD        NRF_GPIO_PIN_MAP(1, 2)