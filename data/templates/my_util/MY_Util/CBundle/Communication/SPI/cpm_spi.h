#ifndef CPM_SPI_H
#define CPM_SPI_H
#include <stddef.h>
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif

typedef struct CpmSpi { int handle; uint32_t speedHz; uint8_t mode; uint8_t bitsPerWord; } CpmSpi;
typedef struct CpmSpiSegment
{
    const void *txData;
    void *rxData;
    size_t size;
    uint32_t speedHz; /* 0 = current default. */
    uint16_t delayUsec;
    uint8_t bitsPerWord; /* 0 = current default. */
    uint8_t csChange;
} CpmSpiSegment;

void CpmSpi_Init(CpmSpi *spi);
int CpmSpi_Open(CpmSpi *spi,const char *devicePath,uint32_t speedHz,uint8_t mode,uint8_t bitsPerWord);
void CpmSpi_Close(CpmSpi *spi);
int CpmSpi_Configure(CpmSpi *spi,uint32_t speedHz,uint8_t mode,uint8_t bitsPerWord);
int CpmSpi_Transfer(CpmSpi *spi,const void *txData,void *rxData,size_t size);
int CpmSpi_TransferEx(CpmSpi *spi,const CpmSpiSegment *segment);
int CpmSpi_TransferSegments(CpmSpi *spi,const CpmSpiSegment *segments,size_t count);
int CpmSpi_Write(CpmSpi *spi,const void *data,size_t size);
int CpmSpi_Read(CpmSpi *spi,void *data,size_t size,uint8_t fillByte);

#ifdef __cplusplus
}
#endif
#endif
