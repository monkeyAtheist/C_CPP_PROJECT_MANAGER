#ifndef CPM_FRAMING_H
#define CPM_FRAMING_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

size_t CpmFraming_CobsMaxEncodedSize(size_t inputSize);
int CpmFraming_CobsEncode(const void *input, size_t inputSize, void *output, size_t outputCapacity, size_t *outputSize);
int CpmFraming_CobsDecode(const void *input, size_t inputSize, void *output, size_t outputCapacity, size_t *outputSize);

size_t CpmFraming_SlipMaxEncodedSize(size_t inputSize);
int CpmFraming_SlipEncode(const void *input, size_t inputSize, void *output, size_t outputCapacity, size_t *outputSize, int includeEndBytes);
int CpmFraming_SlipDecode(const void *input, size_t inputSize, void *output, size_t outputCapacity, size_t *outputSize);

int CpmFraming_EncodeLength16BE(const void *payload, size_t payloadSize, void *output, size_t outputCapacity, size_t *outputSize);
int CpmFraming_DecodeLength16BE(const void *frame, size_t frameSize, const uint8_t **payload, size_t *payloadSize);
int CpmFraming_EncodeLength32BE(const void *payload, size_t payloadSize, void *output, size_t outputCapacity, size_t *outputSize);
int CpmFraming_DecodeLength32BE(const void *frame, size_t frameSize, const uint8_t **payload, size_t *payloadSize);

int CpmFraming_FindDelimiter(const void *data, size_t dataSize, const void *delimiter, size_t delimiterSize, size_t *position);

#ifdef __cplusplus
}
#endif
#endif
