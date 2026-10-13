#pragma once

#include <stdbool.h>

void power_init(void);

void power_hold_enable(void);
void power_hold_disable(void);

void power_5v_enable(void);
void power_5v_disable(void);

void power_analog_enable(void);
void power_analog_disable(void);

bool power_usb_present(void);
bool power_is_charging(void);

void power_shutdown(void);