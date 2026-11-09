#ifndef CPM_MQTT_AUTO_H
#define CPM_MQTT_AUTO_H
#include "cpm_mqtt.h"
#include "cpm_retry.h"
#ifdef __cplusplus
extern "C" {
#endif
#define CPM_MQTT_AUTO_SUBSCRIPTIONS 16
typedef struct CpmMqttAutoSubscription { char topic[256]; int qos; } CpmMqttAutoSubscription;
typedef struct CpmMqttAuto { CpmMqttClient client; CpmMqttConnectOptions options; CpmRetryPolicy retry; char host[256],clientId[128],username[128],password[128]; uint16_t port; int timeoutMs; CpmMqttAutoSubscription subscriptions[CPM_MQTT_AUTO_SUBSCRIPTIONS]; size_t subscriptionCount; } CpmMqttAuto;
void CpmMqttAuto_Init(CpmMqttAuto *client);
int CpmMqttAuto_Configure(CpmMqttAuto *client,const char *host,uint16_t port,const char *clientId,const char *username,const char *password,int timeoutMs);
int CpmMqttAuto_AddSubscription(CpmMqttAuto *client,const char *topic,int qos);
int CpmMqttAuto_Connect(CpmMqttAuto *client);
int CpmMqttAuto_EnsureConnected(CpmMqttAuto *client);
int CpmMqttAuto_Publish(CpmMqttAuto *client,const char *topic,const void *payload,size_t payloadSize,int qos,int retained);
int CpmMqttAuto_Receive(CpmMqttAuto *client,CpmMqttMessage *message,void *payload,size_t capacity,int timeoutMs);
void CpmMqttAuto_Disconnect(CpmMqttAuto *client);
#ifdef __cplusplus
}
#endif
#endif
