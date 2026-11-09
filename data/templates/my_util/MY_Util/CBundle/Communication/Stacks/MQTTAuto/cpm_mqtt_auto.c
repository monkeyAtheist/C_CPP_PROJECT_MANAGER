#if !defined(_WIN32)
#define _POSIX_C_SOURCE 200809L
#endif
#include "cpm_mqtt_auto.h"
#include <stdio.h>
#include <string.h>
#include <time.h>
#if defined(_WIN32)
#include <windows.h>
#endif
static void sleep_ms(unsigned ms){
#if defined(_WIN32)
 Sleep(ms);
#else
 struct timespec ts;ts.tv_sec=ms/1000;ts.tv_nsec=(long)(ms%1000)*1000000L;nanosleep(&ts,NULL);
#endif
}
static int copy_text(char *dst,size_t cap,const char *src){size_t n;if(!dst||!cap)return -1;if(!src){dst[0]=0;return 0;}n=strlen(src);if(n>=cap)return -2;memcpy(dst,src,n+1);return 0;}
void CpmMqttAuto_Init(CpmMqttAuto*c){if(!c)return;memset(c,0,sizeof(*c));CpmMqtt_Init(&c->client);CpmMqtt_DefaultConnectOptions(&c->options);CpmRetry_DefaultPolicy(&c->retry);c->port=1883;c->timeoutMs=3000;}
int CpmMqttAuto_Configure(CpmMqttAuto*c,const char*h,uint16_t p,const char*id,const char*u,const char*pw,int t){if(!c||!h)return -1;if(copy_text(c->host,sizeof(c->host),h)!=0||copy_text(c->clientId,sizeof(c->clientId),id?id:"cpm-client")!=0||copy_text(c->username,sizeof(c->username),u?u:"")!=0||copy_text(c->password,sizeof(c->password),pw?pw:"")!=0)return -2;c->port=p?p:1883;c->timeoutMs=t;c->options.clientId=c->clientId;c->options.username=c->username[0]?c->username:NULL;c->options.password=c->password[0]?c->password:NULL;return 0;}
int CpmMqttAuto_AddSubscription(CpmMqttAuto*c,const char*t,int qos){CpmMqttAutoSubscription*s;if(!c||!t||c->subscriptionCount>=CPM_MQTT_AUTO_SUBSCRIPTIONS||qos<0||qos>1)return -1;s=&c->subscriptions[c->subscriptionCount];if(copy_text(s->topic,sizeof(s->topic),t)!=0)return -2;s->qos=qos;c->subscriptionCount++;return 0;}
static int once(CpmMqttAuto*c){size_t i;int rc=CpmMqtt_Connect(&c->client,c->host,c->port,&c->options,c->timeoutMs);if(rc)return rc;for(i=0;i<c->subscriptionCount;i++){rc=CpmMqtt_Subscribe(&c->client,c->subscriptions[i].topic,c->subscriptions[i].qos,c->timeoutMs);if(rc){CpmMqtt_Disconnect(&c->client);return rc;}}return 0;}
int CpmMqttAuto_Connect(CpmMqttAuto*c){int attempt,rc=-1;if(!c||!c->host[0])return -1;for(attempt=0;attempt<c->retry.maxAttempts;attempt++){rc=once(c);if(rc==0)return 0;if(attempt+1<c->retry.maxAttempts)sleep_ms(CpmRetry_ComputeDelay(&c->retry,attempt));}return rc;}
int CpmMqttAuto_EnsureConnected(CpmMqttAuto*c){if(!c)return -1;if(c->client.connected&&CpmMqtt_Ping(&c->client,c->timeoutMs)==0)return 0;CpmMqtt_Disconnect(&c->client);return CpmMqttAuto_Connect(c);}
int CpmMqttAuto_Publish(CpmMqttAuto*c,const char*t,const void*p,size_t n,int qos,int retained){int rc;if((rc=CpmMqttAuto_EnsureConnected(c))!=0)return rc;rc=CpmMqtt_Publish(&c->client,t,p,n,qos,retained,c->timeoutMs);if(rc){CpmMqtt_Disconnect(&c->client);if(CpmMqttAuto_Connect(c)==0)rc=CpmMqtt_Publish(&c->client,t,p,n,qos,retained,c->timeoutMs);}return rc;}
int CpmMqttAuto_Receive(CpmMqttAuto*c,CpmMqttMessage*m,void*p,size_t z,int t){int rc;if((rc=CpmMqttAuto_EnsureConnected(c))!=0)return rc;rc=CpmMqtt_Receive(&c->client,m,p,z,t);if(rc<0)CpmMqtt_Disconnect(&c->client);return rc;}void CpmMqttAuto_Disconnect(CpmMqttAuto*c){if(c)CpmMqtt_Disconnect(&c->client);}
