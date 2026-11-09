#include "cpm_checksum.h"
uint8_t CpmChecksum_Xor8(const void*d,size_t n){const uint8_t*p=d;uint8_t v=0;size_t i;if(!p&&n)return 0;for(i=0;i<n;i++)v^=p[i];return v;}
uint8_t CpmChecksum_Sum8(const void*d,size_t n){const uint8_t*p=d;uint8_t v=0;size_t i;if(!p&&n)return 0;for(i=0;i<n;i++)v=(uint8_t)(v+p[i]);return v;}
uint16_t CpmChecksum_Fletcher16(const void*d,size_t n){const uint8_t*p=d;uint16_t a=0,b=0;size_t i;if(!p&&n)return 0;for(i=0;i<n;i++){a=(uint16_t)((a+p[i])%255u);b=(uint16_t)((b+a)%255u);}return(uint16_t)((b<<8)|a);}
uint32_t CpmChecksum_Adler32(const void*d,size_t n){const uint8_t*p=d;uint32_t a=1,b=0;size_t i;if(!p&&n)return 1;for(i=0;i<n;i++){a=(a+p[i])%65521u;b=(b+a)%65521u;}return(b<<16)|a;}
uint8_t CpmCrc8(const void*d,size_t n,uint8_t poly,uint8_t init){const uint8_t*p=d;size_t i;int bit;uint8_t crc=init;if(!p&&n)return crc;for(i=0;i<n;i++){crc^=p[i];for(bit=0;bit<8;bit++)crc=(uint8_t)((crc&0x80u)?(crc<<1)^poly:crc<<1);}return crc;}
uint16_t CpmCrc16CcittFalse(const void*d,size_t n){const uint8_t*p=d;uint16_t crc=0xFFFFu;size_t i;int bit;if(!p&&n)return crc;for(i=0;i<n;i++){crc^=(uint16_t)p[i]<<8;for(bit=0;bit<8;bit++)crc=(uint16_t)((crc&0x8000u)?(uint16_t)(((uint16_t)(crc<<1))^0x1021u):(uint16_t)(crc<<1));}return crc;}
uint16_t CpmCrc16Modbus(const void*d,size_t n){const uint8_t*p=d;uint16_t crc=0xFFFFu;size_t i;int bit;if(!p&&n)return crc;for(i=0;i<n;i++){crc^=p[i];for(bit=0;bit<8;bit++)crc=(uint16_t)((crc&1u)?(uint16_t)(((uint16_t)(crc>>1))^0xA001u):(uint16_t)(crc>>1));}return crc;}
uint32_t CpmCrc32(const void*d,size_t n){const uint8_t*p=d;uint32_t crc=0xFFFFFFFFu;size_t i;int bit;if(!p&&n)return crc^0xFFFFFFFFu;for(i=0;i<n;i++){crc^=p[i];for(bit=0;bit<8;bit++)crc=(crc&1u)?(crc>>1)^0xEDB88320u:crc>>1;}return crc^0xFFFFFFFFu;}
