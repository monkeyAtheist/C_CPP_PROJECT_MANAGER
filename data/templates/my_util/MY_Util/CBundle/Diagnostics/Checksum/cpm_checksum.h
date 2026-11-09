/** @file cpm_checksum.h @brief Common checksums and CRC algorithms for byte streams. */
#ifndef CPM_CHECKSUM_H
#define CPM_CHECKSUM_H
#include <stddef.h>
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif

uint8_t CpmChecksum_Xor8(const void *data, size_t size);
uint8_t CpmChecksum_Sum8(const void *data, size_t size);
uint16_t CpmChecksum_Fletcher16(const void *data, size_t size);
uint32_t CpmChecksum_Adler32(const void *data, size_t size);
uint8_t CpmCrc8(const void *data, size_t size, uint8_t polynomial, uint8_t initialValue);
uint16_t CpmCrc16CcittFalse(const void *data, size_t size);
uint16_t CpmCrc16Modbus(const void *data, size_t size);
uint32_t CpmCrc32(const void *data, size_t size);

#ifdef __cplusplus
}
#endif
#endif
