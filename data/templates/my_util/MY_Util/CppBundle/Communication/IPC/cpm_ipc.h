#ifndef CPM_IPC_H
#define CPM_IPC_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct CpmIpcPipe
{
    intptr_t handle;
    intptr_t listenHandle;
    int server;
    int opened;
    char name[256];
} CpmIpcPipe;

void CpmIpc_Init(CpmIpcPipe *pipeObj);
int CpmIpc_CreateServer(CpmIpcPipe *pipeObj, const char *name);
int CpmIpc_WaitClient(CpmIpcPipe *pipeObj, int timeoutMs);
int CpmIpc_DisconnectClient(CpmIpcPipe *pipeObj);
int CpmIpc_Connect(CpmIpcPipe *pipeObj, const char *name, int timeoutMs);
int CpmIpc_Send(CpmIpcPipe *pipeObj, const void *data, size_t size);
int CpmIpc_SendAll(CpmIpcPipe *pipeObj, const void *data, size_t size);
int CpmIpc_Receive(CpmIpcPipe *pipeObj, void *data, size_t size, int timeoutMs);
int CpmIpc_ReceiveExact(CpmIpcPipe *pipeObj, void *data, size_t size, int timeoutMs);
int CpmIpc_SendMessage(CpmIpcPipe *pipeObj, const void *data, uint32_t size);
int CpmIpc_ReceiveMessage(CpmIpcPipe *pipeObj, void *data, size_t capacity, uint32_t *messageSize, int timeoutMs);
int CpmIpc_IsOpen(const CpmIpcPipe *pipeObj);
void CpmIpc_Close(CpmIpcPipe *pipeObj);

#ifdef __cplusplus
}
#endif
#endif
