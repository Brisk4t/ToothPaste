/*
 * Stripped from pico-keys-sdk src/picokeys.h.
 * Copyright (c) 2022 Pol Henarejos. AGPL-3.0.
 *
 * Removed: #include "file.h", #include "flash.h" (deferred – flash filesystem
 *          not yet ported; required for CTAP2 resident keys).
 */

#ifndef _PICOKEYS_H_
#define _PICOKEYS_H_

#define MBEDTLS_ALLOW_PRIVATE_ACCESS

#include <stdbool.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#include "debug.h"

#ifdef _MSC_VER
#define PACK(__Declaration__) __pragma(pack(push,1)) __Declaration__ __pragma(pack(pop))
#else
#define PACK(__Declaration__) __Declaration__ __attribute__((__packed__))
#endif

#if !defined(MIN)
#if defined(_MSC_VER)
#define MIN(a,b) (((a)<(b))?(a):(b))
#else
#define MIN(a, b) \
    ({ __typeof__ (a) _a = (a); \
       __typeof__ (b) _b = (b); \
       _a < _b ? _a : _b; })
#endif
#endif

#if !defined(MAX)
#if defined(_MSC_VER)
#define MAX(a,b) (((a)>(b))?(a):(b))
#else
#define MAX(a, b) \
    ({ __typeof__ (a) _a = (a); \
       __typeof__ (b) _b = (b); \
       _a > _b ? _a : _b; })
#endif
#endif

#ifdef _MSC_VER
#define WEAK
#else
#define WEAK __attribute__((weak))
#endif

/* --- Big-endian byte utilities --- */

static inline uint16_t make_uint16_be(uint8_t b1, uint8_t b2) { return (uint16_t)((b1 << 8) | b2); }
static inline uint16_t make_uint16_le(uint8_t b1, uint8_t b2) { return (uint16_t)((b2 << 8) | b1); }
static inline uint16_t get_uint16_be(const uint8_t *b) { return make_uint16_be(b[0], b[1]); }
static inline uint16_t get_uint16_le(const uint8_t *b) { return make_uint16_le(b[0], b[1]); }
static inline uint8_t  put_uint16_be(uint16_t n, uint8_t *b) { *b++ = (n >> 8) & 0xff; *b = n & 0xff; return 2; }
static inline uint8_t  put_uint16_le(uint16_t n, uint8_t *b) { *b++ = n & 0xff; *b = (n >> 8) & 0xff; return 2; }

static inline uint32_t make_uint32_be(uint8_t b1, uint8_t b2, uint8_t b3, uint8_t b4) {
    return ((uint32_t)b1 << 24) | ((uint32_t)b2 << 16) | ((uint32_t)b3 << 8) | b4;
}
static inline uint32_t get_uint32_be(const uint8_t *b) { return make_uint32_be(b[0], b[1], b[2], b[3]); }
static inline uint8_t  put_uint32_be(uint32_t n, uint8_t *b) {
    *b++ = (n >> 24) & 0xff; *b++ = (n >> 16) & 0xff; *b++ = (n >> 8) & 0xff; *b = n & 0xff; return 4;
}

static inline uint32_t make_uint32_le(uint8_t b1, uint8_t b2, uint8_t b3, uint8_t b4) {
    return ((uint32_t)b4 << 24) | ((uint32_t)b3 << 16) | ((uint32_t)b2 << 8) | b1;
}
static inline uint32_t get_uint32_le(const uint8_t *b) { return make_uint32_le(b[0], b[1], b[2], b[3]); }
static inline uint8_t  put_uint32_le(uint32_t n, uint8_t *b) {
    *b++ = n & 0xff; *b++ = (n >> 8) & 0xff; *b++ = (n >> 16) & 0xff; *b = (n >> 24) & 0xff; return 4;
}

/* --- Error codes --- */

#define PICOKEYS_OK                     0
#define PICOKEYS_ERR_NO_MEMORY         -1000
#define PICOKEYS_ERR_MEMORY_FATAL      -1001
#define PICOKEYS_ERR_NULL_PARAM        -1002
#define PICOKEYS_ERR_FILE_NOT_FOUND    -1003
#define PICOKEYS_ERR_BLOCKED           -1004
#define PICOKEYS_NO_LOGIN              -1005
#define PICOKEYS_EXEC_ERROR            -1006
#define PICOKEYS_WRONG_LENGTH          -1007
#define PICOKEYS_WRONG_DATA            -1008
#define PICOKEYS_WRONG_DKEK            -1009
#define PICOKEYS_WRONG_SIGNATURE       -1010
#define PICOKEYS_WRONG_PADDING         -1011
#define PICOKEYS_VERIFICATION_FAILED   -1012

#define PICOKEYS_CHECK(x) do { ret = (x); if (ret != PICOKEYS_OK) goto err; } while (0)

/* Implemented in u2f_presence.cpp */
#ifdef __cplusplus
extern "C" {
#endif
extern bool is_req_button_pending(void);
#ifdef __cplusplus
}
#endif

/* Optional callback: set by app to handle physical button presses */
extern int (*button_pressed_cb)(uint8_t);

#endif /* _PICOKEYS_H_ */
