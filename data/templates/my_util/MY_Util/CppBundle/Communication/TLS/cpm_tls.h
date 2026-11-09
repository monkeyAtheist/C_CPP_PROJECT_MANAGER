#ifndef CPM_TLS_H
#define CPM_TLS_H
#include <stddef.h>
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif

typedef struct CpmTlsConfig {
    int verifyPeer;
    const char *caFile;
    const char *caPath;
    const char *clientCertificateFile;
    const char *clientPrivateKeyFile;
    const char *serverName;
    int minimumTlsVersion; /* 12 or 13; 0 keeps backend default. */
} CpmTlsConfig;

typedef struct CpmTlsClient {
    void *context;
    void *session;
    void *bio;
    int connected;
} CpmTlsClient;

void CpmTls_DefaultConfig(CpmTlsConfig *config);
void CpmTls_Init(CpmTlsClient *client);
int CpmTls_IsAvailable(void);
const char *CpmTls_BackendName(void);
int CpmTls_Connect(CpmTlsClient *client, const char *host, uint16_t port, const CpmTlsConfig *config, int timeoutMs);
void CpmTls_Close(CpmTlsClient *client);
int CpmTls_Write(CpmTlsClient *client, const void *data, size_t size);
int CpmTls_Read(CpmTlsClient *client, void *data, size_t size, int timeoutMs);
int CpmTls_ReadExact(CpmTlsClient *client, void *data, size_t size, int timeoutMs);
int CpmTls_Query(CpmTlsClient *client, const void *txData, size_t txSize, void *rxData, size_t rxCapacity, int timeoutMs);
int CpmTls_PeerSubject(CpmTlsClient *client, char *buffer, size_t bufferSize);
int CpmTls_Cipher(CpmTlsClient *client, char *buffer, size_t bufferSize);
const char *CpmTls_LastErrorText(void);

#ifdef __cplusplus
}
#endif
#endif
