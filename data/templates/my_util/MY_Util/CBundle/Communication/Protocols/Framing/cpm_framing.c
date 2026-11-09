#include "cpm_framing.h"
#include <string.h>

size_t CpmFraming_CobsMaxEncodedSize(size_t inputSize) { return inputSize + inputSize / 254u + 2u; }

int CpmFraming_CobsEncode(const void *input, size_t inputSize, void *output, size_t outputCapacity, size_t *outputSize)
{
    const uint8_t *src = (const uint8_t *)input;
    uint8_t *dst = (uint8_t *)output;
    size_t readIndex = 0, writeIndex = 1, codeIndex = 0;
    uint8_t code = 1;
    if ((!input && inputSize) || !output || !outputSize) return -1;
    if (outputCapacity < CpmFraming_CobsMaxEncodedSize(inputSize)) return -2;
    while (readIndex < inputSize)
    {
        if (src[readIndex] == 0)
        {
            dst[codeIndex] = code;
            code = 1;
            codeIndex = writeIndex++;
            readIndex++;
        }
        else
        {
            dst[writeIndex++] = src[readIndex++];
            code++;
            if (code == 0xFF)
            {
                dst[codeIndex] = code;
                code = 1;
                codeIndex = writeIndex++;
            }
        }
    }
    dst[codeIndex] = code;
    dst[writeIndex++] = 0;
    *outputSize = writeIndex;
    return 0;
}

int CpmFraming_CobsDecode(const void *input, size_t inputSize, void *output, size_t outputCapacity, size_t *outputSize)
{
    const uint8_t *src = (const uint8_t *)input;
    uint8_t *dst = (uint8_t *)output;
    size_t readIndex = 0, writeIndex = 0;
    if ((!input && inputSize) || !output || !outputSize) return -1;
    if (inputSize && src[inputSize - 1] == 0) inputSize--;
    while (readIndex < inputSize)
    {
        uint8_t code = src[readIndex++];
        uint8_t i;
        if (code == 0) return -2;
        for (i = 1; i < code; ++i)
        {
            if (readIndex >= inputSize || writeIndex >= outputCapacity) return -3;
            dst[writeIndex++] = src[readIndex++];
        }
        if (code != 0xFF && readIndex < inputSize)
        {
            if (writeIndex >= outputCapacity) return -3;
            dst[writeIndex++] = 0;
        }
    }
    *outputSize = writeIndex;
    return 0;
}

size_t CpmFraming_SlipMaxEncodedSize(size_t inputSize) { return inputSize * 2u + 2u; }

int CpmFraming_SlipEncode(const void *input, size_t inputSize, void *output, size_t outputCapacity, size_t *outputSize, int includeEndBytes)
{
    const uint8_t END = 0xC0, ESC = 0xDB, ESC_END = 0xDC, ESC_ESC = 0xDD;
    const uint8_t *src = (const uint8_t *)input;
    uint8_t *dst = (uint8_t *)output;
    size_t i, used = 0;
    if ((!input && inputSize) || !output || !outputSize) return -1;
    if (includeEndBytes) { if (used >= outputCapacity) return -2; dst[used++] = END; }
    for (i = 0; i < inputSize; ++i)
    {
        if (src[i] == END || src[i] == ESC)
        {
            if (used + 2 > outputCapacity) return -2;
            dst[used++] = ESC;
            dst[used++] = src[i] == END ? ESC_END : ESC_ESC;
        }
        else
        {
            if (used >= outputCapacity) return -2;
            dst[used++] = src[i];
        }
    }
    if (includeEndBytes) { if (used >= outputCapacity) return -2; dst[used++] = END; }
    *outputSize = used;
    return 0;
}

int CpmFraming_SlipDecode(const void *input, size_t inputSize, void *output, size_t outputCapacity, size_t *outputSize)
{
    const uint8_t END = 0xC0, ESC = 0xDB, ESC_END = 0xDC, ESC_ESC = 0xDD;
    const uint8_t *src = (const uint8_t *)input;
    uint8_t *dst = (uint8_t *)output;
    size_t i, used = 0;
    int escaped = 0;
    if ((!input && inputSize) || !output || !outputSize) return -1;
    for (i = 0; i < inputSize; ++i)
    {
        uint8_t value = src[i];
        if (value == END) continue;
        if (escaped)
        {
            if (value == ESC_END) value = END;
            else if (value == ESC_ESC) value = ESC;
            else return -2;
            escaped = 0;
        }
        else if (value == ESC) { escaped = 1; continue; }
        if (used >= outputCapacity) return -3;
        dst[used++] = value;
    }
    if (escaped) return -2;
    *outputSize = used;
    return 0;
}

int CpmFraming_EncodeLength16BE(const void *payload, size_t payloadSize, void *output, size_t outputCapacity, size_t *outputSize)
{
    uint8_t *dst = (uint8_t *)output;
    if ((!payload && payloadSize) || !output || !outputSize || payloadSize > 0xFFFFu) return -1;
    if (outputCapacity < payloadSize + 2u) return -2;
    dst[0] = (uint8_t)(payloadSize >> 8); dst[1] = (uint8_t)payloadSize;
    if (payloadSize) memcpy(dst + 2, payload, payloadSize);
    *outputSize = payloadSize + 2u;
    return 0;
}

int CpmFraming_DecodeLength16BE(const void *frame, size_t frameSize, const uint8_t **payload, size_t *payloadSize)
{
    const uint8_t *src = (const uint8_t *)frame;
    size_t size;
    if (!frame || frameSize < 2 || !payload || !payloadSize) return -1;
    size = ((size_t)src[0] << 8) | src[1];
    if (frameSize < size + 2u) return -2;
    *payload = src + 2; *payloadSize = size; return 0;
}

int CpmFraming_EncodeLength32BE(const void *payload, size_t payloadSize, void *output, size_t outputCapacity, size_t *outputSize)
{
    uint8_t *dst = (uint8_t *)output;
    uint32_t size32;
    if ((!payload && payloadSize) || !output || !outputSize || payloadSize > 0xFFFFFFFFu) return -1;
    if (outputCapacity < payloadSize + 4u) return -2;
    size32 = (uint32_t)payloadSize;
    dst[0] = (uint8_t)(size32 >> 24); dst[1] = (uint8_t)(size32 >> 16); dst[2] = (uint8_t)(size32 >> 8); dst[3] = (uint8_t)size32;
    if (payloadSize) memcpy(dst + 4, payload, payloadSize);
    *outputSize = payloadSize + 4u;
    return 0;
}

int CpmFraming_DecodeLength32BE(const void *frame, size_t frameSize, const uint8_t **payload, size_t *payloadSize)
{
    const uint8_t *src = (const uint8_t *)frame;
    uint32_t size;
    if (!frame || frameSize < 4 || !payload || !payloadSize) return -1;
    size = ((uint32_t)src[0] << 24) | ((uint32_t)src[1] << 16) | ((uint32_t)src[2] << 8) | src[3];
    if (frameSize < (size_t)size + 4u) return -2;
    *payload = src + 4; *payloadSize = size; return 0;
}

int CpmFraming_FindDelimiter(const void *data, size_t dataSize, const void *delimiter, size_t delimiterSize, size_t *position)
{
    const uint8_t *bytes = (const uint8_t *)data;
    size_t i;
    if ((!data && dataSize) || !delimiter || delimiterSize == 0 || !position) return -1;
    if (delimiterSize > dataSize) return 0;
    for (i = 0; i + delimiterSize <= dataSize; ++i)
    {
        if (memcmp(bytes + i, delimiter, delimiterSize) == 0) { *position = i; return 1; }
    }
    return 0;
}
