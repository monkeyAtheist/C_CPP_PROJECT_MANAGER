#ifndef CPM_UART_H
#define CPM_UART_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef enum CpmUartParity
{
    CPM_UART_PARITY_NONE = 0,
    CPM_UART_PARITY_ODD,
    CPM_UART_PARITY_EVEN,
    CPM_UART_PARITY_MARK,
    CPM_UART_PARITY_SPACE
} CpmUartParity;

typedef enum CpmUartFlowControl
{
    CPM_UART_FLOW_NONE = 0,
    CPM_UART_FLOW_RTS_CTS,
    CPM_UART_FLOW_XON_XOFF
} CpmUartFlowControl;

typedef struct CpmUartConfig
{
    int baudRate;
    int dataBits;
    CpmUartParity parity;
    int stopBits; /* 1 or 2. */
    CpmUartFlowControl flowControl;
    int readTimeoutMs;
    int writeTimeoutMs;
    int dtrEnabled;
    int rtsEnabled;
} CpmUartConfig;

typedef struct CpmUart
{
    intptr_t handle;
    int opened;
    CpmUartConfig config;
} CpmUart;

void CpmUart_DefaultConfig(CpmUartConfig *config);
void CpmUart_Init(CpmUart *uart);
int CpmUart_OpenConfig(CpmUart *uart, const char *port, const CpmUartConfig *config);
int CpmUart_Open(CpmUart *uart, const char *port, int baudrate, int dataBits, char parity, int stopBits);
int CpmUart_Configure(CpmUart *uart, const CpmUartConfig *config);
void CpmUart_Close(CpmUart *uart);
int CpmUart_IsOpen(const CpmUart *uart);

int CpmUart_Write(CpmUart *uart, const void *data, size_t size);
int CpmUart_WriteAll(CpmUart *uart, const void *data, size_t size);
int CpmUart_WriteText(CpmUart *uart, const char *text);
int CpmUart_Read(CpmUart *uart, void *data, size_t size, int timeoutMs);
int CpmUart_ReadExact(CpmUart *uart, void *data, size_t size, int timeoutMs);
int CpmUart_ReadUntil(CpmUart *uart, char *buffer, size_t bufferSize, const char *terminator, int timeoutMs);
int CpmUart_ReadLine(CpmUart *uart, char *buffer, size_t bufferSize, int timeoutMs);

int CpmUart_BytesAvailable(CpmUart *uart);
int CpmUart_Purge(CpmUart *uart, int purgeRx, int purgeTx);
int CpmUart_Flush(CpmUart *uart);
int CpmUart_SetDtr(CpmUart *uart, int enabled);
int CpmUart_SetRts(CpmUart *uart, int enabled);
int CpmUart_SendBreak(CpmUart *uart, int durationMs);
const char *CpmUart_ResultText(int result);

#ifdef __cplusplus
}
#endif
#endif
