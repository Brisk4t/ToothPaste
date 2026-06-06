/*
 * Adapted from pico-keys-sdk src/apdu.h
 * Copyright (c) 2022 Pol Henarejos. AGPL-3.0.
 *
 * Changes vs upstream:
 *  - Removed CCID-specific SW macros (SW_LOGICAL_CHANNEL_NOT_SUPPORTED etc.
 *    are kept because U2F re-uses some of them via SW_CONDITIONS_NOT_SATISFIED).
 *  - No structural changes; all types and macros are identical.
 */

#ifndef _APDU_H_
#define _APDU_H_

#include "picokeys.h"

#ifdef __cplusplus
extern "C" {
#endif

/* -----------------------------------------------------------------------
 * Application registration
 * ----------------------------------------------------------------------- */
typedef struct app {
    const uint8_t *aid;
    int (*process_apdu)(void);
    int (*select_aid)(struct app *, uint8_t);
    int (*unload)(void);
} app_t;

extern bool app_exists(const uint8_t *aid, size_t aid_len);
extern int  register_app(int (*)(app_t *, uint8_t), const uint8_t *);
extern int  select_app(const uint8_t *aid, size_t aid_len);

typedef struct cmd {
    uint8_t ins;
    int (*cmd_handler)(void);
} cmd_t;

extern uint8_t  num_apps;
extern app_t    apps[16];
extern app_t   *current_app;

/* -----------------------------------------------------------------------
 * APDU structure
 * ----------------------------------------------------------------------- */
PACK(struct apdu {
    uint8_t  *header;
    uint32_t  nc;
    uint32_t  ne;
    uint8_t  *data;
    uint16_t  sw;
    uint8_t  *rdata;
    uint16_t  rlen;
});

#define CLA(a)  a.header[0]
#define INS(a)  a.header[1]
#define P1(a)   a.header[2]
#define P2(a)   a.header[3]

#define res_APDU        (apdu.rdata)
#define res_APDU_size   (apdu.rlen)

extern struct apdu apdu;

extern uint16_t set_res_sw(uint8_t sw1, uint8_t sw2);
extern int      process_apdu(void);
extern uint16_t apdu_process(uint8_t itf, const uint8_t *buffer, uint16_t buffer_size);
extern void     apdu_finish(void);
extern uint16_t apdu_next(void);
extern void    *apdu_thread(void *);
extern int      bulk_cmd(int (*cmd)(void));

/* -----------------------------------------------------------------------
 * ISO 7816-4 status word macros
 * ----------------------------------------------------------------------- */
#define SW_BYTES_REMAINING_00()             set_res_sw(0x61, 0x00)
#define SW_WARNING_STATE_UNCHANGED()        set_res_sw(0x62, 0x00)
#define SW_WARNING_CORRUPTED()              set_res_sw(0x62, 0x81)
#define SW_WARNING_EOF()                    set_res_sw(0x62, 0x82)
#define SW_WARNING_EF_DEACTIVATED()         set_res_sw(0x62, 0x83)
#define SW_WARNING_WRONG_FCI()              set_res_sw(0x62, 0x84)
#define SW_WARNING_EF_TERMINATED()          set_res_sw(0x62, 0x85)
#define SW_WARNING_NOINFO()                 set_res_sw(0x63, 0x00)
#define SW_WARNING_FILLUP()                 set_res_sw(0x63, 0x81)
#define SW_EXEC_ERROR()                     set_res_sw(0x64, 0x00)
#define SW_MEMORY_FAILURE()                 set_res_sw(0x65, 0x81)
#define SW_SECURE_MESSAGE_EXEC_ERROR()      set_res_sw(0x66, 0x00)
#define SW_WRONG_LENGTH()                   set_res_sw(0x67, 0x00)
#define SW_WRONG_DATA()                     set_res_sw(0x67, 0x00)
#define SW_LOGICAL_CHANNEL_NOT_SUPPORTED()  set_res_sw(0x68, 0x81)
#define SW_SECURE_MESSAGING_NOT_SUPPORTED() set_res_sw(0x68, 0x82)
#define SW_COMMAND_INCOMPATIBLE()           set_res_sw(0x69, 0x81)
#define SW_SECURITY_STATUS_NOT_SATISFIED()  set_res_sw(0x69, 0x82)
#define SW_PIN_BLOCKED()                    set_res_sw(0x69, 0x83)
#define SW_DATA_INVALID()                   set_res_sw(0x69, 0x84)
#define SW_CONDITIONS_NOT_SATISFIED()       set_res_sw(0x69, 0x85)
#define SW_COMMAND_NOT_ALLOWED()            set_res_sw(0x69, 0x86)
#define SW_SECURE_MESSAGING_MISSING_DO()    set_res_sw(0x69, 0x87)
#define SW_SECURE_MESSAGING_INCORRECT_DO()  set_res_sw(0x69, 0x88)
#define SW_APPLET_SELECT_FAILED()           set_res_sw(0x69, 0x99)
#define SW_INCORRECT_PARAMS()               set_res_sw(0x6A, 0x80)
#define SW_FUNC_NOT_SUPPORTED()             set_res_sw(0x6A, 0x81)
#define SW_FILE_NOT_FOUND()                 set_res_sw(0x6A, 0x82)
#define SW_RECORD_NOT_FOUND()               set_res_sw(0x6A, 0x83)
#define SW_FILE_FULL()                      set_res_sw(0x6A, 0x84)
#define SW_WRONG_NE()                       set_res_sw(0x6A, 0x85)
#define SW_INCORRECT_P1P2()                 set_res_sw(0x6A, 0x86)
#define SW_WRONG_NC()                       set_res_sw(0x6A, 0x87)
#define SW_REFERENCE_NOT_FOUND()            set_res_sw(0x6A, 0x88)
#define SW_FILE_EXISTS()                    set_res_sw(0x6A, 0x89)
#define SW_WRONG_P1P2()                     set_res_sw(0x6B, 0x00)
#define SW_CORRECT_LENGTH_00()              set_res_sw(0x6C, 0x00)
#define SW_INS_NOT_SUPPORTED()              set_res_sw(0x6D, 0x00)
#define SW_CLA_NOT_SUPPORTED()              set_res_sw(0x6E, 0x00)
#define SW_UNKNOWN()                        set_res_sw(0x6F, 0x00)
#define SW_OK()                             set_res_sw(0x90, 0x00)

#ifdef __cplusplus
}
#endif

#endif /* _APDU_H_ */
