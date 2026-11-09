#define _DEFAULT_SOURCE
#include "cpm_uart.h"

#include <stdio.h>
#include <string.h>
#include <time.h>

#if defined(_WIN32)
#include <windows.h>
#else
#include <errno.h>
#include <fcntl.h>
#include <sys/ioctl.h>
#include <sys/select.h>
#include <termios.h>
#include <unistd.h>
#endif

void CpmUart_DefaultConfig(CpmUartConfig *config)
{
    if (!config) return;
    config->baudRate = 115200;
    config->dataBits = 8;
    config->parity = CPM_UART_PARITY_NONE;
    config->stopBits = 1;
    config->flowControl = CPM_UART_FLOW_NONE;
    config->readTimeoutMs = 1000;
    config->writeTimeoutMs = 1000;
    config->dtrEnabled = 1;
    config->rtsEnabled = 1;
}

void CpmUart_Init(CpmUart *uart)
{
    if (!uart) return;
    memset(uart, 0, sizeof(*uart));
    uart->handle = -1;
    CpmUart_DefaultConfig(&uart->config);
}

#if !defined(_WIN32)
static speed_t CpmUart_Baud(int baudrate)
{
    switch (baudrate)
    {
        case 50: return B50;
        case 75: return B75;
        case 110: return B110;
        case 300: return B300;
        case 600: return B600;
        case 1200: return B1200;
        case 2400: return B2400;
        case 4800: return B4800;
        case 9600: return B9600;
        case 19200: return B19200;
        case 38400: return B38400;
#ifdef B57600
        case 57600: return B57600;
#endif
#ifdef B115200
        case 115200: return B115200;
#endif
#ifdef B230400
        case 230400: return B230400;
#endif
#ifdef B460800
        case 460800: return B460800;
#endif
#ifdef B921600
        case 921600: return B921600;
#endif
        default: return (speed_t)0;
    }
}
#endif

static CpmUartParity CpmUart_ParityFromChar(char parity)
{
    switch (parity)
    {
        case 'O': case 'o': return CPM_UART_PARITY_ODD;
        case 'E': case 'e': return CPM_UART_PARITY_EVEN;
        case 'M': case 'm': return CPM_UART_PARITY_MARK;
        case 'S': case 's': return CPM_UART_PARITY_SPACE;
        default: return CPM_UART_PARITY_NONE;
    }
}

int CpmUart_Configure(CpmUart *uart, const CpmUartConfig *config)
{
    if (!uart || !uart->opened || !config) return -1;
    if (config->dataBits < 5 || config->dataBits > 8 || (config->stopBits != 1 && config->stopBits != 2)) return -2;
#if defined(_WIN32)
    {
        HANDLE handle = (HANDLE)uart->handle;
        DCB dcb;
        COMMTIMEOUTS timeouts;
        memset(&dcb, 0, sizeof(dcb));
        dcb.DCBlength = sizeof(dcb);
        if (!GetCommState(handle, &dcb)) return -3;
        dcb.BaudRate = (DWORD)config->baudRate;
        dcb.ByteSize = (BYTE)config->dataBits;
        dcb.Parity = NOPARITY;
        dcb.fParity = FALSE;
        if (config->parity == CPM_UART_PARITY_ODD) { dcb.Parity = ODDPARITY; dcb.fParity = TRUE; }
        else if (config->parity == CPM_UART_PARITY_EVEN) { dcb.Parity = EVENPARITY; dcb.fParity = TRUE; }
        else if (config->parity == CPM_UART_PARITY_MARK) { dcb.Parity = MARKPARITY; dcb.fParity = TRUE; }
        else if (config->parity == CPM_UART_PARITY_SPACE) { dcb.Parity = SPACEPARITY; dcb.fParity = TRUE; }
        dcb.StopBits = config->stopBits == 2 ? TWOSTOPBITS : ONESTOPBIT;
        dcb.fOutxCtsFlow = config->flowControl == CPM_UART_FLOW_RTS_CTS;
        dcb.fRtsControl = config->flowControl == CPM_UART_FLOW_RTS_CTS ? RTS_CONTROL_HANDSHAKE : (config->rtsEnabled ? RTS_CONTROL_ENABLE : RTS_CONTROL_DISABLE);
        dcb.fOutX = config->flowControl == CPM_UART_FLOW_XON_XOFF;
        dcb.fInX = config->flowControl == CPM_UART_FLOW_XON_XOFF;
        dcb.fDtrControl = config->dtrEnabled ? DTR_CONTROL_ENABLE : DTR_CONTROL_DISABLE;
        if (!SetCommState(handle, &dcb)) return -4;
        memset(&timeouts, 0, sizeof(timeouts));
        timeouts.ReadIntervalTimeout = MAXDWORD;
        timeouts.ReadTotalTimeoutMultiplier = 0;
        timeouts.ReadTotalTimeoutConstant = config->readTimeoutMs < 0 ? 0 : (DWORD)config->readTimeoutMs;
        timeouts.WriteTotalTimeoutMultiplier = 0;
        timeouts.WriteTotalTimeoutConstant = config->writeTimeoutMs < 0 ? 0 : (DWORD)config->writeTimeoutMs;
        if (!SetCommTimeouts(handle, &timeouts)) return -5;
    }
#else
    {
        int fd = (int)uart->handle;
        struct termios tio;
        speed_t speed = CpmUart_Baud(config->baudRate);
        if (speed == 0) return -6;
        if (tcgetattr(fd, &tio) != 0) return -3;
        cfmakeraw(&tio);
        tio.c_cflag &= ~CSIZE;
        switch (config->dataBits)
        {
            case 5: tio.c_cflag |= CS5; break;
            case 6: tio.c_cflag |= CS6; break;
            case 7: tio.c_cflag |= CS7; break;
            default: tio.c_cflag |= CS8; break;
        }
        tio.c_cflag &= ~(PARENB | PARODD);
        if (config->parity == CPM_UART_PARITY_EVEN) tio.c_cflag |= PARENB;
        else if (config->parity == CPM_UART_PARITY_ODD) tio.c_cflag |= PARENB | PARODD;
#if defined(CMSPAR)
        else if (config->parity == CPM_UART_PARITY_MARK) tio.c_cflag |= PARENB | PARODD | CMSPAR;
        else if (config->parity == CPM_UART_PARITY_SPACE) tio.c_cflag |= PARENB | CMSPAR;
#else
        else if (config->parity == CPM_UART_PARITY_MARK || config->parity == CPM_UART_PARITY_SPACE) return -7;
#endif
        if (config->stopBits == 2) tio.c_cflag |= CSTOPB; else tio.c_cflag &= ~CSTOPB;
#ifdef CRTSCTS
        if (config->flowControl == CPM_UART_FLOW_RTS_CTS) tio.c_cflag |= CRTSCTS; else tio.c_cflag &= ~CRTSCTS;
#else
        if (config->flowControl == CPM_UART_FLOW_RTS_CTS) return -8;
#endif
        if (config->flowControl == CPM_UART_FLOW_XON_XOFF) tio.c_iflag |= (IXON | IXOFF);
        else tio.c_iflag &= ~(IXON | IXOFF | IXANY);
        tio.c_cflag |= CLOCAL | CREAD;
        tio.c_cc[VMIN] = 0;
        tio.c_cc[VTIME] = 0;
        if (cfsetispeed(&tio, speed) != 0 || cfsetospeed(&tio, speed) != 0) return -6;
        if (tcsetattr(fd, TCSANOW, &tio) != 0) return -4;
        (void)CpmUart_SetDtr(uart, config->dtrEnabled);
        (void)CpmUart_SetRts(uart, config->rtsEnabled);
    }
#endif
    uart->config = *config;
    return 0;
}

int CpmUart_OpenConfig(CpmUart *uart, const char *port, const CpmUartConfig *config)
{
    CpmUartConfig localConfig;
    if (!uart || !port || !*port) return -1;
    if (!config) { CpmUart_DefaultConfig(&localConfig); config = &localConfig; }
    CpmUart_Close(uart);
#if defined(_WIN32)
    {
        char device[256];
        HANDLE handle;
        if (strncmp(port, "\\\\.\\", 4) == 0) snprintf(device, sizeof(device), "%s", port);
        else snprintf(device, sizeof(device), "\\\\.\\%s", port);
        handle = CreateFileA(device, GENERIC_READ | GENERIC_WRITE, 0, NULL, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL);
        if (handle == INVALID_HANDLE_VALUE) return -2;
        uart->handle = (intptr_t)handle;
        uart->opened = 1;
    }
#else
    {
        int fd = open(port, O_RDWR | O_NOCTTY | O_NONBLOCK);
        if (fd < 0) return -2;
        if (fcntl(fd, F_SETFL, fcntl(fd, F_GETFL, 0) & ~O_NONBLOCK) != 0) { close(fd); return -3; }
        uart->handle = (intptr_t)fd;
        uart->opened = 1;
    }
#endif
    if (CpmUart_Configure(uart, config) != 0) { CpmUart_Close(uart); return -4; }
    return 0;
}

int CpmUart_Open(CpmUart *uart, const char *port, int baudrate, int dataBits, char parity, int stopBits)
{
    CpmUartConfig config;
    CpmUart_DefaultConfig(&config);
    config.baudRate = baudrate;
    config.dataBits = dataBits;
    config.parity = CpmUart_ParityFromChar(parity);
    config.stopBits = stopBits;
    return CpmUart_OpenConfig(uart, port, &config);
}

void CpmUart_Close(CpmUart *uart)
{
    if (!uart) return;
    if (uart->opened)
    {
#if defined(_WIN32)
        CloseHandle((HANDLE)uart->handle);
#else
        close((int)uart->handle);
#endif
    }
    CpmUart_Init(uart);
}

int CpmUart_IsOpen(const CpmUart *uart) { return uart && uart->opened; }

int CpmUart_Write(CpmUart *uart, const void *data, size_t size)
{
    if (!uart || !uart->opened || (!data && size)) return -1;
#if defined(_WIN32)
    {
        DWORD written = 0;
        if (!WriteFile((HANDLE)uart->handle, data, (DWORD)size, &written, NULL)) return -2;
        return (int)written;
    }
#else
    {
        ssize_t n = write((int)uart->handle, data, size);
        return n < 0 ? -2 : (int)n;
    }
#endif
}

int CpmUart_WriteAll(CpmUart *uart, const void *data, size_t size)
{
    const unsigned char *bytes = (const unsigned char *)data;
    size_t total = 0;
    if ((!data && size) || !uart || !uart->opened) return -1;
    while (total < size)
    {
        int n = CpmUart_Write(uart, bytes + total, size - total);
        if (n <= 0) return n < 0 ? n : -2;
        total += (size_t)n;
    }
    return (int)total;
}

int CpmUart_WriteText(CpmUart *uart, const char *text)
{
    return text ? CpmUart_WriteAll(uart, text, strlen(text)) : -1;
}

int CpmUart_Read(CpmUart *uart, void *data, size_t size, int timeoutMs)
{
    if (!uart || !uart->opened || !data || size == 0) return -1;
#if defined(_WIN32)
    {
        COMMTIMEOUTS t;
        DWORD received = 0;
        if (!GetCommTimeouts((HANDLE)uart->handle, &t)) return -2;
        t.ReadIntervalTimeout = MAXDWORD;
        t.ReadTotalTimeoutMultiplier = 0;
        t.ReadTotalTimeoutConstant = timeoutMs < 0 ? 0 : (DWORD)timeoutMs;
        if (!SetCommTimeouts((HANDLE)uart->handle, &t)) return -2;
        if (!ReadFile((HANDLE)uart->handle, data, (DWORD)size, &received, NULL)) return -2;
        return (int)received;
    }
#else
    {
        fd_set set;
        struct timeval tv;
        int fd = (int)uart->handle;
        int rc;
        FD_ZERO(&set); FD_SET(fd, &set);
        tv.tv_sec = timeoutMs < 0 ? 0 : timeoutMs / 1000;
        tv.tv_usec = timeoutMs < 0 ? 0 : (timeoutMs % 1000) * 1000;
        rc = select(fd + 1, &set, NULL, NULL, timeoutMs < 0 ? NULL : &tv);
        if (rc <= 0) return rc;
        {
            ssize_t n = read(fd, data, size);
            return n < 0 ? -2 : (int)n;
        }
    }
#endif
}

int CpmUart_ReadExact(CpmUart *uart, void *data, size_t size, int timeoutMs)
{
    unsigned char *bytes = (unsigned char *)data;
    size_t total = 0;
    if (!data || size == 0) return -1;
    while (total < size)
    {
        int n = CpmUart_Read(uart, bytes + total, size - total, timeoutMs);
        if (n <= 0) return total ? (int)total : n;
        total += (size_t)n;
    }
    return (int)total;
}

int CpmUart_ReadUntil(CpmUart *uart, char *buffer, size_t bufferSize, const char *terminator, int timeoutMs)
{
    size_t used = 0;
    size_t termLen;
    if (!buffer || bufferSize == 0 || !terminator || !(termLen = strlen(terminator))) return -1;
    while (used + 1 < bufferSize)
    {
        char ch;
        int rc = CpmUart_Read(uart, &ch, 1, timeoutMs);
        if (rc <= 0) { buffer[used] = '\0'; return used ? (int)used : rc; }
        buffer[used++] = ch;
        buffer[used] = '\0';
        if (used >= termLen && memcmp(buffer + used - termLen, terminator, termLen) == 0) return (int)used;
    }
    return (int)used;
}

int CpmUart_ReadLine(CpmUart *uart, char *buffer, size_t bufferSize, int timeoutMs)
{
    int rc = CpmUart_ReadUntil(uart, buffer, bufferSize, "\n", timeoutMs);
    if (rc > 0)
    {
        size_t n = strlen(buffer);
        while (n && (buffer[n - 1] == '\n' || buffer[n - 1] == '\r')) buffer[--n] = '\0';
        return (int)n;
    }
    return rc;
}

int CpmUart_BytesAvailable(CpmUart *uart)
{
    if (!uart || !uart->opened) return -1;
#if defined(_WIN32)
    {
        COMSTAT stat;
        DWORD errors = 0;
        if (!ClearCommError((HANDLE)uart->handle, &errors, &stat)) return -2;
        return (int)stat.cbInQue;
    }
#else
    {
        int count = 0;
        if (ioctl((int)uart->handle, FIONREAD, &count) != 0) return -2;
        return count;
    }
#endif
}

int CpmUart_Purge(CpmUart *uart, int purgeRx, int purgeTx)
{
    if (!uart || !uart->opened) return -1;
#if defined(_WIN32)
    {
        DWORD flags = 0;
        if (purgeRx) flags |= PURGE_RXABORT | PURGE_RXCLEAR;
        if (purgeTx) flags |= PURGE_TXABORT | PURGE_TXCLEAR;
        return PurgeComm((HANDLE)uart->handle, flags) ? 0 : -2;
    }
#else
    {
        int queue = purgeRx && purgeTx ? TCIOFLUSH : purgeRx ? TCIFLUSH : purgeTx ? TCOFLUSH : -1;
        return queue < 0 ? 0 : (tcflush((int)uart->handle, queue) == 0 ? 0 : -2);
    }
#endif
}

int CpmUart_Flush(CpmUart *uart)
{
    if (!uart || !uart->opened) return -1;
#if defined(_WIN32)
    return FlushFileBuffers((HANDLE)uart->handle) ? 0 : -2;
#else
    return tcdrain((int)uart->handle) == 0 ? 0 : -2;
#endif
}

int CpmUart_SetDtr(CpmUart *uart, int enabled)
{
    if (!uart || !uart->opened) return -1;
#if defined(_WIN32)
    if (!EscapeCommFunction((HANDLE)uart->handle, enabled ? SETDTR : CLRDTR)) return -2;
#else
    {
        int status;
        if (ioctl((int)uart->handle, TIOCMGET, &status) != 0) return -2;
        if (enabled) status |= TIOCM_DTR; else status &= ~TIOCM_DTR;
        if (ioctl((int)uart->handle, TIOCMSET, &status) != 0) return -2;
    }
#endif
    uart->config.dtrEnabled = enabled ? 1 : 0;
    return 0;
}

int CpmUart_SetRts(CpmUart *uart, int enabled)
{
    if (!uart || !uart->opened) return -1;
#if defined(_WIN32)
    if (!EscapeCommFunction((HANDLE)uart->handle, enabled ? SETRTS : CLRRTS)) return -2;
#else
    {
        int status;
        if (ioctl((int)uart->handle, TIOCMGET, &status) != 0) return -2;
        if (enabled) status |= TIOCM_RTS; else status &= ~TIOCM_RTS;
        if (ioctl((int)uart->handle, TIOCMSET, &status) != 0) return -2;
    }
#endif
    uart->config.rtsEnabled = enabled ? 1 : 0;
    return 0;
}

int CpmUart_SendBreak(CpmUart *uart, int durationMs)
{
    if (!uart || !uart->opened) return -1;
#if defined(_WIN32)
    if (!SetCommBreak((HANDLE)uart->handle)) return -2;
    Sleep((DWORD)(durationMs > 0 ? durationMs : 250));
    return ClearCommBreak((HANDLE)uart->handle) ? 0 : -2;
#else
    return tcsendbreak((int)uart->handle, durationMs > 0 ? (durationMs + 249) / 250 : 0) == 0 ? 0 : -2;
#endif
}

const char *CpmUart_ResultText(int result)
{
    switch (result)
    {
        case 0: return "OK / timeout depending on operation";
        case -1: return "Invalid argument or port is not open";
        case -2: return "System I/O error";
        case -3: return "Port state/configuration query failed";
        case -4: return "Port configuration failed";
        case -5: return "Timeout configuration failed";
        case -6: return "Unsupported baud rate";
        case -7: return "Requested parity is unsupported on this platform";
        case -8: return "Requested flow control is unsupported on this platform";
        default: return "See operation return semantics";
    }
}
