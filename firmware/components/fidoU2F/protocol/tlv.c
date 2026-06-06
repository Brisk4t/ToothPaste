/*
 * Verbatim copy from pico-keys-sdk src/tlv.c
 * Copyright (c) 2022 Pol Henarejos. AGPL-3.0.
 *
 * Only change: include path "picokeys.h" (was same in original).
 */

#include "picokeys.h"
#include "tlv.h"

int tlv_ctx_init(uint8_t *data, uint16_t len, tlv_ctx_t *ctx) {
    if (!ctx) {
        return PICOKEYS_ERR_NULL_PARAM;
    }
    ctx->data = data;
    ctx->len = len;
    return PICOKEYS_OK;
}

int tlv_ctx_clear(tlv_ctx_t *ctx) {
    ctx->data = NULL;
    ctx->len = 0;
    return PICOKEYS_OK;
}

uint16_t tlv_len(tlv_ctx_t *ctx) {
    if (ctx->data && ctx->len > 0) {
        return ctx->len;
    }
    return 0;
}

uint32_t tlv_get_uint(tlv_ctx_t *ctx) {
    uint32_t d = ctx->data[0];
    for (uint16_t lt = 1; lt < MIN(ctx->len, sizeof(uint32_t)); lt++) {
        d <<= 8;
        d |= ctx->data[lt];
    }
    return d;
}

uint16_t tlv_len_tag(uint16_t tag, uint16_t len) {
    uint16_t ret = 1 + tlv_format_len(len, NULL) + len;
    if (tag > 0x00ff) {
        return ret + 1;
    }
    return ret;
}

uint8_t tlv_format_len(uint16_t len, uint8_t *out) {
    if (len < 128) {
        if (out) { *out = (uint8_t)len; }
        return 1;
    }
    else if (len < 256) {
        if (out) { *out++ = 0x81; *out++ = (uint8_t)len; }
        return 2;
    }
    if (out) { *out++ = 0x82; put_uint16_be(len, out); }
    return 3;
}

int tlv_walk(const tlv_ctx_t *ctxi, uint8_t **p, uint16_t *tag, uint16_t *tag_len, uint8_t **data) {
    if (!p) {
        return 0;
    }
    if (!*p) {
        *p = (uint8_t *)ctxi->data;
    }
    if (*p - ctxi->data >= ctxi->len) {
        return 0;
    }
    uint16_t tg = 0x0, tgl = 0;
    tg = *(*p)++;
    if ((tg & 0x1f) == 0x1f) {
        tg <<= 8;
        tg |= *(*p)++;
    }
    tgl = *(*p)++;
    if (tgl == 0x82) {
        tgl  = (uint16_t)(*(*p)++ << 8);
        tgl |= *(*p)++;
    }
    else if (tgl == 0x81) {
        tgl = *(*p)++;
    }
    if (tag)     { *tag = tg; }
    if (tag_len) { *tag_len = tgl; }
    if (data)    { *data = *p; }
    *p = *p + tgl;
    return 1;
}

bool tlv_find_tag(const tlv_ctx_t *ctxi, uint16_t itag, tlv_ctx_t *ctxo) {
    uint16_t tag = 0x0, tlen = 0;
    uint8_t *p = NULL, *tdata = NULL;
    while (tlv_walk(ctxi, &p, &tag, &tlen, &tdata)) {
        if (itag == tag) {
            if (ctxo != NULL) {
                ctxo->data = tdata;
                ctxo->len  = tlen;
            }
            return true;
        }
    }
    return false;
}
