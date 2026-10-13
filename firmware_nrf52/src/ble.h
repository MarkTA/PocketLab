#pragma once

#include <stdbool.h>

int ble_init(void);
bool ble_is_connected(void);

/* Send a UTF-8 response through the PocketLab TX characteristic. */
int ble_send_response(const char *response);