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

bool voltage_read(double *volts)
{
    if (volts == NULL) {
        return false;
    }

    int32_t raw;

    if (!ads1220_read_raw(&raw)) {
        return false;
    }

    double adc_volts = ads1220_raw_to_volts(raw);

    *volts = adc_volts * VOLTAGE_DIVIDER_RATIO;

    return true;
}