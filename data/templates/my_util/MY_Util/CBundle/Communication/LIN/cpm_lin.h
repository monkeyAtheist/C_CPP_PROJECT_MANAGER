#ifndef CPM_LIN_H
#define CPM_LIN_H

#include <stddef.h>
#include <stdint.h>
#include "cpm_uart.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef enum CpmLinChecksumMode
{
    CPM_LIN_CHECKSUM_AUTO = 0,
    CPM_LIN_CHECKSUM_CLASSIC,
    CPM_LIN_CHECKSUM_ENHANCED
} CpmLinChecksumMode;

typedef struct CpmLinConfig
{
    CpmUartConfig uart;
    int breakDurationMs;
    int responseTimeoutMs;
    int discardHeaderEcho;
} CpmLinConfig;

typedef struct CpmLin
{
    CpmUart uart;
    CpmLinConfig config;
} CpmLin;

void CpmLin_DefaultConfig(CpmLinConfig *config);
void CpmLin_Init(CpmLin *lin);
int CpmLin_Open(CpmLin *lin, const char *port, const CpmLinConfig *config);
void CpmLin_Close(CpmLin *lin);

uint8_t CpmLin_ProtectedId(uint8_t frameId);
int CpmLin_ValidateProtectedId(uint8_t protectedId);
uint8_t CpmLin_Checksum(uint8_t protectedId, const uint8_t *data, size_t dataLength, CpmLinChecksumMode mode);
int CpmLin_ValidateFrame(uint8_t protectedId, const uint8_t *data, size_t dataLength, uint8_t checksum, CpmLinChecksumMode mode);

int CpmLin_SendHeader(CpmLin *lin, uint8_t frameId);
int CpmLin_Publish(CpmLin *lin, uint8_t frameId, const uint8_t *data, size_t dataLength, CpmLinChecksumMode mode);
int CpmLin_Request(CpmLin *lin, uint8_t frameId, uint8_t *data, size_t dataLength, CpmLinChecksumMode mode, int timeoutMs);

#ifdef __cplusplus
}
#endif
#endif
