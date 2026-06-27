/**
 * @file cpm_spi.h
 * @brief CPM C Linux SPI communication API.
 *
 * @par Example of use
 * @code{.c}
 * #include "cpm_spi.h"
 * 
 * CpmSpiDevice spi;
 * uint8_t tx[] = { 0x9F, 0x00, 0x00, 0x00 };
 * uint8_t rx[sizeof(tx)];
 * CpmSpi_Init(&spi);
 * if (CpmSpi_Open(&spi, "/dev/spidev0.0", 1000000, 0, 8) == 0)
 * {
 *     CpmSpi_Transfer(&spi, tx, rx, sizeof(tx));
 *     CpmSpi_Close(&spi);
 * }
 * @endcode
 */
#ifndef CPM_SPI_H
#define CPM_SPI_H

#ifdef __cplusplus
extern "C" {
#endif

#include <stddef.h>
#include <stdint.h>

typedef struct CpmSpiDevice
{
    int handle;
    uint32_t speedHz;
    uint8_t mode;
    uint8_t bitsPerWord;
} CpmSpiDevice;

void CpmSpi_Init(CpmSpiDevice *device);
int CpmSpi_Open(CpmSpiDevice *device, const char *devicePath, uint32_t speedHz, uint8_t mode, uint8_t bitsPerWord);
void CpmSpi_Close(CpmSpiDevice *device);
int CpmSpi_SetMode(CpmSpiDevice *device, uint8_t mode);
int CpmSpi_SetSpeed(CpmSpiDevice *device, uint32_t speedHz);
int CpmSpi_SetBitsPerWord(CpmSpiDevice *device, uint8_t bitsPerWord);
int CpmSpi_Transfer(CpmSpiDevice *device, const uint8_t *txData, uint8_t *rxData, size_t size);
int CpmSpi_Write(CpmSpiDevice *device, const uint8_t *data, size_t size);
int CpmSpi_Read(CpmSpiDevice *device, uint8_t fillByte, uint8_t *data, size_t size);

#ifdef __cplusplus
}
#endif

#endif /* CPM_SPI_H */
