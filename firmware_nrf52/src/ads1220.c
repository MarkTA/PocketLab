#include "ads1220.h"
#include "board_pins.h"

#include <hal/nrf_gpio.h>

#include <zephyr/kernel.h>
#include <zephyr/sys/printk.h>

#include <stddef.h>
#include <stdint.h>

/* -------------------------------------------------------------------------- */
/* ADS1220 commands                                                           */
/* -------------------------------------------------------------------------- */

#define ADS1220_CMD_RESET       0x06
#define ADS1220_CMD_START_SYNC  0x08
#define ADS1220_CMD_RDATA       0x10

/*
 * RREG command:
 *
 * 0010 rr nn
 *
 * Start at register 0 and read 4 registers:
 *
 * rr = 00
 * nn = 11  -> 4 registers
 *
 * = 0x23
 */
#define ADS1220_CMD_RREG_4      0x23

/*
 * WREG, starting register 0, write four registers.
 *
 * = 0x43
 */
#define ADS1220_CMD_WREG_4      0x43

/* -------------------------------------------------------------------------- */
/* Conversion constants                                                       */
/* -------------------------------------------------------------------------- */

#define ADS1220_VREF_VOLTS      2.048
#define ADS1220_FULL_SCALE      8388608.0   /* 2^23 */

/*
 * 20 SPS gives a conversion period of approximately 50 ms.
 * Allow plenty of margin for startup/debugging.
 */
#define ADS1220_DRDY_TIMEOUT_MS 250

/*
 * Bit-banged SPI clock timing.
 *
 * 1 us half-period ~= 500 kHz SPI.
 * Plenty fast for the ADS1220 and easy to debug.
 */
#define ADS1220_SPI_DELAY_US    1

/* -------------------------------------------------------------------------- */
/* GPIO / SPI helpers                                                         */
/* -------------------------------------------------------------------------- */

static void spi_delay(void)
{
    k_busy_wait(ADS1220_SPI_DELAY_US);
}

static void ads_select(void)
{
    nrf_gpio_pin_clear(PIN_ADC_CS);
    spi_delay();
}

static void ads_deselect(void)
{
    spi_delay();
    nrf_gpio_pin_set(PIN_ADC_CS);
}

/*
 * ADS1220 uses SPI mode 1:
 *
 * CPOL = 0
 * CPHA = 1
 *
 * Clock idles LOW.
 * Data is sampled on the falling edge.
 */
static uint8_t spi_transfer_byte(uint8_t tx)
{
    uint8_t rx = 0;

    for (int bit = 7; bit >= 0; bit--) {

        /*
         * Present MOSI before the active clock pulse.
         */
        if (tx & (1U << bit)) {
            nrf_gpio_pin_set(PIN_ADC_MOSI);
        } else {
            nrf_gpio_pin_clear(PIN_ADC_MOSI);
        }

        /*
         * Leading edge.
         */
        nrf_gpio_pin_set(PIN_ADC_SCLK);
        spi_delay();

        /*
         * Trailing edge: ADS1220 mode-1 data is valid here.
         */
        nrf_gpio_pin_clear(PIN_ADC_SCLK);

        if (nrf_gpio_pin_read(PIN_ADC_MISO)) {
            rx |= (1U << bit);
        }

        spi_delay();
    }

    return rx;
}

static void ads_command(uint8_t command)
{
    ads_select();

    spi_transfer_byte(command);

    ads_deselect();
}

/* -------------------------------------------------------------------------- */
/* Register access                                                            */
/* -------------------------------------------------------------------------- */

static void ads_write_registers(
    uint8_t reg0,
    uint8_t reg1,
    uint8_t reg2,
    uint8_t reg3)
{
    ads_select();

    spi_transfer_byte(ADS1220_CMD_WREG_4);

    spi_transfer_byte(reg0);
    spi_transfer_byte(reg1);
    spi_transfer_byte(reg2);
    spi_transfer_byte(reg3);

    ads_deselect();
}

static void ads_read_registers(uint8_t regs[4])
{
    ads_select();

    spi_transfer_byte(ADS1220_CMD_RREG_4);

    regs[0] = spi_transfer_byte(0x00);
    regs[1] = spi_transfer_byte(0x00);
    regs[2] = spi_transfer_byte(0x00);
    regs[3] = spi_transfer_byte(0x00);

    ads_deselect();
}

/* -------------------------------------------------------------------------- */
/* DRDY                                                                       */
/* -------------------------------------------------------------------------- */

static bool wait_for_drdy(void)
{
    int64_t start = k_uptime_get();

    while (nrf_gpio_pin_read(PIN_ADC_DRDY)) {

        if ((k_uptime_get() - start) >= ADS1220_DRDY_TIMEOUT_MS) {
            printk("ADS1220 DRDY timeout\n");
            return false;
        }

        k_msleep(1);
    }

    return true;
}

/* -------------------------------------------------------------------------- */
/* Initialization                                                             */
/* -------------------------------------------------------------------------- */

bool ads1220_init(void)
{
    /*
     * SPI outputs.
     */
    nrf_gpio_cfg_output(PIN_ADC_CS);
    nrf_gpio_cfg_output(PIN_ADC_SCLK);
    nrf_gpio_cfg_output(PIN_ADC_MOSI);

    /*
     * SPI / status inputs.
     */
    nrf_gpio_cfg_input(PIN_ADC_MISO, NRF_GPIO_PIN_NOPULL);
    nrf_gpio_cfg_input(PIN_ADC_DRDY, NRF_GPIO_PIN_NOPULL);

    /*
     * SPI mode 1 idle state:
     * CPOL = 0
     * CPHA = 1
     */
    nrf_gpio_pin_set(PIN_ADC_CS);
    nrf_gpio_pin_clear(PIN_ADC_SCLK);
    nrf_gpio_pin_clear(PIN_ADC_MOSI);

    /*
     * Allow the analog rails / ADC supply to settle.
     */
    k_msleep(1);

    /*
     * Reset the ADS1220.
     */
    ads_command(ADS1220_CMD_RESET);

    /*
     * Datasheet requires a short delay after RESET before register access.
     */
    k_msleep(1);

    /*
     * Default startup mode for PocketLab is voltage measurement.
     *
     * This configures:
     *   AIN0 - AIN2
     *   gain = 1
     *   PGA bypass
     *   internal 2.048 V reference
     *   20 SPS
     *   single-shot
     */
    if (!ads1220_config_voltage()) {
        printk("ADS1220 voltage configuration failed\n");
        return false;
    }

    printk("ADS1220 initialized\n");

    return true;
}

/* -------------------------------------------------------------------------- */
/* Conversion                                                                 */
/* -------------------------------------------------------------------------- */

bool ads1220_read_raw(int32_t *raw)
{
    if (raw == NULL) {
        return false;
    }

    /*
     * In single-shot mode, START/SYNC begins one conversion.
     */
    ads_command(ADS1220_CMD_START_SYNC);

    if (!wait_for_drdy()) {
        return false;
    }

    /*
     * Read the 24-bit conversion result.
     */
    ads_select();

    spi_transfer_byte(ADS1220_CMD_RDATA);

    uint8_t b0 = spi_transfer_byte(0x00);
    uint8_t b1 = spi_transfer_byte(0x00);
    uint8_t b2 = spi_transfer_byte(0x00);

    ads_deselect();

    int32_t code =
        ((int32_t)b0 << 16) |
        ((int32_t)b1 << 8)  |
        ((int32_t)b2);

    /*
     * Sign extend 24-bit two's-complement result to int32_t.
     */
    if (code & 0x00800000) {
        code |= (int32_t)0xFF000000;
    }

    *raw = code;

    return true;
}

/* -------------------------------------------------------------------------- */
/* Conversion helper                                                          */
/* -------------------------------------------------------------------------- */

double ads1220_raw_to_volts(int32_t raw)
{
    return ((double)raw / ADS1220_FULL_SCALE) *
           ADS1220_VREF_VOLTS;
}

/* -------------------------------------------------------------------------- */
/* Configure helpers                                                          */
/* -------------------------------------------------------------------------- */

static bool ads_configure(
    uint8_t reg0,
    uint8_t reg1,
    uint8_t reg2,
    uint8_t reg3)
{
    ads_write_registers(
        reg0,
        reg1,
        reg2,
        reg3
    );

    k_msleep(1);

    uint8_t regs[4] = {0};

    ads_read_registers(regs);

    printk(
        "ADS1220 regs: %02X %02X %02X %02X\n",
        regs[0],
        regs[1],
        regs[2],
        regs[3]
    );

    if (regs[0] != reg0 ||
        regs[1] != reg1 ||
        regs[2] != reg2 ||
        regs[3] != reg3) {

        printk("ADS1220 register verification FAILED\n");
        return false;
    }

    return true;
}

bool ads1220_config_voltage(void)
{
    /*
     * CONFIG0 = 0x11
     *
     * MUX = 0001 : AIN0 - AIN2
     * gain = 1
     * PGA bypass
     *
     * CONFIG2:
     * internal 2.048 V reference
     */
    return ads_configure(
        0x11,
        0x00,
        0x00,
        0x00
    );
}

bool ads1220_config_resistance(void)
{
    /*
     * CONFIG0 = 0x31
     *
     * MUX = 0011 : AIN1 - AIN2
     * gain = 1
     * PGA bypass
     *
     * CONFIG2 = 0x40
     *
     * VREF = external REF0
     */
    return ads_configure(
        0x31,
        0x00,
        0x40,
        0x00
    );
}