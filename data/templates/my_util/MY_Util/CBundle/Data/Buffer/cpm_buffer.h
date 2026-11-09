/** @file cpm_buffer.h @brief Dynamic byte buffer, cursor reader and endian conversion helpers. */
#ifndef CPM_BUFFER_H
#define CPM_BUFFER_H
#include <stddef.h>
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif

typedef struct CpmByteBuffer { unsigned char *data; size_t size; size_t capacity; } CpmByteBuffer;
typedef struct CpmByteReader { const unsigned char *data; size_t size; size_t offset; } CpmByteReader;

uint16_t CpmEndian_ReadU16LE(const void *data);
uint16_t CpmEndian_ReadU16BE(const void *data);
uint32_t CpmEndian_ReadU32LE(const void *data);
uint32_t CpmEndian_ReadU32BE(const void *data);
uint64_t CpmEndian_ReadU64LE(const void *data);
uint64_t CpmEndian_ReadU64BE(const void *data);
void CpmEndian_WriteU16LE(void *data, uint16_t value);
void CpmEndian_WriteU16BE(void *data, uint16_t value);
void CpmEndian_WriteU32LE(void *data, uint32_t value);
void CpmEndian_WriteU32BE(void *data, uint32_t value);
void CpmEndian_WriteU64LE(void *data, uint64_t value);
void CpmEndian_WriteU64BE(void *data, uint64_t value);

void CpmByteBuffer_Init(CpmByteBuffer *buffer);
void CpmByteBuffer_Free(CpmByteBuffer *buffer);
void CpmByteBuffer_Clear(CpmByteBuffer *buffer);
int CpmByteBuffer_Reserve(CpmByteBuffer *buffer, size_t capacity);
int CpmByteBuffer_Append(CpmByteBuffer *buffer, const void *data, size_t size);
int CpmByteBuffer_AppendU8(CpmByteBuffer *buffer, uint8_t value);
int CpmByteBuffer_AppendU16LE(CpmByteBuffer *buffer, uint16_t value);
int CpmByteBuffer_AppendU16BE(CpmByteBuffer *buffer, uint16_t value);
int CpmByteBuffer_AppendU32LE(CpmByteBuffer *buffer, uint32_t value);
int CpmByteBuffer_AppendU32BE(CpmByteBuffer *buffer, uint32_t value);

void CpmByteReader_Init(CpmByteReader *reader, const void *data, size_t size);
size_t CpmByteReader_Remaining(const CpmByteReader *reader);
int CpmByteReader_Read(CpmByteReader *reader, void *output, size_t size);
int CpmByteReader_ReadU8(CpmByteReader *reader, uint8_t *value);
int CpmByteReader_ReadU16LE(CpmByteReader *reader, uint16_t *value);
int CpmByteReader_ReadU16BE(CpmByteReader *reader, uint16_t *value);
int CpmByteReader_ReadU32LE(CpmByteReader *reader, uint32_t *value);
int CpmByteReader_ReadU32BE(CpmByteReader *reader, uint32_t *value);

int CpmHex_Encode(const void *data, size_t size, char *output, size_t outputSize, int uppercase, char separator);
int CpmHex_Decode(const char *text, unsigned char *output, size_t outputCapacity, size_t *outputSize);

#ifdef __cplusplus
}
#endif
#endif
