/*
 * Verbatim copy from pico-keys-sdk src/signal.c
 * Copyright (c) 2022 Pol Henarejos. AGPL-3.0.
 *
 * Only change: include path "picokeys.h" (was same in original).
 */

#include "picokeys.h"
#include "signal.h"

static signal_t signals[MAX_SIGNALS] = {0};
static uint8_t  num_signals = 0;

int signal_add(signal_code_t code, signal_flag_t flags, signal_handler_t handler) {
    if (num_signals >= MAX_SIGNALS) {
        return PICOKEYS_ERR_NO_MEMORY;
    }
    if (handler == NULL) {
        return PICOKEYS_ERR_NULL_PARAM;
    }
    signals[num_signals].code    = code;
    signals[num_signals].flags   = flags;
    signals[num_signals].handler = handler;
    num_signals++;
    return PICOKEYS_OK;
}

int signal_remove(signal_code_t code, signal_handler_t handler) {
    for (int i = 0; i < num_signals; i++) {
        if (signals[i].code == code && signals[i].handler == handler) {
            for (int j = i; j < num_signals - 1; j++) {
                signals[j] = signals[j + 1];
            }
            num_signals--;
            return PICOKEYS_OK;
        }
    }
    return PICOKEYS_ERR_FILE_NOT_FOUND;
}

int signal_emit_param(signal_code_t code, void *data) {
    for (int i = 0; i < num_signals; i++) {
        if (signals[i].code == code) {
            int ret = signals[i].handler(code, data);
            if (ret != 0 && (signals[i].flags & SIGNAL_FLAG_ERROR_CONTINUE) == 0) {
                return ret;
            }
        }
    }
    return PICOKEYS_ERR_FILE_NOT_FOUND;
}

int signal_emit(signal_code_t code) {
    return signal_emit_param(code, NULL);
}
