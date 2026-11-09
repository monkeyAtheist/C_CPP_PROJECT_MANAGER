#ifndef CPM_SCPI_TRANSPORT_H
#define CPM_SCPI_TRANSPORT_H
#include "cpm_scpi.h"
#include "cpm_socket.h"
#include "cpm_visa.h"
#ifdef __cplusplus
extern "C" {
#endif
typedef struct CpmScpiTcpTransport { CpmSocketHandle socketHandle; } CpmScpiTcpTransport;
typedef struct CpmScpiVisaTransport { CpmVisaSession *session; } CpmScpiVisaTransport;
void CpmScpiTcp_Init(CpmScpiTcpTransport *transport);
int CpmScpiTcp_Connect(CpmScpiTcpTransport *transport,const char *host,uint16_t port,int timeoutMs);
void CpmScpiTcp_Close(CpmScpiTcpTransport *transport);
void CpmScpi_BindTcp(CpmScpi *scpi,CpmScpiTcpTransport *transport);
void CpmScpi_BindVisa(CpmScpi *scpi,CpmScpiVisaTransport *transport,CpmVisaSession *session);
#ifdef __cplusplus
}
#endif
#endif
