#include "cpm_spi.h"
#include <stdlib.h>
#include <string.h>
#if defined(__linux__)
#include <fcntl.h>
#include <linux/spi/spidev.h>
#include <sys/ioctl.h>
#include <unistd.h>
#endif
void CpmSpi_Init(CpmSpi *spi){if(spi){memset(spi,0,sizeof(*spi));spi->handle=-1;spi->bitsPerWord=8;}}
int CpmSpi_Configure(CpmSpi *spi,uint32_t speedHz,uint8_t mode,uint8_t bitsPerWord){
#if defined(__linux__)
 if(!spi||spi->handle<0||bitsPerWord==0)return -1;
 if(ioctl(spi->handle,SPI_IOC_WR_MODE,&mode)<0||ioctl(spi->handle,SPI_IOC_WR_BITS_PER_WORD,&bitsPerWord)<0||ioctl(spi->handle,SPI_IOC_WR_MAX_SPEED_HZ,&speedHz)<0)return -2;
 spi->speedHz=speedHz;spi->mode=mode;spi->bitsPerWord=bitsPerWord;return 0;
#else
 (void)spi;(void)speedHz;(void)mode;(void)bitsPerWord;return -2;
#endif
}
int CpmSpi_Open(CpmSpi *spi,const char *devicePath,uint32_t speedHz,uint8_t mode,uint8_t bitsPerWord){
#if defined(__linux__)
 int fd;if(!spi||!devicePath)return -1;CpmSpi_Close(spi);fd=open(devicePath,O_RDWR);if(fd<0)return -2;spi->handle=fd;if(CpmSpi_Configure(spi,speedHz,mode,bitsPerWord)!=0){close(fd);CpmSpi_Init(spi);return -3;}return 0;
#else
 (void)spi;(void)devicePath;(void)speedHz;(void)mode;(void)bitsPerWord;return -2;
#endif
}
void CpmSpi_Close(CpmSpi *spi){if(!spi)return;
#if defined(__linux__)
 if(spi->handle>=0)close(spi->handle);
#endif
 CpmSpi_Init(spi);}
int CpmSpi_TransferEx(CpmSpi *spi,const CpmSpiSegment *segment){
#if defined(__linux__)
 struct spi_ioc_transfer tr;if(!spi||spi->handle<0||!segment||segment->size==0)return -1;memset(&tr,0,sizeof(tr));tr.tx_buf=(uintptr_t)segment->txData;tr.rx_buf=(uintptr_t)segment->rxData;tr.len=(uint32_t)segment->size;tr.speed_hz=segment->speedHz?segment->speedHz:spi->speedHz;tr.bits_per_word=segment->bitsPerWord?segment->bitsPerWord:spi->bitsPerWord;tr.delay_usecs=segment->delayUsec;tr.cs_change=segment->csChange;return ioctl(spi->handle,SPI_IOC_MESSAGE(1),&tr)<0?-2:0;
#else
 (void)spi;(void)segment;return -2;
#endif
}
int CpmSpi_Transfer(CpmSpi *spi,const void *txData,void *rxData,size_t size){CpmSpiSegment s;s.txData=txData;s.rxData=rxData;s.size=size;s.speedHz=0;s.delayUsec=0;s.bitsPerWord=0;s.csChange=0;return CpmSpi_TransferEx(spi,&s);}
int CpmSpi_TransferSegments(CpmSpi *spi,const CpmSpiSegment *segments,size_t count){
#if defined(__linux__)
 struct spi_ioc_transfer *trs;size_t i;int rc;if(!spi||spi->handle<0||(!segments&&count))return -1;if(count==0)return 0;trs=(struct spi_ioc_transfer*)calloc(count,sizeof(*trs));if(!trs)return -2;for(i=0;i<count;i++){trs[i].tx_buf=(uintptr_t)segments[i].txData;trs[i].rx_buf=(uintptr_t)segments[i].rxData;trs[i].len=(uint32_t)segments[i].size;trs[i].speed_hz=segments[i].speedHz?segments[i].speedHz:spi->speedHz;trs[i].bits_per_word=segments[i].bitsPerWord?segments[i].bitsPerWord:spi->bitsPerWord;trs[i].delay_usecs=segments[i].delayUsec;trs[i].cs_change=segments[i].csChange;}rc=ioctl(spi->handle,SPI_IOC_MESSAGE(count),trs)<0?-3:0;free(trs);return rc;
#else
 (void)spi;(void)segments;(void)count;return -2;
#endif
}
int CpmSpi_Write(CpmSpi *spi,const void *data,size_t size){return CpmSpi_Transfer(spi,data,NULL,size);}
int CpmSpi_Read(CpmSpi *spi,void *data,size_t size,uint8_t fillByte){unsigned char stack[256];unsigned char *tx=stack;int rc;if(!data&&size)return -1;if(size>sizeof(stack)){tx=(unsigned char*)malloc(size);if(!tx)return -2;}memset(tx,fillByte,size);rc=CpmSpi_Transfer(spi,tx,data,size);if(tx!=stack)free(tx);return rc;}
