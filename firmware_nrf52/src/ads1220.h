#pragma once

#include <stdbool.h>
#include <stdint.h>

bool ads1220_init(void);

bool ads1220_config_voltage(void);
bool ads1220_config_resistance(void);

bool ads1220_read_raw(int32_t *raw);

double ads1220_raw_to_volts(int32_t raw);