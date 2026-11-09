#include "cpm_lin.h"

#include <string.h>

void CpmLin_DefaultConfig(CpmLinConfig *config)
{
    if (!config) return;
    memset(config, 0, sizeof(*config));
    CpmUart_DefaultConfig(&config->uart);
    config->uart.baudRate = 19200;
    config->uart.dataBits = 8;
    config->uart.parity = CPM_UART_PARITY_NONE;
    config->uart.stopBits = 1;
    config->breakDurationMs = 1;
    config->responseTimeoutMs = 100;
    config->discardHeaderEcho = 0;
}

void CpmLin_Init(CpmLin *lin)
{
    if (!lin) return;
    memset(lin, 0, sizeof(*lin));
    CpmUart_Init(&lin->uart);
    CpmLin_DefaultConfig(&lin->config);
}

int CpmLin_Open(CpmLin *lin, const char *port, const CpmLinConfig *config)
{
    CpmLinConfig local;
    if (!lin || !port) return -1;
    if (!config) { CpmLin_DefaultConfig(&local); config = &local; }
    CpmLin_Close(lin);
    lin->config = *config;
    return CpmUart_OpenConfig(&lin->uart, port, &config->uart);
}

void CpmLin_Close(CpmLin *lin)
{
    if (!lin) return;
    CpmUart_Close(&lin->uart);
    CpmLin_Init(lin);
}

uint8_t CpmLin_ProtectedId(uint8_t frameId)
{
    uint8_t id = (uint8_t)(frameId & 0x3FU);
    uint8_t p0 = (uint8_t)(((id >> 0) ^ (id >> 1) ^ (id >> 2) ^ (id >> 4)) & 1U);
    uint8_t p1 = (uint8_t)(~((id >> 1) ^ (id >> 3) ^ (id >> 4) ^ (id >> 5)) & 1U);
    return (uint8_t)(id | (uint8_t)(p0 << 6) | (uint8_t)(p1 << 7));
}

int CpmLin_ValidateProtectedId(uint8_t protectedId)
{
    return CpmLin_ProtectedId((uint8_t)(protectedId & 0x3FU)) == protectedId;
}

static CpmLinChecksumMode CpmLin_EffectiveMode(uint8_t protectedId, CpmLinChecksumMode mode)
{
    uint8_t id = (uint8_t)(protectedId & 0x3FU);
    if (mode != CPM_LIN_CHECKSUM_AUTO) return mode;
    return (id == 0x3CU || id == 0x3DU) ? CPM_LIN_CHECKSUM_CLASSIC : CPM_LIN_CHECKSUM_ENHANCED;
}

uint8_t CpmLin_Checksum(uint8_t protectedId, const uint8_t *data, size_t dataLength, CpmLinChecksumMode mode)
{
    uint16_t sum = 0;
    size_t i;
    mode = CpmLin_EffectiveMode(protectedId, mode);
    if (mode == CPM_LIN_CHECKSUM_ENHANCED) sum = protectedId;
    for (i = 0; i < dataLength; ++i)
    {
        sum = (uint16_t)(sum + data[i]);
        if (sum > 0xFFU) sum = (uint16_t)((sum & 0xFFU) + 1U);
    }
    return (uint8_t)(~sum);
}

int CpmLin_ValidateFrame(uint8_t protectedId, const uint8_t *data, size_t dataLength, uint8_t checksum, CpmLinChecksumMode mode)
{
    if (!CpmLin_ValidateProtectedId(protectedId)) return 0;
    if (!data && dataLength) return 0;
    return CpmLin_Checksum(protectedId, data, dataLength, mode) == checksum;
}

int CpmLin_SendHeader(CpmLin *lin, uint8_t frameId)
{
    uint8_t header[2];
    int rc;
    if (!lin || !lin->uart.opened || frameId > 0x3FU) return -1;
    rc = CpmUart_SendBreak(&lin->uart, lin->config.breakDurationMs);
    if (rc != 0) return -2;
    header[0] = 0x55U;
    header[1] = CpmLin_ProtectedId(frameId);
    rc = CpmUart_WriteAll(&lin->uart, header, sizeof(header));
    if (rc != (int)sizeof(header)) return -3;
    if (lin->config.discardHeaderEcho)
    {
        uint8_t echo[2];
        (void)CpmUart_ReadExact(&lin->uart, echo, sizeof(echo), lin->config.responseTimeoutMs);
    }
    return 0;
}

int CpmLin_Publish(CpmLin *lin, uint8_t frameId, const uint8_t *data, size_t dataLength, CpmLinChecksumMode mode)
{
    uint8_t checksum;
    uint8_t pid;
    int rc;
    if (!lin || (!data && dataLength) || dataLength > 8U) return -1;
    rc = CpmLin_SendHeader(lin, frameId);
    if (rc != 0) return rc;
    pid = CpmLin_ProtectedId(frameId);
    checksum = CpmLin_Checksum(pid, data, dataLength, mode);
    if (dataLength && CpmUart_WriteAll(&lin->uart, data, dataLength) != (int)dataLength) return -4;
    if (CpmUart_WriteAll(&lin->uart, &checksum, 1U) != 1) return -5;
    return CpmUart_Flush(&lin->uart);
}

int CpmLin_Request(CpmLin *lin, uint8_t frameId, uint8_t *data, size_t dataLength, CpmLinChecksumMode mode, int timeoutMs)
{
    uint8_t checksum;
    uint8_t pid;
    int rc;
    if (!lin || !data || dataLength == 0 || dataLength > 8U) return -1;
    rc = CpmLin_SendHeader(lin, frameId);
    if (rc != 0) return rc;
    if (timeoutMs < 0) timeoutMs = lin->config.responseTimeoutMs;
    rc = CpmUart_ReadExact(&lin->uart, data, dataLength, timeoutMs);
    if (rc != (int)dataLength) return rc >= 0 ? -4 : rc;
    rc = CpmUart_ReadExact(&lin->uart, &checksum, 1U, timeoutMs);
    if (rc != 1) return rc >= 0 ? -5 : rc;
    pid = CpmLin_ProtectedId(frameId);
    return CpmLin_ValidateFrame(pid, data, dataLength, checksum, mode) ? (int)dataLength : -6;
}
