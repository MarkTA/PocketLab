#include "resistance.h"

#include "ads1220.h"
#include "board_pins.h"

#include <hal/nrf_gpio.h>
#include <zephyr/kernel.h>
#include <zephyr/sys/printk.h>
#include <zephyr/sys/util.h>

#include <math.h>
#include <stdint.h>

/* -------------------------------------------------------------------------- */
/* EVT1 resistance hardware                                                   */
/* -------------------------------------------------------------------------- */

/*
 * TMUX1109 range selection:
 *
 * A1 A0
 * 0  0  -> 10 kΩ
 * 0  1  -> 100 kΩ
 * 1  0  -> 360 kΩ
 * 1  1  -> 1 MΩ
 */

typedef struct {
    double rref_ohms;
    uint8_t a1;
    uint8_t a0;
    const char *name;
} resistance_range_config_t;

static const resistance_range_config_t ranges[] = {
    {
        .rref_ohms = 10000.0,
        .a1 = 0,
        .a0 = 0,
        .name = "10K",
    },
    {
        .rref_ohms = 100000.0,
        .a1 = 0,
        .a0 = 1,
        .name = "100K",
    },
    {
        .rref_ohms = 360000.0,
        .a1 = 1,
        .a0 = 0,
        .name = "360K",
    },
    {
        .rref_ohms = 1000000.0,
        .a1 = 1,
        .a0 = 1,
        .name = "1M",
    },
};

#define RANGE_COUNT ARRAY_SIZE(ranges)

/*
 * ADS1220 positive full-scale code = 2^23.
 */
#define ADS1220_POSITIVE_FULL_SCALE 8388608.0

/*
 * Allow relay / mux / analog node to settle after switching.
 */
#define RESISTANCE_SETTLE_MS 25

/*
 * Preferred ADC operating range.
 *
 * ratio = Rdut / (Rdut + Rref)
 *
 * Keeping the ratio reasonably close to 0.5 gives good
 * sensitivity without operating too close to either rail.
 */
#define AUTORANGE_LOW_RATIO  0.30
#define AUTORANGE_HIGH_RATIO 0.70

/*
 * On the largest 1 MΩ reference range, a ratio above this
 * value is considered open circuit.
 *
 * EVT1 open-circuit testing produced approximately
 * 0.9914 - 0.9920, so 0.98 leaves comfortable margin.
 */
#define OPEN_MAX_RANGE_RATIO 0.98

/*
 * Current hardware range.
 *
 * This persists between measurements so subsequent readings
 * generally require fewer range changes.
 */
static resistance_range_t current_range =
    RESISTANCE_RANGE_10K;

/* -------------------------------------------------------------------------- */
/* Range control                                                              */
/* -------------------------------------------------------------------------- */

static void resistance_select_range(
    resistance_range_t range)
{
    const resistance_range_config_t *cfg =
        &ranges[range];

    /*
     * Disconnect the reference resistor before changing
     * TMUX address lines.
     */
    nrf_gpio_pin_clear(PIN_MUX_EN);

    /*
     * Set A0.
     */
    if (cfg->a0) {
        nrf_gpio_pin_set(PIN_MUX_A0);
    } else {
        nrf_gpio_pin_clear(PIN_MUX_A0);
    }

    /*
     * Set A1.
     */
    if (cfg->a1) {
        nrf_gpio_pin_set(PIN_MUX_A1);
    } else {
        nrf_gpio_pin_clear(PIN_MUX_A1);
    }

    current_range = range;

    /*
     * Reconnect selected reference resistor.
     */
    nrf_gpio_pin_set(PIN_MUX_EN);

    /*
     * Allow mux and measurement node to settle.
     */
    k_msleep(RESISTANCE_SETTLE_MS);

    printk(
        "Resistance range: %s RREF=%.0f ohm\n",
        cfg->name,
        cfg->rref_ohms
    );
}

/* -------------------------------------------------------------------------- */
/* Initialization                                                             */
/* -------------------------------------------------------------------------- */

void resistance_init(void)
{
    nrf_gpio_cfg_output(PIN_MODE_RELAY_EN);

    nrf_gpio_cfg_output(PIN_MUX_EN);
    nrf_gpio_cfg_output(PIN_MUX_A0);
    nrf_gpio_cfg_output(PIN_MUX_A1);

    /*
     * Safe startup state:
     *
     * relay       -> voltage mode
     * resistance -> disconnected
     * TMUX address -> 10K
     */
    nrf_gpio_pin_clear(PIN_MODE_RELAY_EN);

    nrf_gpio_pin_clear(PIN_MUX_EN);
    nrf_gpio_pin_clear(PIN_MUX_A0);
    nrf_gpio_pin_clear(PIN_MUX_A1);

    current_range = RESISTANCE_RANGE_10K;

    printk("Resistance hardware initialized\n");
}

/* -------------------------------------------------------------------------- */
/* Mode control                                                               */
/* -------------------------------------------------------------------------- */

bool resistance_enter_mode(void)
{
    /*
     * Disconnect resistance excitation while configuring
     * the measurement path.
     */
    nrf_gpio_pin_clear(PIN_MUX_EN);

    /*
     * Begin each new resistance session at 10 kΩ.
     */
    nrf_gpio_pin_clear(PIN_MUX_A0);
    nrf_gpio_pin_clear(PIN_MUX_A1);

    current_range = RESISTANCE_RANGE_10K;

    /*
     * Switch relay into resistance mode:
     *
     * DMM_HI -> OHMS_SENSE
     * +2V5A  -> OHMS_EXC_2V5
     */
    nrf_gpio_pin_set(PIN_MODE_RELAY_EN);

    /*
     * Configure ADS1220 for resistance measurement:
     *
     * AIN1 - AIN2
     * Gain 1
     * PGA bypass
     * External REF0
     * Single-shot
     */
    if (!ads1220_config_resistance()) {
        printk("Resistance ADS1220 config failed\n");

        /*
         * Return hardware to safe voltage state.
         */
        nrf_gpio_pin_clear(PIN_MUX_EN);
        nrf_gpio_pin_clear(PIN_MODE_RELAY_EN);

        return false;
    }

    /*
     * Connect initial 10 kΩ reference resistor.
     */
    nrf_gpio_pin_set(PIN_MUX_EN);

    /*
     * Relay + mux + analog settling.
     */
    k_msleep(RESISTANCE_SETTLE_MS);

    printk(
        "Resistance mode: autorange, starting at 10K\n"
    );

    return true;
}

void resistance_exit_mode(void)
{
    /*
     * Remove resistance excitation first.
     */
    nrf_gpio_pin_clear(PIN_MUX_EN);

    /*
     * Return relay to voltage measurement state.
     */
    nrf_gpio_pin_clear(PIN_MODE_RELAY_EN);

    /*
     * Return TMUX address to 10 kΩ default.
     */
    nrf_gpio_pin_clear(PIN_MUX_A0);
    nrf_gpio_pin_clear(PIN_MUX_A1);

    current_range = RESISTANCE_RANGE_10K;
}

/* -------------------------------------------------------------------------- */
/* Measurement                                                                */
/* -------------------------------------------------------------------------- */

resistance_result_t resistance_read(double *ohms)
{
    if (ohms == NULL) {
        return RESISTANCE_RESULT_ERROR;
    }

    /*
     * There are four hardware ranges.
     *
     * Starting from any range, four measurements are
     * sufficient to reach and measure on the opposite end.
     */
    for (int attempt = 0;
         attempt < (int)RANGE_COUNT;
         attempt++) {

        int32_t raw;

        if (!ads1220_read_raw(&raw)) {
            printk("Resistance ADC read failed\n");
            return RESISTANCE_RESULT_ERROR;
        }

        /*
         * A true short should ideally produce raw = 0.
         *
         * ADC offset/noise can push this slightly negative.
         * Negative resistance has no physical meaning here,
         * so clamp it to 0 Ω.
         *
         * EVT1 short testing produced values such as:
         *
         * raw = -76
         * raw = -136
         */
        if (raw <= 0) {
            *ohms = 0.0;

            printk(
                "Resistance short circuit "
                "raw=%ld -> 0 ohm\n",
                (long)raw
            );

            return RESISTANCE_RESULT_OK;
        }

        const double code =
            (double)raw;

        const double ratio =
            code /
            ADS1220_POSITIVE_FULL_SCALE;

        printk(
            "Resistance raw=%ld "
            "ratio=%.6f "
            "range=%s "
            "RREF=%.0f\n",
            (long)raw,
            ratio,
            ranges[current_range].name,
            ranges[current_range].rref_ohms
        );

        /*
         * OPEN CIRCUIT DETECTION
         *
         * Only declare OL once we've reached the largest
         * reference resistor.
         *
         * On smaller ranges, a near-full-scale result simply
         * means the DUT is too large for that range and we
         * should step upward.
         *
         * EVT1 open circuit measurements on the 1 MΩ range
         * are approximately ratio = 0.9914 - 0.9920.
         */
        if ((current_range == RESISTANCE_RANGE_1M) &&
            (ratio >= OPEN_MAX_RANGE_RATIO)) {

            printk(
                "Resistance open circuit "
                "raw=%ld ratio=%.6f\n",
                (long)raw,
                ratio
            );

            return RESISTANCE_RESULT_OPEN;
        }

        /*
         * ADC reading is too high.
         *
         * Move to the next larger reference resistor.
         */
        if ((ratio > AUTORANGE_HIGH_RATIO) &&
            (current_range <
             RESISTANCE_RANGE_1M)) {

            printk(
                "Resistance autorange: stepping up\n"
            );

            resistance_select_range(
                (resistance_range_t)
                (current_range + 1)
            );

            continue;
        }

        /*
         * ADC reading is too low.
         *
         * Move to the next smaller reference resistor.
         */
        if ((ratio < AUTORANGE_LOW_RATIO) &&
            (current_range >
             RESISTANCE_RANGE_10K)) {

            printk(
                "Resistance autorange: stepping down\n"
            );

            resistance_select_range(
                (resistance_range_t)
                (current_range - 1)
            );

            continue;
        }

        /*
         * Selected range is suitable.
         *
         * Ratiometric equation:
         *
         *             raw
         * ratio = -----------
         *             2^23
         *
         *
         *               ratio
         * Rdut = Rref * -------
         *              1-ratio
         */
        const double rref =
            ranges[current_range].rref_ohms;

        const double resistance =
            rref *
            ratio /
            (1.0 - ratio);

        if (!isfinite(resistance) ||
            resistance < 0.0) {

            printk(
                "Resistance calculation invalid\n"
            );

            return RESISTANCE_RESULT_ERROR;
        }

        *ohms = resistance;

        printk(
            "Resistance R=%.3f ohm "
            "range=%s "
            "RREF=%.0f\n",
            resistance,
            ranges[current_range].name,
            rref
        );

        return RESISTANCE_RESULT_OK;
    }

    /*
     * Autoranging should always settle within four
     * conversions. Reaching this point indicates something
     * unexpected happened.
     */
    printk("Resistance autorange failed\n");

    return RESISTANCE_RESULT_ERROR;
}

/* -------------------------------------------------------------------------- */
/* Fixed-range continuity measurement                                          */
/* -------------------------------------------------------------------------- */

resistance_result_t resistance_read_continuity(double *ohms)
{
    if (ohms == NULL || current_range != RESISTANCE_RANGE_10K) {
        return RESISTANCE_RESULT_ERROR;
    }

    int32_t raw;
    if (!ads1220_read_raw(&raw)) {
        return RESISTANCE_RESULT_ERROR;
    }

    /* Small negative ADC offsets are expected when the probes are shorted. */
    if (raw <= 0) {
        *ohms = 0.0;
        return RESISTANCE_RESULT_OK;
    }

    const double ratio = (double)raw / ADS1220_POSITIVE_FULL_SCALE;
    if (ratio >= OPEN_MAX_RANGE_RATIO) {
        return RESISTANCE_RESULT_OPEN;
    }

    const double resistance = 10000.0 * ratio / (1.0 - ratio);
    if (!isfinite(resistance) || resistance < 0.0) {
        return RESISTANCE_RESULT_ERROR;
    }

    *ohms = resistance;
    return RESISTANCE_RESULT_OK;
}

/* -------------------------------------------------------------------------- */
/* Range information                                                          */
/* -------------------------------------------------------------------------- */

resistance_range_t resistance_get_range(void)
{
    return current_range;
}

double resistance_get_rref_ohms(void)
{
    return ranges[current_range].rref_ohms;
}

const char *resistance_get_range_name(void)
{
    return ranges[current_range].name;
}