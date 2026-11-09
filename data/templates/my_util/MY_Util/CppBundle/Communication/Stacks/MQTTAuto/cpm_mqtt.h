#ifndef CPM_MQTT_H
#define CPM_MQTT_H

#include <stddef.h>
#include <stdint.h>
#include "cpm_socket.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct CpmMqttConnectOptions
{
    const char *clientId;
    const char *username;
    const char *password;
    const char *willTopic;
    const void *willPayload;
    size_t willPayloadSize;
    int willQos;
    int willRetain;
    int cleanSession;
    uint16_t keepAliveSeconds;
} CpmMqttConnectOptions;

typedef struct CpmMqttClient
{
    CpmSocketHandle socketHandle;
    uint16_t nextPacketId;
    uint16_t keepAliveSeconds;
    int connected;
} CpmMqttClient;

typedef struct CpmMqttMessage
{
    char topic[256];
    size_t payloadSize;
    int qos;
    int retained;
    int duplicate;
    uint16_t packetId;
} CpmMqttMessage;

void CpmMqtt_DefaultConnectOptions(CpmMqttConnectOptions *options);
void CpmMqtt_Init(CpmMqttClient *client);
int CpmMqtt_Connect(CpmMqttClient *client, const char *host, uint16_t port,
                    const CpmMqttConnectOptions *options, int timeoutMs);
void CpmMqtt_Disconnect(CpmMqttClient *client);
int CpmMqtt_Publish(CpmMqttClient *client, const char *topic, const void *payload, size_t payloadSize,
                    int qos, int retained, int timeoutMs);
int CpmMqtt_Subscribe(CpmMqttClient *client, const char *topicFilter, int qos, int timeoutMs);
int CpmMqtt_Unsubscribe(CpmMqttClient *client, const char *topicFilter, int timeoutMs);
int CpmMqtt_Ping(CpmMqttClient *client, int timeoutMs);
int CpmMqtt_Receive(CpmMqttClient *client, CpmMqttMessage *message,
                    void *payload, size_t payloadCapacity, int timeoutMs);
const char *CpmMqtt_ResultText(int result);

#ifdef __cplusplus
}
#endif
#endif
