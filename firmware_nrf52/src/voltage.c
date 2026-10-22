#include "voltage.h"
#include "ads1220.h"

#include <stdint.h>
#include <stddef.h>

/*
 * EVT1 voltage divider:
 *
 * 12.0 MΩ total upper leg
 * 360 kΩ lower leg
 *
 * Divider ratio:
 *
 * (12.0 MΩ + 360 kΩ) / 360 kΩ
 * = 34.333333...
 */
#define VOLTAGE_DIVIDER_RATIO 34.33333333333333

#define VOLTAGE_OFFSET_CAL (-0.001405)

/*
 * EVT1 voltage calibration.
 *
 * Initial value derived from comparison against the Fluke
 * over approximately 0 V to 30 V.
 *
 * PocketLab was reading slightly high at the upper end,
 * so apply a small gain correction.
 */
#define VOLTAGE_GAIN_CAL 0.999551

/*
 * Display / measurement stabilization.
 *
 * ADS1220 voltage mode is currently running at 20 SPS.
 * Five samples therefore represent about 250 ms.
 */
#define VOLTAGE_FILTER_SAMPLES 5

static double voltage_samples[VOLTAGE_FILTER_SAMPLES];
static size_t voltage_sample_count = 0;
static size_t voltage_sample_index = 0;


/*
 * Add one voltage sample to the moving-average filter.
 *
 * During startup, average only the samples that have
 * actually been collected so we do not artificially
 * pull the first readings toward zero.
 */
static double voltage_filter_update(double sample)
{
    voltage_samples[voltage_sample_index] = sample;

    voltage_sample_index++;

    if (voltage_sample_index >= VOLTAGE_FILTER_SAMPLES) {
        voltage_sample_index = 0;
    }

    if (voltage_sample_count < VOLTAGE_FILTER_SAMPLES) {
        voltage_sample_count++;
    }

    double sum = 0.0;

    for (size_t i = 0; i < voltage_sample_count; i++) {
        sum += voltage_samples[i];
    }

    return sum / (double)voltage_sample_count;
}


bool voltage_read(double *volts)
{
    if (volts == NULL) {
        return false;
    }

    int32_t raw;

    if (!ads1220_read_raw(&raw)) {
        return false;
    }

    /*
     * Convert raw ADS1220 code to ADC input voltage.
     */
    double adc_volts =
        ads1220_raw_to_volts(raw);

    /*
     * Reconstruct voltage at the DMM input using the
     * nominal divider ratio.
     */
    double input_volts =
        adc_volts * VOLTAGE_DIVIDER_RATIO;

    /*
     * Apply EVT1 gain calibration.
     */
    double calibrated_volts =
        (input_volts - VOLTAGE_OFFSET_CAL) *
        VOLTAGE_GAIN_CAL;

    /*
     * Apply a light moving average to stabilize the
     * displayed DC measurement.
     */
    *volts =
        voltage_filter_update(calibrated_volts);

    return true;
}