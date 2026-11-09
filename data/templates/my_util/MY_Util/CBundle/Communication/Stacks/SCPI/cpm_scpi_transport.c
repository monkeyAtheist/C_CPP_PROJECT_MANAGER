#include "cpm_scpi_transport.h"
static int tcp_write(void*c,const void*d,size_t n){CpmScpiTcpTransport*t=(CpmScpiTcpTransport*)c;return CpmSocket_SendAll(t->socketHandle,d,n);}
static int tcp_read(void*c,void*d,size_t n,int ms){CpmScpiTcpTransport*t=(CpmScpiTcpTransport*)c;return CpmSocket_Receive(t->socketHandle,d,n,ms);}
static int visa_write(void*c,const void*d,size_t n){CpmScpiVisaTransport*t=(CpmScpiVisaTransport*)c;return CpmVisa_Write(t->session,d,n);}
static int visa_read(void*c,void*d,size_t n,int ms){CpmScpiVisaTransport*t=(CpmScpiVisaTransport*)c;return CpmVisa_Read(t->session,d,n,ms);}
void CpmScpiTcp_Init(CpmScpiTcpTransport*t){if(t)t->socketHandle=CPM_SOCKET_INVALID;}int CpmScpiTcp_Connect(CpmScpiTcpTransport*t,const char*h,uint16_t p,int ms){if(!t||!h)return -1;CpmScpiTcp_Close(t);if(CpmSocket_Startup()!=0)return -2;t->socketHandle=CpmSocket_TcpConnect(h,p?p:5025,ms);if(t->socketHandle==CPM_SOCKET_INVALID){CpmSocket_Cleanup();return -3;}return 0;}void CpmScpiTcp_Close(CpmScpiTcpTransport*t){if(t&&t->socketHandle!=CPM_SOCKET_INVALID){CpmSocket_Close(t->socketHandle);CpmSocket_Cleanup();t->socketHandle=CPM_SOCKET_INVALID;}}
void CpmScpi_BindTcp(CpmScpi*s,CpmScpiTcpTransport*t){CpmScpi_Init(s,t,tcp_write,tcp_read);}void CpmScpi_BindVisa(CpmScpi*s,CpmScpiVisaTransport*t,CpmVisaSession*v){if(t)t->session=v;CpmScpi_Init(s,t,visa_write,visa_read);}
