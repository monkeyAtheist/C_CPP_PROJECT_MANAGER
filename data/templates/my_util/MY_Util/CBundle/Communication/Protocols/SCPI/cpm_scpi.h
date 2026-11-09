#ifndef CPM_SCPI_H
#define CPM_SCPI_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef int (*CpmScpiWriteFn)(void *context, const void *data, size_t size);
typedef int (*CpmScpiReadFn)(void *context, void *data, size_t size, int timeoutMs);

typedef struct CpmScpi
{
    void *context;
    CpmScpiWriteFn writeFn;
    CpmScpiReadFn readFn;
    char txTerminator[4];
    char rxTerminator[4];
    int timeoutMs;
} CpmScpi;

void CpmScpi_Init(CpmScpi *scpi, void *context, CpmScpiWriteFn writeFn, CpmScpiReadFn readFn);
void CpmScpi_SetTerminators(CpmScpi *scpi, const char *txTerminator, const char *rxTerminator);
void CpmScpi_SetTimeout(CpmScpi *scpi, int timeoutMs);
int CpmScpi_Write(CpmScpi *scpi, const char *command);
int CpmScpi_Query(CpmScpi *scpi, const char *command, char *response, size_t responseSize);
int CpmScpi_QueryInt(CpmScpi *scpi, const char *command, long long *value);
int CpmScpi_QueryDouble(CpmScpi *scpi, const char *command, double *value);
int CpmScpi_QueryBool(CpmScpi *scpi, const char *command, int *value);
int CpmScpi_QueryBinaryBlock(CpmScpi *scpi, const char *command, void *data, size_t capacity, size_t *dataSize);

int CpmScpi_Idn(CpmScpi *scpi, char *response, size_t responseSize);
int CpmScpi_Clear(CpmScpi *scpi);
int CpmScpi_Reset(CpmScpi *scpi);
int CpmScpi_Opc(CpmScpi *scpi, int *complete);
int CpmScpi_SystemError(CpmScpi *scpi, char *response, size_t responseSize);

#ifdef __cplusplus
}
#endif
#endif
