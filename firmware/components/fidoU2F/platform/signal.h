/*
 * Verbatim copy from pico-keys-sdk src/signal.h
 * Copyright (c) 2022 Pol Henarejos. AGPL-3.0.
 */

#ifndef _SIGNAL_H_
#define _SIGNAL_H_

#define MAX_SIGNALS 32

typedef enum {
    SIGNAL_NONE                     = 0,
    SIGNAL_BOOT                     = 1,
    SIGNAL_USB_MOUNTED              = 2,
    SIGNAL_BUTTON_PRESS             = 3,
    SIGNAL_BUTTON_RELEASE           = 4,
    SIGNAL_USER_PRESENCE_REQUEST    = 5,
    SIGNAL_USER_PRESENCE_COMPLETED  = 6,
    SIGNAL_USER_PRESENCE_CANCELLED  = 7,
    SIGNAL_USER_PRESENCE_TIMEOUT    = 8,
} signal_code_t;

typedef enum {
    SIGNAL_FLAG_NONE            = 0x0,
    SIGNAL_FLAG_ERROR_CONTINUE  = 0x1,
} signal_flag_t;

typedef int (*signal_handler_t)(signal_code_t, void *);

typedef struct {
    uint32_t timeout;
} signal_user_presence_request_data_t;

typedef struct {
    signal_code_t    code;
    signal_flag_t    flags;
    signal_handler_t handler;
} signal_t;

#ifdef __cplusplus
extern "C" {
#endif

extern int signal_add(signal_code_t code, signal_flag_t flags, signal_handler_t handler);
extern int signal_remove(signal_code_t code, signal_handler_t handler);
extern int signal_emit_param(signal_code_t code, void *data);
extern int signal_emit(signal_code_t code);

#ifdef __cplusplus
}
#endif

#endif // _SIGNAL_H_
