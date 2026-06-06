/*
 * ctap2_cbor.h – CBOR parsing/encoding helpers for CTAP2.
 *
 * Ported from pico-fido (polhenarejos/pico-fido), AGPL-3.0.
 * Adapted for ESP32/ESP-IDF: removed Pico-specific headers; uses
 * espressif__cbor (tinycbor) and mbedtls headers from ESP-IDF.
 */
#ifndef _CTAP2_CBOR_H_
#define _CTAP2_CBOR_H_

#include "cbor.h"
#include "mbedtls/ecp.h"
#include "mbedtls/ecdh.h"

/* -----------------------------------------------------------------------
 * Forward declarations
 * ----------------------------------------------------------------------- */
extern int  cbor_parse(uint8_t cmd, const uint8_t *data, size_t len);
extern int  cbor_get_info(void);
extern int  cbor_reset(void);
extern int  cbor_make_credential(const uint8_t *data, size_t len);
extern int  cbor_get_assertion(const uint8_t *data, size_t len);
extern int  cbor_get_next_assertion(const uint8_t *data, size_t len);
extern void reset_gna_state(void);
extern int  cbor_process(uint8_t last_cmd, const uint8_t *data, size_t len);

extern const uint8_t aaguid[16];
extern const bool _btrue, _bfalse;
#define ptrue  (&_btrue)
#define pfalse (&_bfalse)

/* -----------------------------------------------------------------------
 * CBOR typed string / byte-string containers
 * ----------------------------------------------------------------------- */
typedef struct CborByteString {
    uint8_t *data;
    size_t   len;
    bool     present;
    bool     nofree;
} CborByteString;

typedef struct CborCharString {
    char   *data;
    size_t  len;
    bool    present;
    bool    nofree;
} CborCharString;

/* -----------------------------------------------------------------------
 * Error / check macros
 * ----------------------------------------------------------------------- */
#define CBOR_CHECK(f)                                                   \
    do {                                                                \
        error = (f);                                                    \
        if (error != CborNoError) {                                     \
            goto err;                                                   \
        }                                                               \
    } while (0)

#define CBOR_FREE(x) \
    do { if (x) { free(x); x = NULL; } } while (0)

#define CBOR_ERROR(e) \
    do { error = (e); goto err; } while (0)

#define CBOR_ASSERT(c)                                  \
    do {                                                \
        if (!(c)) { error = CborErrorImproperValue; goto err; } \
    } while (0)

/* -----------------------------------------------------------------------
 * Free CborByteString / CborCharString (heap-allocated by dup_*)
 * ----------------------------------------------------------------------- */
#define CBOR_FREE_BYTE_STRING(v)                        \
    do {                                                \
        if ((v).nofree != true) CBOR_FREE((v).data);    \
        else (v).data = NULL;                           \
        (v).len     = 0;                                \
        (v).present = false;                            \
    } while (0)

/* -----------------------------------------------------------------------
 * Container iteration macros
 * (each macro opens its own C block so loop vars don't collide)
 * ----------------------------------------------------------------------- */
#define CBOR_PARSE_MAP_START(_p, _n)                                    \
    CBOR_ASSERT(cbor_value_is_map(&(_p)) == true);                      \
    CborValue _f##_n;                                                   \
    CBOR_CHECK(cbor_value_enter_container(&(_p), &(_f##_n)));           \
    while (cbor_value_at_end(&(_f##_n)) == false)

#define CBOR_PARSE_ARRAY_START(_p, _n)                                  \
    CBOR_ASSERT(cbor_value_is_array(&(_p)) == true);                    \
    CborValue _f##_n;                                                   \
    CBOR_CHECK(cbor_value_enter_container(&(_p), &(_f##_n)));           \
    while (cbor_value_at_end(&(_f##_n)) == false)

#define CBOR_PARSE_MAP_END(_p, _n)  \
    CBOR_CHECK(cbor_value_leave_container(&(_p), &(_f##_n)))

#define CBOR_PARSE_ARRAY_END(_p, _n)  CBOR_PARSE_MAP_END(_p, _n)

#define CBOR_ADVANCE(_n) CBOR_CHECK(cbor_value_advance(&_f##_n))

/* -----------------------------------------------------------------------
 * Field-get helpers (consume one value from an iterator)
 * ----------------------------------------------------------------------- */
#define CBOR_FIELD_GET_UINT(v, _n)                                      \
    do {                                                                \
        CBOR_ASSERT(cbor_value_is_unsigned_integer(&(_f##_n)) == true); \
        CBOR_CHECK(cbor_value_get_uint64(&(_f##_n), &(v)));             \
        CBOR_CHECK(cbor_value_advance_fixed(&(_f##_n)));                \
    } while (0)

#define CBOR_FIELD_GET_INT(v, _n)                                       \
    do {                                                                \
        CBOR_ASSERT(cbor_value_is_integer(&(_f##_n)) == true);          \
        CBOR_CHECK(cbor_value_get_int64(&(_f##_n), &(v)));              \
        CBOR_CHECK(cbor_value_advance_fixed(&(_f##_n)));                \
    } while (0)

#define CBOR_FIELD_GET_BYTES(v, _n)                                     \
    do {                                                                \
        CBOR_ASSERT(cbor_value_is_byte_string(&(_f##_n)) == true);      \
        CBOR_CHECK(cbor_value_dup_byte_string(&(_f##_n), &(v).data,     \
                                              &(v).len, &(_f##_n)));    \
        (v).present = true;                                             \
    } while (0)

#define CBOR_FIELD_GET_TEXT(v, _n)                                      \
    do {                                                                \
        CBOR_ASSERT(cbor_value_is_text_string(&(_f##_n)) == true);      \
        CBOR_CHECK(cbor_value_dup_text_string(&(_f##_n), &(v).data,     \
                                              &(v).len, &(_f##_n)));    \
        (v).present = true;                                             \
    } while (0)

#define CBOR_FIELD_GET_BOOL(v, _n)                                      \
    do {                                                                \
        CBOR_ASSERT(cbor_value_is_boolean(&(_f##_n)) == true);          \
        bool _bval;                                                     \
        CBOR_CHECK(cbor_value_get_boolean(&(_f##_n), &_bval));          \
        v = (_bval ? ptrue : pfalse);                                   \
        CBOR_CHECK(cbor_value_advance_fixed(&(_f##_n)));                \
    } while (0)

/* Read a text key into a local char buffer _fd<N> of size 64 */
#define CBOR_FIELD_GET_KEY_TEXT(_n)                                     \
    CBOR_ASSERT(cbor_value_is_text_string(&(_f##_n)) == true);          \
    char   _fd##_n[64] = {0};                                           \
    size_t _fdl##_n    = sizeof(_fd##_n);                               \
    CBOR_CHECK(cbor_value_copy_text_string(&(_f##_n), _fd##_n,          \
                                           &_fdl##_n, &(_f##_n)))

/* Conditional key-based value parsers */
#define CBOR_FIELD_KEY_TEXT_VAL_TEXT(_n, _t, _v)                        \
    if (strcmp(_fd##_n, _t) == 0) {                                     \
        CBOR_ASSERT(cbor_value_is_text_string(&_f##_n) == true);        \
        CBOR_CHECK(cbor_value_dup_text_string(&(_f##_n), &(_v).data,    \
                                              &(_v).len, &(_f##_n)));   \
        (_v).present = true; continue;                                  \
    }

#define CBOR_FIELD_KEY_TEXT_VAL_BYTES(_n, _t, _v)                       \
    if (strcmp(_fd##_n, _t) == 0) {                                     \
        CBOR_ASSERT(cbor_value_is_byte_string(&_f##_n) == true);        \
        CBOR_CHECK(cbor_value_dup_byte_string(&(_f##_n), &(_v).data,    \
                                              &(_v).len, &(_f##_n)));   \
        (_v).present = true; continue;                                  \
    }

#define CBOR_FIELD_KEY_TEXT_VAL_INT(_n, _t, _v)                         \
    if (strcmp(_fd##_n, _t) == 0) {                                     \
        CBOR_FIELD_GET_INT(_v, _n); continue;                           \
    }

#define CBOR_FIELD_KEY_TEXT_VAL_UINT(_n, _t, _v)                        \
    if (strcmp(_fd##_n, _t) == 0) {                                     \
        CBOR_FIELD_GET_UINT(_v, _n); continue;                          \
    }

#define CBOR_FIELD_KEY_TEXT_VAL_BOOL(_n, _t, _v)                        \
    if (strcmp(_fd##_n, _t) == 0) {                                     \
        CBOR_FIELD_GET_BOOL(_v, _n); continue;                          \
    }

/* -----------------------------------------------------------------------
 * COSE key encoding
 * ----------------------------------------------------------------------- */
extern CborError COSE_key(mbedtls_ecp_keypair *key,
                          CborEncoder *mapEncoderParent,
                          CborEncoder *mapEncoder);
extern CborError COSE_public_key(int alg,
                                 CborEncoder *mapEncoderParent,
                                 CborEncoder *mapEncoder);
extern CborError COSE_read_key(CborValue *f,
                               int64_t *kty, int64_t *alg, int64_t *crv,
                               CborByteString *kax, CborByteString *kay);

/* -----------------------------------------------------------------------
 * CTAP2 status codes (FIDO2 spec §8.2)
 * Defined here so both cbor_dispatch.c and fido_glue.c share the same values.
 * ----------------------------------------------------------------------- */
#define CTAP2_OK                         0x00
#define CTAP2_ERR_INVALID_CBOR           0x12
#define CTAP2_ERR_MISSING_PARAMETER      0x14
#define CTAP2_ERR_UNSUPPORTED_ALGORITHM  0x26
#define CTAP2_ERR_OPERATION_DENIED       0x27
#define CTAP2_ERR_INVALID_CREDENTIAL     0x22
#define CTAP2_ERR_NO_CREDENTIALS         0x2E
#define CTAP2_ERR_NOT_ALLOWED            0x30
#define CTAP2_ERR_CBOR_UNEXPECTED_TYPE   0x11
#define CTAP2_ERR_PROCESSING             0xF2

/* -----------------------------------------------------------------------
 * PIN/UV token permission bits (subset, for forward compat)
 * ----------------------------------------------------------------------- */
#define PINUVAUTHTOKEN_MC   0x1
#define PINUVAUTHTOKEN_GA   0x2

#endif /* _CTAP2_CBOR_H_ */
