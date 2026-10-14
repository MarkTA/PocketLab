#pragma once

#include <stdbool.h>
#include <stdint.h>

bool ads1220_init(void);

bool ads1220_config_voltage(void);
bool ads1220_config_resistance(void);
/* Fixed 10K resistance path, normal-mode 600 SPS single-shot.
 * Only select this configuration when the continuity worker owns the ADC. */
bool ads1220_config_continuity(void);

bool ads1220_read_raw(int32_t *raw);

double ads1220_raw_to_volts(int32_t raw);