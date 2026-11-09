#ifndef CPM_RS485_H
#define CPM_RS485_H

#include <stddef.h>
#include <stdint.h>
#include "cpm_uart.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct CpmRs485Config
{
    CpmUartConfig uart;
    int manualDirection;      /* 1: drive RTS around writes, 0: adapter/driver auto direction. */
    int rtsActiveHigh;        /* Manual RTS transmit level. */
    uint32_t preTransmitDelayUs;
    uint32_t postTransmitDelayUs;
    int tryLinuxKernelMode;   /* Request TIOCSRS485 when available. */
} CpmRs485Config;

typedef struct CpmRs485
{
    CpmUart uart;
    CpmRs485Config config;
    int kernelModeEnabled;
} CpmRs485;

void CpmRs485_DefaultConfig(CpmRs485Config *config);
void CpmRs485_Init(CpmRs485 *bus);
int CpmRs485_Open(CpmRs485 *bus, const char *port, const CpmRs485Config *config);
void CpmRs485_Close(CpmRs485 *bus);
int CpmRs485_Write(CpmRs485 *bus, const void *data, size_t size);
int CpmRs485_Read(CpmRs485 *bus, void *data, size_t size, int timeoutMs);
int CpmRs485_ReadExact(CpmRs485 *bus, void *data, size_t size, int timeoutMs);
int CpmRs485_Transceive(CpmRs485 *bus, const void *txData, size_t txSize,
                        void *rxData, size_t rxCapacity, int responseTimeoutMs);
int CpmRs485_SetDirection(CpmRs485 *bus, int transmit);

#ifdef __cplusplus
}
#endif
#endif
