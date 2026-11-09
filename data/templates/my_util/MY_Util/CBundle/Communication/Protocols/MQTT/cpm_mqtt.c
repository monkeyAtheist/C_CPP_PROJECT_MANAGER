#include "cpm_mqtt.h"

#include <stdio.h>
#include <string.h>

#define CPM_MQTT_PACKET_MAX 4096U

static size_t CpmMqtt_EncodeRemainingLength(size_t value, uint8_t out[4])
{
    size_t n = 0;
    do
    {
        uint8_t byte = (uint8_t)(value % 128U);
        value /= 128U;
        if (value) byte |= 0x80U;
        out[n++] = byte;
    } while (value && n < 4U);
    return n;
}

static int CpmMqtt_ReadRemainingLength(CpmMqttClient *client, size_t *value, int timeoutMs)
{
    size_t multiplier = 1, result = 0;
    int count = 0;
    for (;;)
    {
        uint8_t byte;
        int rc = CpmSocket_ReceiveExact(client->socketHandle, &byte, 1U, timeoutMs);
        if (rc != 1) return -1;
        result += (size_t)(byte & 0x7FU) * multiplier;
        ++count;
        if (!(byte & 0x80U)) break;
        if (count >= 4) return -2;
        multiplier *= 128U;
    }
    *value = result;
    return 0;
}

static int CpmMqtt_PutString(uint8_t *buffer, size_t capacity, size_t *offset, const char *text)
{
    size_t length = text ? strlen(text) : 0U;
    if (length > 65535U || *offset + 2U + length > capacity) return -1;
    buffer[(*offset)++] = (uint8_t)(length >> 8);
    buffer[(*offset)++] = (uint8_t)length;
    if (length) { memcpy(buffer + *offset, text, length); *offset += length; }
    return 0;
}

static int CpmMqtt_PutBinary(uint8_t *buffer, size_t capacity, size_t *offset, const void *data, size_t size)
{
    if (size > 65535U || *offset + 2U + size > capacity) return -1;
    buffer[(*offset)++] = (uint8_t)(size >> 8);
    buffer[(*offset)++] = (uint8_t)size;
    if (size) { memcpy(buffer + *offset, data, size); *offset += size; }
    return 0;
}

static uint16_t CpmMqtt_NextPacketId(CpmMqttClient *client)
{
    ++client->nextPacketId;
    if (!client->nextPacketId) client->nextPacketId = 1;
    return client->nextPacketId;
}

static int CpmMqtt_SendPacket(CpmMqttClient *client, uint8_t firstByte, const void *body, size_t bodySize)
{
    uint8_t header[5];
    size_t n;
    if (!client || client->socketHandle == CPM_SOCKET_INVALID || bodySize > 268435455U) return -1;
    header[0] = firstByte;
    n = CpmMqtt_EncodeRemainingLength(bodySize, header + 1);
    if (CpmSocket_SendAll(client->socketHandle, header, n + 1U) != (int)(n + 1U)) return -2;
    if (bodySize && CpmSocket_SendAll(client->socketHandle, body, bodySize) != (int)bodySize) return -3;
    return 0;
}

static int CpmMqtt_ReadControl(CpmMqttClient *client, uint8_t expectedType, uint16_t expectedPacketId, int timeoutMs)
{
    uint8_t first;
    size_t remaining;
    uint8_t body[16];
    int rc;
    if (CpmSocket_ReceiveExact(client->socketHandle, &first, 1U, timeoutMs) != 1) return -1;
    if ((first >> 4) != expectedType) return -2;
    rc = CpmMqtt_ReadRemainingLength(client, &remaining, timeoutMs); if (rc != 0) return -3;
    if (remaining > sizeof(body)) return -4;
    if (remaining && CpmSocket_ReceiveExact(client->socketHandle, body, remaining, timeoutMs) != (int)remaining) return -5;
    if (expectedPacketId)
    {
        if (remaining < 2U) return -6;
        if ((uint16_t)(((uint16_t)body[0] << 8) | body[1]) != expectedPacketId) return -7;
    }
    return remaining ? body[remaining - 1U] : 0;
}

void CpmMqtt_DefaultConnectOptions(CpmMqttConnectOptions *options)
{
    if (!options) return;
    memset(options, 0, sizeof(*options));
    options->clientId = "cpm-client";
    options->cleanSession = 1;
    options->keepAliveSeconds = 30;
}

void CpmMqtt_Init(CpmMqttClient *client)
{
    if (!client) return;
    memset(client, 0, sizeof(*client));
    client->socketHandle = CPM_SOCKET_INVALID;
}

int CpmMqtt_Connect(CpmMqttClient *client, const char *host, uint16_t port,
                    const CpmMqttConnectOptions *options, int timeoutMs)
{
    CpmMqttConnectOptions local;
    uint8_t body[CPM_MQTT_PACKET_MAX];
    size_t offset = 0;
    uint8_t flags = 0;
    uint8_t first;
    size_t remaining;
    uint8_t connack[2];
    if (!client || !host) return -1;
    if (!options) { CpmMqtt_DefaultConnectOptions(&local); options = &local; }
    if (options->willQos < 0 || options->willQos > 2) return -2;
    CpmMqtt_Disconnect(client);
    if (CpmSocket_Startup() != 0) return -3;
    client->socketHandle = CpmSocket_TcpConnect(host, port ? port : 1883U, timeoutMs);
    if (client->socketHandle == CPM_SOCKET_INVALID) { CpmSocket_Cleanup(); return -4; }
    if (CpmMqtt_PutString(body, sizeof(body), &offset, "MQTT") != 0) goto too_large;
    body[offset++] = 4U; /* MQTT 3.1.1 */
    if (options->username) flags |= 0x80U;
    if (options->password) flags |= 0x40U;
    if (options->willTopic)
    {
        flags |= 0x04U;
        flags |= (uint8_t)((options->willQos & 3) << 3);
        if (options->willRetain) flags |= 0x20U;
    }
    if (options->cleanSession) flags |= 0x02U;
    body[offset++] = flags;
    body[offset++] = (uint8_t)(options->keepAliveSeconds >> 8);
    body[offset++] = (uint8_t)options->keepAliveSeconds;
    if (CpmMqtt_PutString(body, sizeof(body), &offset, options->clientId ? options->clientId : "") != 0) goto too_large;
    if (options->willTopic)
    {
        if (CpmMqtt_PutString(body, sizeof(body), &offset, options->willTopic) != 0) goto too_large;
        if (CpmMqtt_PutBinary(body, sizeof(body), &offset, options->willPayload, options->willPayloadSize) != 0) goto too_large;
    }
    if (options->username && CpmMqtt_PutString(body, sizeof(body), &offset, options->username) != 0) goto too_large;
    if (options->password && CpmMqtt_PutString(body, sizeof(body), &offset, options->password) != 0) goto too_large;
    if (CpmMqtt_SendPacket(client, 0x10U, body, offset) != 0) goto io_error;
    if (CpmSocket_ReceiveExact(client->socketHandle, &first, 1U, timeoutMs) != 1 || (first >> 4) != 2U) goto io_error;
    if (CpmMqtt_ReadRemainingLength(client, &remaining, timeoutMs) != 0 || remaining != 2U) goto io_error;
    if (CpmSocket_ReceiveExact(client->socketHandle, connack, 2U, timeoutMs) != 2) goto io_error;
    if (connack[1] != 0U) { int code = -(100 + (int)connack[1]); CpmMqtt_Disconnect(client); return code; }
    client->keepAliveSeconds = options->keepAliveSeconds;
    client->connected = 1;
    return 0;
too_large:
    CpmMqtt_Disconnect(client); return -5;
io_error:
    CpmMqtt_Disconnect(client); return -6;
}

void CpmMqtt_Disconnect(CpmMqttClient *client)
{
    if (!client) return;
    if (client->socketHandle != CPM_SOCKET_INVALID)
    {
        if (client->connected) (void)CpmMqtt_SendPacket(client, 0xE0U, NULL, 0);
        CpmSocket_Close(client->socketHandle);
        CpmSocket_Cleanup();
    }
    CpmMqtt_Init(client);
}

int CpmMqtt_Publish(CpmMqttClient *client, const char *topic, const void *payload, size_t payloadSize,
                    int qos, int retained, int timeoutMs)
{
    uint8_t body[CPM_MQTT_PACKET_MAX];
    size_t offset = 0;
    uint16_t packetId = 0;
    uint8_t first = 0x30U;
    if (!client || !client->connected || !topic || (!payload && payloadSize) || qos < 0 || qos > 1) return -1;
    if (CpmMqtt_PutString(body, sizeof(body), &offset, topic) != 0) return -2;
    if (qos)
    {
        packetId = CpmMqtt_NextPacketId(client);
        if (offset + 2U > sizeof(body)) return -2;
        body[offset++] = (uint8_t)(packetId >> 8); body[offset++] = (uint8_t)packetId;
        first |= 0x02U;
    }
    if (retained) first |= 0x01U;
    if (payloadSize > sizeof(body) - offset) return -2;
    if (payloadSize) { memcpy(body + offset, payload, payloadSize); offset += payloadSize; }
    if (CpmMqtt_SendPacket(client, first, body, offset) != 0) return -3;
    if (qos) return CpmMqtt_ReadControl(client, 4U, packetId, timeoutMs) >= 0 ? 0 : -4;
    return 0;
}

int CpmMqtt_Subscribe(CpmMqttClient *client, const char *topicFilter, int qos, int timeoutMs)
{
    uint8_t body[1024]; size_t offset = 0; uint16_t packetId; int rc;
    if (!client || !client->connected || !topicFilter || qos < 0 || qos > 1) return -1;
    packetId = CpmMqtt_NextPacketId(client);
    body[offset++] = (uint8_t)(packetId >> 8); body[offset++] = (uint8_t)packetId;
    if (CpmMqtt_PutString(body, sizeof(body), &offset, topicFilter) != 0 || offset >= sizeof(body)) return -2;
    body[offset++] = (uint8_t)qos;
    if (CpmMqtt_SendPacket(client, 0x82U, body, offset) != 0) return -3;
    rc = CpmMqtt_ReadControl(client, 9U, packetId, timeoutMs);
    return rc == 0x80 ? -5 : (rc >= 0 ? 0 : -4);
}

int CpmMqtt_Unsubscribe(CpmMqttClient *client, const char *topicFilter, int timeoutMs)
{
    uint8_t body[1024]; size_t offset = 0; uint16_t packetId;
    if (!client || !client->connected || !topicFilter) return -1;
    packetId = CpmMqtt_NextPacketId(client);
    body[offset++] = (uint8_t)(packetId >> 8); body[offset++] = (uint8_t)packetId;
    if (CpmMqtt_PutString(body, sizeof(body), &offset, topicFilter) != 0) return -2;
    if (CpmMqtt_SendPacket(client, 0xA2U, body, offset) != 0) return -3;
    return CpmMqtt_ReadControl(client, 11U, packetId, timeoutMs) >= 0 ? 0 : -4;
}

int CpmMqtt_Ping(CpmMqttClient *client, int timeoutMs)
{
    if (!client || !client->connected) return -1;
    if (CpmMqtt_SendPacket(client, 0xC0U, NULL, 0) != 0) return -2;
    return CpmMqtt_ReadControl(client, 13U, 0, timeoutMs) >= 0 ? 0 : -3;
}

int CpmMqtt_Receive(CpmMqttClient *client, CpmMqttMessage *message,
                    void *payload, size_t payloadCapacity, int timeoutMs)
{
    uint8_t first;
    size_t remaining, topicLength, consumed = 0;
    uint8_t *out = (uint8_t *)payload;
    int rc;
    if (!client || !client->connected || !message || (!payload && payloadCapacity)) return -1;
    memset(message, 0, sizeof(*message));
    rc = CpmSocket_ReceiveExact(client->socketHandle, &first, 1U, timeoutMs);
    if (rc != 1) return rc == 0 ? 0 : -2;
    if (CpmMqtt_ReadRemainingLength(client, &remaining, timeoutMs) != 0) return -3;
    if ((first >> 4) != 3U)
    {
        uint8_t discard[256]; size_t left = remaining;
        while (left) { size_t n = left > sizeof(discard) ? sizeof(discard) : left; rc = CpmSocket_ReceiveExact(client->socketHandle, discard, n, timeoutMs); if (rc != (int)n) return -4; left -= n; }
        return 1; /* Non-PUBLISH packet consumed. */
    }
    {
        uint8_t lenBytes[2];
        if (remaining < 2U || CpmSocket_ReceiveExact(client->socketHandle, lenBytes, 2U, timeoutMs) != 2) return -5;
        topicLength = ((size_t)lenBytes[0] << 8) | lenBytes[1]; consumed = 2U;
    }
    if (topicLength >= sizeof(message->topic) || topicLength > remaining - consumed) return -6;
    if (CpmSocket_ReceiveExact(client->socketHandle, message->topic, topicLength, timeoutMs) != (int)topicLength) return -7;
    message->topic[topicLength] = '\0'; consumed += topicLength;
    message->qos = (first >> 1) & 3; message->retained = first & 1; message->duplicate = (first >> 3) & 1;
    if (message->qos)
    {
        uint8_t id[2];
        if (remaining - consumed < 2U || CpmSocket_ReceiveExact(client->socketHandle, id, 2U, timeoutMs) != 2) return -8;
        message->packetId = (uint16_t)(((uint16_t)id[0] << 8) | id[1]); consumed += 2U;
    }
    message->payloadSize = remaining - consumed;
    if (message->payloadSize > payloadCapacity) return -9;
    if (message->payloadSize && CpmSocket_ReceiveExact(client->socketHandle, out, message->payloadSize, timeoutMs) != (int)message->payloadSize) return -10;
    if (message->qos == 1)
    {
        uint8_t ack[2] = {(uint8_t)(message->packetId >> 8), (uint8_t)message->packetId};
        if (CpmMqtt_SendPacket(client, 0x40U, ack, 2U) != 0) return -11;
    }
    return 2;
}

const char *CpmMqtt_ResultText(int result)
{
    if (result == 0) return "OK";
    if (result <= -101 && result >= -105) return "MQTT broker rejected CONNECT";
    return result > 0 ? "MQTT packet received" : "MQTT operation failed";
}
