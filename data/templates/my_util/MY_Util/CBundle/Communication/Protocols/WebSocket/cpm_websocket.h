#ifndef CPM_WEBSOCKET_H
#define CPM_WEBSOCKET_H

#include <stddef.h>
#include <stdint.h>
#include "cpm_socket.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef enum CpmWebSocketOpcode
{
    CPM_WS_CONTINUATION = 0x0,
    CPM_WS_TEXT = 0x1,
    CPM_WS_BINARY = 0x2,
    CPM_WS_CLOSE = 0x8,
    CPM_WS_PING = 0x9,
    CPM_WS_PONG = 0xA
} CpmWebSocketOpcode;

typedef struct CpmWebSocketFrame
{
    CpmWebSocketOpcode opcode;
    int fin;
    size_t payloadSize;
} CpmWebSocketFrame;

typedef struct CpmWebSocket
{
    CpmSocketHandle socketHandle;
    int connected;
    uint32_t maskState;
} CpmWebSocket;

void CpmWebSocket_Init(CpmWebSocket *ws);
int CpmWebSocket_Connect(CpmWebSocket *ws, const char *url, const char *subprotocol, const char *extraHeaders, int timeoutMs);
void CpmWebSocket_Close(CpmWebSocket *ws, uint16_t statusCode, const char *reason);
int CpmWebSocket_Send(CpmWebSocket *ws, CpmWebSocketOpcode opcode, const void *payload, size_t payloadSize);
int CpmWebSocket_SendText(CpmWebSocket *ws, const char *text);
int CpmWebSocket_SendBinary(CpmWebSocket *ws, const void *data, size_t size);
int CpmWebSocket_Ping(CpmWebSocket *ws, const void *payload, size_t payloadSize);
int CpmWebSocket_Pong(CpmWebSocket *ws, const void *payload, size_t payloadSize);
int CpmWebSocket_Receive(CpmWebSocket *ws, CpmWebSocketFrame *frame, void *payload, size_t payloadCapacity, int timeoutMs);
const char *CpmWebSocket_ResultText(int result);

#ifdef __cplusplus
}
#endif
#endif
