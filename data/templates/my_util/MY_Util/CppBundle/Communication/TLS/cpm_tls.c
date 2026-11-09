#if !defined(_WIN32)
#define _POSIX_C_SOURCE 200809L
#endif
#include "cpm_tls.h"
#include <stdio.h>
#include <string.h>
#include <time.h>

#if defined(CPM_TLS_USE_OPENSSL) && !defined(CPM_TLS_DISABLE_OPENSSL) && defined(__has_include)
# if __has_include(<openssl/ssl.h>) && __has_include(<openssl/err.h>)
#  define CPM_TLS_HAVE_OPENSSL 1
# endif
#endif
#ifndef CPM_TLS_HAVE_OPENSSL
#define CPM_TLS_HAVE_OPENSSL 0
#endif

#if CPM_TLS_HAVE_OPENSSL
#include <openssl/ssl.h>
#include <openssl/err.h>
#if defined(_WIN32)
#include <winsock2.h>
#else
#include <sys/select.h>
#include <sys/socket.h>
#include <unistd.h>
#endif
#endif

static char g_error[512];
static void set_error(const char *s){snprintf(g_error,sizeof(g_error),"%s",s?s:"TLS error");}

void CpmTls_DefaultConfig(CpmTlsConfig *c){if(!c)return;memset(c,0,sizeof(*c));c->verifyPeer=1;c->minimumTlsVersion=12;}
void CpmTls_Init(CpmTlsClient *c){if(c)memset(c,0,sizeof(*c));}
const char *CpmTls_LastErrorText(void){return g_error[0]?g_error:"No TLS error";}
int CpmTls_IsAvailable(void){return CPM_TLS_HAVE_OPENSSL?1:0;}
const char *CpmTls_BackendName(void){return CPM_TLS_HAVE_OPENSSL?"OpenSSL":"Unavailable (OpenSSL headers/runtime not detected at build time)";}

#if CPM_TLS_HAVE_OPENSSL
static void ssl_error(const char *prefix){unsigned long e=ERR_get_error();char b[256]={0};if(e)ERR_error_string_n(e,b,sizeof(b));snprintf(g_error,sizeof(g_error),"%s%s%s",prefix?prefix:"TLS",e?": ":"",e?b:"");}
static int set_timeout_fd(int fd,int timeoutMs){
#if defined(_WIN32)
 DWORD t=(DWORD)(timeoutMs<0?0:timeoutMs);return setsockopt((SOCKET)fd,SOL_SOCKET,SO_RCVTIMEO,(const char*)&t,sizeof(t))==0&&setsockopt((SOCKET)fd,SOL_SOCKET,SO_SNDTIMEO,(const char*)&t,sizeof(t))==0?0:-1;
#else
 struct timeval tv;tv.tv_sec=timeoutMs/1000;tv.tv_usec=(timeoutMs%1000)*1000;return setsockopt(fd,SOL_SOCKET,SO_RCVTIMEO,&tv,sizeof(tv))==0&&setsockopt(fd,SOL_SOCKET,SO_SNDTIMEO,&tv,sizeof(tv))==0?0:-1;
#endif
}
static uint64_t now_ms(void){
#if defined(_WIN32)
 return (uint64_t)GetTickCount64();
#else
 struct timespec ts; if(clock_gettime(CLOCK_MONOTONIC,&ts)!=0)return 0; return (uint64_t)ts.tv_sec*1000u+(uint64_t)ts.tv_nsec/1000000u;
#endif
}
static int wait_bio(BIO *bio,int timeoutMs,uint64_t deadline){int fd=-1;fd_set rd,wr;struct timeval tv,*ptv=NULL;int remain=timeoutMs;BIO_get_fd(bio,&fd);if(fd<0)return -1;if(timeoutMs>=0){uint64_t n=now_ms();if(n>=deadline)return 0;remain=(int)(deadline-n);tv.tv_sec=remain/1000;tv.tv_usec=(remain%1000)*1000;ptv=&tv;}FD_ZERO(&rd);FD_ZERO(&wr);if(BIO_should_read(bio))FD_SET(fd,&rd);if(BIO_should_write(bio)||!BIO_should_read(bio))FD_SET(fd,&wr);return select(fd+1,&rd,&wr,NULL,ptv)>0?1:0;}
static int run_bio_step(BIO *bio,int handshake,int timeoutMs){uint64_t deadline=timeoutMs>=0?now_ms()+(uint64_t)timeoutMs:0;for(;;){int rc=handshake?BIO_do_handshake(bio):BIO_do_connect(bio);if(rc>0)return 1;if(!BIO_should_retry(bio))return -1;rc=wait_bio(bio,timeoutMs,deadline);if(rc<=0)return rc;}}
#endif

int CpmTls_Connect(CpmTlsClient *client,const char *host,uint16_t port,const CpmTlsConfig *cfg,int timeoutMs){
#if CPM_TLS_HAVE_OPENSSL
 CpmTlsConfig d;SSL_CTX *ctx=NULL;BIO *bio=NULL;SSL *ssl=NULL;char endpoint[320];long vr;
 if(!client||!host) return -1;
 CpmTls_Close(client);
 if(!cfg){CpmTls_DefaultConfig(&d);cfg=&d;}
 ctx=SSL_CTX_new(TLS_client_method());if(!ctx){ssl_error("SSL_CTX_new");return -2;}
 #ifdef TLS1_3_VERSION
 if(cfg->minimumTlsVersion>=13)SSL_CTX_set_min_proto_version(ctx,TLS1_3_VERSION);else
#endif
 if(cfg->minimumTlsVersion>=12)SSL_CTX_set_min_proto_version(ctx,TLS1_2_VERSION);
 if(cfg->verifyPeer){SSL_CTX_set_verify(ctx,SSL_VERIFY_PEER,NULL);if(cfg->caFile||cfg->caPath){if(SSL_CTX_load_verify_locations(ctx,cfg->caFile,cfg->caPath)!=1){ssl_error("CA load");SSL_CTX_free(ctx);return -3;}}else if(SSL_CTX_set_default_verify_paths(ctx)!=1){ssl_error("Default CA paths");SSL_CTX_free(ctx);return -3;}}
 else SSL_CTX_set_verify(ctx,SSL_VERIFY_NONE,NULL);
 if(cfg->clientCertificateFile&&SSL_CTX_use_certificate_chain_file(ctx,cfg->clientCertificateFile)!=1){ssl_error("Client certificate");SSL_CTX_free(ctx);return -4;}
 if(cfg->clientPrivateKeyFile&&SSL_CTX_use_PrivateKey_file(ctx,cfg->clientPrivateKeyFile,SSL_FILETYPE_PEM)!=1){ssl_error("Client private key");SSL_CTX_free(ctx);return -5;}
 bio=BIO_new_ssl_connect(ctx);if(!bio){ssl_error("BIO_new_ssl_connect");SSL_CTX_free(ctx);return -6;}
 BIO_get_ssl(bio,&ssl);if(!ssl){set_error("Unable to obtain SSL session");BIO_free_all(bio);SSL_CTX_free(ctx);return -6;}
 snprintf(endpoint,sizeof(endpoint),"%s:%u",host,(unsigned)port);BIO_set_conn_hostname(bio,endpoint);
 if(SSL_set_tlsext_host_name(ssl,(char *)(cfg->serverName?cfg->serverName:host))!=1){ssl_error("SNI");BIO_free_all(bio);SSL_CTX_free(ctx);return -7;}
#if OPENSSL_VERSION_NUMBER >= 0x10100000L
 if(cfg->verifyPeer&&SSL_set1_host(ssl,cfg->serverName?cfg->serverName:host)!=1){ssl_error("Hostname verification");BIO_free_all(bio);SSL_CTX_free(ctx);return -7;}
#endif
 BIO_set_nbio(bio,1);
 {int step=run_bio_step(bio,0,timeoutMs);if(step<=0){if(step==0)set_error("TLS connect timeout");else ssl_error("TLS connect");BIO_free_all(bio);SSL_CTX_free(ctx);return -8;}}
 {int step=run_bio_step(bio,1,timeoutMs);if(step<=0){if(step==0)set_error("TLS handshake timeout");else ssl_error("TLS handshake");BIO_free_all(bio);SSL_CTX_free(ctx);return -9;}}
 BIO_set_nbio(bio,0);
 {int fd=-1;BIO_get_fd(bio,&fd);if(fd>=0&&timeoutMs>=0)(void)set_timeout_fd(fd,timeoutMs);}
 vr=SSL_get_verify_result(ssl);if(cfg->verifyPeer&&vr!=X509_V_OK){snprintf(g_error,sizeof(g_error),"Certificate verification failed: %ld",vr);BIO_free_all(bio);SSL_CTX_free(ctx);return -10;}
 client->context=ctx;client->session=ssl;client->bio=bio;client->connected=1;g_error[0]='\0';return 0;
#else
 (void)client;(void)host;(void)port;(void)cfg;(void)timeoutMs;set_error("TLS unavailable: install OpenSSL development headers/libraries and rebuild this bundle");return -100;
#endif
}
void CpmTls_Close(CpmTlsClient *c){if(!c)return;
#if CPM_TLS_HAVE_OPENSSL
 if(c->bio){BIO_ssl_shutdown((BIO*)c->bio);BIO_free_all((BIO*)c->bio);}if(c->context)SSL_CTX_free((SSL_CTX*)c->context);
#endif
 CpmTls_Init(c);
}
int CpmTls_Write(CpmTlsClient*c,const void*d,size_t n){
#if CPM_TLS_HAVE_OPENSSL
 size_t off=0;if(!c||!c->connected||(!d&&n))return -1;while(off<n){int k=BIO_write((BIO*)c->bio,(const unsigned char*)d+off,(int)(n-off));if(k<=0){ssl_error("TLS write");return -2;}off+=(size_t)k;}return (int)off;
#else
 (void)c;(void)d;(void)n;return -100;
#endif
}
int CpmTls_Read(CpmTlsClient *c, void *d, size_t n, int timeoutMs)
{
#if CPM_TLS_HAVE_OPENSSL
    uint64_t deadline;
    int fd = -1;
    if (!c || !c->connected || !d || !n) return -1;
    BIO_get_fd((BIO *)c->bio, &fd);
    if (fd >= 0 && timeoutMs >= 0) (void)set_timeout_fd(fd, timeoutMs);
    deadline = timeoutMs >= 0 ? now_ms() + (uint64_t)timeoutMs : 0;
    for (;;)
    {
        int k = BIO_read((BIO *)c->bio, d, (int)n);
        if (k > 0) return k;
        if (!BIO_should_retry((BIO *)c->bio)) { ssl_error("TLS read"); return -2; }
        k = wait_bio((BIO *)c->bio, timeoutMs, deadline);
        if (k == 0) return 0;
        if (k < 0) { set_error("TLS wait failed"); return -3; }
    }
#else
    (void)c; (void)d; (void)n; (void)timeoutMs; return -100;
#endif
}
int CpmTls_ReadExact(CpmTlsClient*c,void*d,size_t n,int timeoutMs){size_t off=0;while(off<n){int k=CpmTls_Read(c,(unsigned char*)d+off,n-off,timeoutMs);if(k<=0)return k<0?k:(int)off;off+=(size_t)k;}return (int)off;}
int CpmTls_Query(CpmTlsClient*c,const void*tx,size_t txN,void*rx,size_t rxN,int timeoutMs){int rc=CpmTls_Write(c,tx,txN);if(rc<0)return rc;return CpmTls_Read(c,rx,rxN,timeoutMs);}
int CpmTls_PeerSubject(CpmTlsClient *c, char *b, size_t z)
{
#if CPM_TLS_HAVE_OPENSSL
    X509 *x;
    char tmp[512];
    if (!c || !c->session || !b || !z) return -1;
#if OPENSSL_VERSION_NUMBER >= 0x30000000L
    x = SSL_get1_peer_certificate((SSL *)c->session);
#else
    x = SSL_get_peer_certificate((SSL *)c->session);
#endif
    if (!x) return -2;
    X509_NAME_oneline(X509_get_subject_name(x), tmp, sizeof(tmp));
    snprintf(b, z, "%s", tmp);
    X509_free(x);
    return 0;
#else
    (void)c; (void)b; (void)z;
    return -100;
#endif
}
int CpmTls_Cipher(CpmTlsClient*c,char*b,size_t z){
#if CPM_TLS_HAVE_OPENSSL
 const char*s;if(!c||!c->session||!b||!z)return -1;s=SSL_get_cipher_name((SSL*)c->session);snprintf(b,z,"%s",s?s:"");return 0;
#else
 (void)c;(void)b;(void)z;return -100;
#endif
}
