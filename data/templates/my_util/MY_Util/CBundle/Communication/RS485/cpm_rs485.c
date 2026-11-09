#define _DEFAULT_SOURCE
#include "cpm_rs485.h"

#include <string.h>
#if defined(_WIN32)
#include <windows.h>
#else
#include <time.h>
#if defined(__linux__)
#include <sys/ioctl.h>
#include <linux/serial.h>
#endif
#endif

static void CpmRs485_SleepUs(uint32_t us)
{
#if defined(_WIN32)
    if (us) Sleep((DWORD)((us + 999U) / 1000U));
#else
    struct timespec ts;
    ts.tv_sec = (time_t)(us / 1000000U);
    ts.tv_nsec = (long)(us % 1000000U) * 1000L;
    while (nanosleep(&ts, &ts) != 0) { }
#endif
}

void CpmRs485_DefaultConfig(CpmRs485Config *config)
{
    if (!config) return;
    memset(config, 0, sizeof(*config));
    CpmUart_DefaultConfig(&config->uart);
    config->manualDirection = 1;
    config->rtsActiveHigh = 1;
    config->preTransmitDelayUs = 0;
    config->postTransmitDelayUs = 0;
    config->tryLinuxKernelMode = 1;
    config->uart.rtsEnabled = 0;
}

void CpmRs485_Init(CpmRs485 *bus)
{
    if (!bus) return;
    memset(bus, 0, sizeof(*bus));
    CpmUart_Init(&bus->uart);
    CpmRs485_DefaultConfig(&bus->config);
}

static int CpmRs485_TryKernelMode(CpmRs485 *bus)
{
#if defined(__linux__) && defined(TIOCSRS485)
    struct serial_rs485 rs485;
    if (!bus || !bus->uart.opened) return -1;
    memset(&rs485, 0, sizeof(rs485));
    rs485.flags |= SER_RS485_ENABLED;
    if (bus->config.rtsActiveHigh) rs485.flags |= SER_RS485_RTS_ON_SEND;
    else rs485.flags |= SER_RS485_RTS_AFTER_SEND;
    rs485.delay_rts_before_send = bus->config.preTransmitDelayUs / 1000U;
    rs485.delay_rts_after_send = bus->config.postTransmitDelayUs / 1000U;
    if (ioctl((int)bus->uart.handle, TIOCSRS485, &rs485) == 0)
    {
        bus->kernelModeEnabled = 1;
        return 0;
    }
#else
    (void)bus;
#endif
    return -2;
}

int CpmRs485_Open(CpmRs485 *bus, const char *port, const CpmRs485Config *config)
{
    CpmRs485Config local;
    if (!bus || !port) return -1;
    if (!config) { CpmRs485_DefaultConfig(&local); config = &local; }
    CpmRs485_Close(bus);
    bus->config = *config;
    if (CpmUart_OpenConfig(&bus->uart, port, &config->uart) != 0) return -2;
    bus->kernelModeEnabled = 0;
    if (config->tryLinuxKernelMode && CpmRs485_TryKernelMode(bus) == 0)
        bus->config.manualDirection = 0;
    if (bus->config.manualDirection)
        (void)CpmRs485_SetDirection(bus, 0);
    return 0;
}

void CpmRs485_Close(CpmRs485 *bus)
{
    if (!bus) return;
    CpmUart_Close(&bus->uart);
    CpmRs485_Init(bus);
}

int CpmRs485_SetDirection(CpmRs485 *bus, int transmit)
{
    int level;
    if (!bus || !bus->uart.opened) return -1;
    if (!bus->config.manualDirection || bus->kernelModeEnabled) return 0;
    level = transmit ? bus->config.rtsActiveHigh : !bus->config.rtsActiveHigh;
    return CpmUart_SetRts(&bus->uart, level);
}

int CpmRs485_Write(CpmRs485 *bus, const void *data, size_t size)
{
    int rc;
    if (!bus || !bus->uart.opened) return -1;
    if (CpmRs485_SetDirection(bus, 1) != 0) return -2;
    CpmRs485_SleepUs(bus->config.preTransmitDelayUs);
    rc = CpmUart_WriteAll(&bus->uart, data, size);
    if (rc >= 0 && CpmUart_Flush(&bus->uart) != 0) rc = -3;
    CpmRs485_SleepUs(bus->config.postTransmitDelayUs);
    if (CpmRs485_SetDirection(bus, 0) != 0 && rc >= 0) rc = -4;
    return rc;
}

int CpmRs485_Read(CpmRs485 *bus, void *data, size_t size, int timeoutMs)
{
    if (!bus) return -1;
    (void)CpmRs485_SetDirection(bus, 0);
    return CpmUart_Read(&bus->uart, data, size, timeoutMs);
}

int CpmRs485_ReadExact(CpmRs485 *bus, void *data, size_t size, int timeoutMs)
{
    if (!bus) return -1;
    (void)CpmRs485_SetDirection(bus, 0);
    return CpmUart_ReadExact(&bus->uart, data, size, timeoutMs);
}

int CpmRs485_Transceive(CpmRs485 *bus, const void *txData, size_t txSize,
                        void *rxData, size_t rxCapacity, int responseTimeoutMs)
{
    int rc = CpmRs485_Write(bus, txData, txSize);
    if (rc < 0) return rc;
    return CpmRs485_Read(bus, rxData, rxCapacity, responseTimeoutMs);
}
