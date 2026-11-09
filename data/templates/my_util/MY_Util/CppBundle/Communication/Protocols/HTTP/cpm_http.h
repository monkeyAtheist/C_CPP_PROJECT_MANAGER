#ifndef CPM_HTTP_H
#define CPM_HTTP_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct CpmHttpUrl
{
    char host[256];
    uint16_t port;
    char path[1024];
} CpmHttpUrl;

typedef struct CpmHttpResponse
{
    int statusCode;
    char reason[96];
    char contentType[128];
    long long contentLength;
    int chunked;
    int connectionClose;
    size_t bodySize;
} CpmHttpResponse;

int CpmHttp_ParseUrl(const char *url, CpmHttpUrl *parsed);
int CpmHttp_Request(const char *method,
                    const char *url,
                    const char *extraHeaders,
                    const void *requestBody,
                    size_t requestBodySize,
                    void *responseBody,
                    size_t responseBodyCapacity,
                    CpmHttpResponse *response,
                    int timeoutMs);
int CpmHttp_Get(const char *url, void *body, size_t capacity, CpmHttpResponse *response, int timeoutMs);
int CpmHttp_Post(const char *url, const char *contentType, const void *body, size_t bodySize,
                 void *responseBody, size_t responseCapacity, CpmHttpResponse *response, int timeoutMs);
const char *CpmHttp_ResultText(int result);

#ifdef __cplusplus
}
#endif
#endif
