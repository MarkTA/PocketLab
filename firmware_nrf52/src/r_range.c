#include <zephyr/kernel.h>
#include <zephyr/sys/printk.h>
#include <hal/nrf_gpio.h>
#include <stdint.h>

/* ---------- Power ---------- */

#define POWER_HOLD_PIN      NRF_GPIO_PIN_MAP(0, 23)
#define FIVE_V_EN_PIN       NRF_GPIO_PIN_MAP(1, 3)
#define ANALOG_PWR_EN_PIN   NRF_GPIO_PIN_MAP(1, 7)

/* ---------- Relay ---------- */

#define MODE_RELAY_EN_PIN   NRF_GPIO_PIN_MAP(0, 19)

/* ---------- TMUX ---------- */

#define MUX_A0_PIN          NRF_GPIO_PIN_MAP(1, 11)
#define MUX_EN_PIN          NRF_GPIO_PIN_MAP(1, 13)
#define MUX_A1_PIN          NRF_GPIO_PIN_MAP(1, 15)

/* ---------- ADS1220 ---------- */

#define ADS_CS_PIN          NRF_GPIO_PIN_MAP(1, 12)
#define ADS_SCLK_PIN        NRF_GPIO_PIN_MAP(0, 27)
#define ADS_MOSI_PIN        NRF_GPIO_PIN_MAP(0, 8)
#define ADS_MISO_PIN        NRF_GPIO_PIN_MAP(0, 6)
#define ADS_DRDY_PIN        NRF_GPIO_PIN_MAP(1, 14)

#define ADS_RESET           0x06
#define ADS_START_SYNC      0x08
#define ADS_RDATA           0x10
#define ADS_RREG            0x20
#define ADS_WREG            0x40

#define ADC_FS              8388608.0f

struct resistance_range {
    uint8_t a1;
    uint8_t a0;
    float rref;
    const char *name;
};

static const struct resistance_range ranges[] = {
    {0, 0,   10000.0f, "10 kOhm"},
    {0, 1,  100000.0f, "100 kOhm"},
    {1, 0,  360000.0f, "360 kOhm"},
    {1, 1, 1000000.0f, "1 MOhm"},
};

static void spi_delay(void)
{
    k_busy_wait(2);
}

/* ADS1220 SPI mode 1 */
static uint8_t ads_spi_transfer(uint8_t tx)
{
    uint8_t rx = 0;

    for (int bit = 7; bit >= 0; bit--) {

        if (tx & (1U << bit))
            nrf_gpio_pin_set(ADS_MOSI_PIN);
        else
            nrf_gpio_pin_clear(ADS_MOSI_PIN);

        nrf_gpio_pin_set(ADS_SCLK_PIN);
        spi_delay();

        nrf_gpio_pin_clear(ADS_SCLK_PIN);

        rx <<= 1;

        if (nrf_gpio_pin_read(ADS_MISO_PIN))
            rx |= 1;

        spi_delay();
    }

    return rx;
}

static void ads_command(uint8_t command)
{
    nrf_gpio_pin_clear(ADS_CS_PIN);
    spi_delay();

    ads_spi_transfer(command);

    spi_delay();
    nrf_gpio_pin_set(ADS_CS_PIN);
}

static void ads_write_reg(uint8_t reg, uint8_t value)
{
    nrf_gpio_pin_clear(ADS_CS_PIN);
    spi_delay();

    ads_spi_transfer(ADS_WREG | (reg << 2));
    ads_spi_transfer(value);

    spi_delay();
    nrf_gpio_pin_set(ADS_CS_PIN);
}

static int32_t ads_read_conversion(void)
{
    uint32_t raw;

    nrf_gpio_pin_clear(ADS_CS_PIN);
    spi_delay();

    ads_spi_transfer(ADS_RDATA);

    uint8_t b2 = ads_spi_transfer(0x00);
    uint8_t b1 = ads_spi_transfer(0x00);
    uint8_t b0 = ads_spi_transfer(0x00);

    nrf_gpio_pin_set(ADS_CS_PIN);

    raw = ((uint32_t)b2 << 16) |
          ((uint32_t)b1 << 8) |
          b0;

    if (raw & 0x800000)
        raw |= 0xFF000000;

    return (int32_t)raw;
}

static void select_range(const struct resistance_range *range)
{
    /* Disconnect all RREFs first */
    nrf_gpio_pin_clear(MUX_EN_PIN);

    k_sleep(K_MSEC(5));

    if (range->a1)
        nrf_gpio_pin_set(MUX_A1_PIN);
    else
        nrf_gpio_pin_clear(MUX_A1_PIN);

    if (range->a0)
        nrf_gpio_pin_set(MUX_A0_PIN);
    else
        nrf_gpio_pin_clear(MUX_A0_PIN);

    k_sleep(K_MSEC(5));

    /* Connect selected RREF */
    nrf_gpio_pin_set(MUX_EN_PIN);

    /* Allow relay / mux / RC network to settle */
    k_sleep(K_MSEC(50));
}

static int32_t get_sample(void)
{
    ads_command(ADS_START_SYNC);

    int timeout = 200;

    while (nrf_gpio_pin_read(ADS_DRDY_PIN) && timeout > 0) {
        k_sleep(K_MSEC(1));
        timeout--;
    }

    if (timeout == 0)
        return INT32_MIN;

    return ads_read_conversion();
}

int main(void)
{
    /* ---------- Power ---------- */

    nrf_gpio_cfg_output(POWER_HOLD_PIN);
    nrf_gpio_pin_set(POWER_HOLD_PIN);

    nrf_gpio_cfg_output(FIVE_V_EN_PIN);
    nrf_gpio_pin_set(FIVE_V_EN_PIN);

    nrf_gpio_cfg_output(ANALOG_PWR_EN_PIN);
    nrf_gpio_pin_set(ANALOG_PWR_EN_PIN);

    k_sleep(K_MSEC(100));

    /* ---------- Relay ---------- */

    nrf_gpio_cfg_output(MODE_RELAY_EN_PIN);
    nrf_gpio_pin_set(MODE_RELAY_EN_PIN);   /* Resistance mode */

    /* ---------- TMUX ---------- */

    nrf_gpio_cfg_output(MUX_A0_PIN);
    nrf_gpio_cfg_output(MUX_A1_PIN);
    nrf_gpio_cfg_output(MUX_EN_PIN);

    nrf_gpio_pin_clear(MUX_EN_PIN);

    /* ---------- ADS1220 ---------- */

    nrf_gpio_cfg_output(ADS_CS_PIN);
    nrf_gpio_cfg_output(ADS_SCLK_PIN);
    nrf_gpio_cfg_output(ADS_MOSI_PIN);

    nrf_gpio_cfg_input(ADS_MISO_PIN, NRF_GPIO_PIN_NOPULL);
    nrf_gpio_cfg_input(ADS_DRDY_PIN, NRF_GPIO_PIN_NOPULL);

    nrf_gpio_pin_set(ADS_CS_PIN);
    nrf_gpio_pin_clear(ADS_SCLK_PIN);
    nrf_gpio_pin_clear(ADS_MOSI_PIN);

    k_sleep(K_MSEC(100));

    ads_command(ADS_RESET);
    k_sleep(K_MSEC(2));

    /*
     * AIN1 - AIN2
     * Gain = 1
     * PGA bypass
     */
    ads_write_reg(0, 0x31);

    /* 20 SPS, single-shot */
    ads_write_reg(1, 0x00);

    /* External REF0, 50/60-Hz rejection */
    ads_write_reg(2, 0x50);

    /* IDACs off */
    ads_write_reg(3, 0x00);

    printk("\nPocketLab resistance range test\n");
    printk("================================\n");

    while (1) {

        for (int r = 0; r < 4; r++) {

            const struct resistance_range *range = &ranges[r];

            select_range(range);

            printk("\n");
            printk(">>> RREF = %s   A1:A0 = %d%d <<<\n",
                   range->name,
                   range->a1,
                   range->a0);

            /*
             * Discard first conversion after switching ranges.
             */
            get_sample();

            /*
             * About 9 readings at 1-second intervals.
             */
            for (int i = 0; i < 9; i++) {

                int32_t raw = get_sample();

                if (raw == INT32_MIN) {
                    printk("DRDY TIMEOUT\n");
                    k_sleep(K_SECONDS(1));
                    continue;
                }

                /*
                 * Treat extremely near-full-scale as open.
                 */
                if (raw >= 8346665) {  /* ~99.5% FS */
                    printk("RAW: %ld   R: OL\n", (long)raw);
                }
                else if (raw > 0) {

                    float resistance =
                        range->rref *
                        ((float)raw /
                        (ADC_FS - (float)raw));

                    if (resistance >= 1000000.0f) {

                        int whole = (int)(resistance / 1000000.0f);
                        int frac =
                            (int)((resistance / 1000.0f)) % 1000;

                        printk("RAW: %ld   R: %d.%03d MOhm\n",
                               (long)raw,
                               whole,
                               frac);
                    }
                    else if (resistance >= 1000.0f) {

                        int whole = (int)(resistance / 1000.0f);
                        int frac =
                            ((int)resistance) % 1000;

                        printk("RAW: %ld   R: %d.%03d kOhm\n",
                               (long)raw,
                               whole,
                               frac);
                    }
                    else {

                        printk("RAW: %ld   R: %d Ohm\n",
                               (long)raw,
                               (int)resistance);
                    }
                }
                else {
                    printk("RAW: %ld   R: invalid\n", (long)raw);
                }

                k_sleep(K_SECONDS(1));
            }
        }
    }
}