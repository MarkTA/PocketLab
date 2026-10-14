#pragma once

#include <stdbool.h>

/* -------------------------------------------------------------------------- */
/* Resistance ranges                                                          */
/* -------------------------------------------------------------------------- */

typedef enum {
    RESISTANCE_RANGE_10K = 0,
    RESISTANCE_RANGE_100K,
    RESISTANCE_RANGE_360K,
    RESISTANCE_RANGE_1M,
} resistance_range_t;

/* -------------------------------------------------------------------------- */
/* Resistance measurement results                                             */
/* -------------------------------------------------------------------------- */

typedef enum {
    RESISTANCE_RESULT_OK = 0,
    RESISTANCE_RESULT_OPEN,
    RESISTANCE_RESULT_ERROR,
} resistance_result_t;

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

void resistance_init(void);

bool resistance_enter_mode(void);

void resistance_exit_mode(void);

resistance_result_t resistance_read(double *ohms);

/* Single fixed-10K ADC conversion for fast, autonomous continuity detection.
 * Caller must hold the DMM/ADC mutex (owned by ble.c). */
resistance_result_t resistance_read_continuity(double *ohms);

resistance_range_t resistance_get_range(void);

double resistance_get_rref_ohms(void);

const char *resistance_get_range_name(void);