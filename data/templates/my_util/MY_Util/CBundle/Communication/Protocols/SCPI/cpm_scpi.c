#include "cpm_scpi.h"

#include <ctype.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static void CpmScpi_CopyTerminator(char destination[4], const char *source)
{
    size_t n = source ? strlen(source) : 0;
    if (n > 3) n = 3;
    memset(destination, 0, 4);
    if (n) memcpy(destination, source, n);
}

void CpmScpi_Init(CpmScpi *scpi, void *context, CpmScpiWriteFn writeFn, CpmScpiReadFn readFn)
{
    if (!scpi) return;
    memset(scpi, 0, sizeof(*scpi));
    scpi->context = context;
    scpi->writeFn = writeFn;
    scpi->readFn = readFn;
    CpmScpi_CopyTerminator(scpi->txTerminator, "\n");
    CpmScpi_CopyTerminator(scpi->rxTerminator, "\n");
    scpi->timeoutMs = 1000;
}

void CpmScpi_SetTerminators(CpmScpi *scpi, const char *txTerminator, const char *rxTerminator)
{
    if (!scpi) return;
    CpmScpi_CopyTerminator(scpi->txTerminator, txTerminator);
    CpmScpi_CopyTerminator(scpi->rxTerminator, rxTerminator);
}

void CpmScpi_SetTimeout(CpmScpi *scpi, int timeoutMs) { if (scpi) scpi->timeoutMs = timeoutMs; }

static int CpmScpi_ReadExactRaw(CpmScpi *scpi, void *data, size_t size)
{
    unsigned char *bytes = (unsigned char *)data;
    size_t total = 0;
    if (!scpi || !scpi->readFn || (!data && size)) return -1;
    while (total < size)
    {
        int n = scpi->readFn(scpi->context, bytes + total, size - total, scpi->timeoutMs);
        if (n <= 0) return -2;
        total += (size_t)n;
    }
    return (int)total;
}

static int CpmScpi_WriteAll(CpmScpi *scpi, const void *data, size_t size)
{
    const unsigned char *bytes = (const unsigned char *)data;
    size_t total = 0;
    if (!scpi || !scpi->writeFn || (!data && size)) return -1;
    while (total < size)
    {
        int n = scpi->writeFn(scpi->context, bytes + total, size - total);
        if (n <= 0) return -2;
        total += (size_t)n;
    }
    return (int)total;
}

int CpmScpi_Write(CpmScpi *scpi, const char *command)
{
    size_t commandSize, terminatorSize;
    if (!scpi || !command) return -1;
    commandSize = strlen(command);
    terminatorSize = strlen(scpi->txTerminator);
    if (CpmScpi_WriteAll(scpi, command, commandSize) != (int)commandSize) return -2;
    if (terminatorSize && CpmScpi_WriteAll(scpi, scpi->txTerminator, terminatorSize) != (int)terminatorSize) return -3;
    return 0;
}

static int CpmScpi_ReadUntil(CpmScpi *scpi, char *buffer, size_t bufferSize)
{
    size_t used = 0;
    size_t termLen;
    if (!scpi || !scpi->readFn || !buffer || bufferSize == 0) return -1;
    termLen = strlen(scpi->rxTerminator);
    while (used + 1 < bufferSize)
    {
        char ch;
        int n = scpi->readFn(scpi->context, &ch, 1, scpi->timeoutMs);
        if (n <= 0) { buffer[used] = '\0'; return used ? (int)used : n; }
        buffer[used++] = ch;
        buffer[used] = '\0';
        if (termLen && used >= termLen && memcmp(buffer + used - termLen, scpi->rxTerminator, termLen) == 0)
        {
            used -= termLen;
            buffer[used] = '\0';
            return (int)used;
        }
        if (!termLen) return (int)used;
    }
    return (int)used;
}

int CpmScpi_Query(CpmScpi *scpi, const char *command, char *response, size_t responseSize)
{
    int rc = CpmScpi_Write(scpi, command);
    if (rc != 0) return rc;
    return CpmScpi_ReadUntil(scpi, response, responseSize);
}

int CpmScpi_QueryInt(CpmScpi *scpi, const char *command, long long *value)
{
    char response[128]; char *end;
    long long parsed;
    if (!value) return -1;
    if (CpmScpi_Query(scpi, command, response, sizeof(response)) <= 0) return -2;
    parsed = strtoll(response, &end, 0);
    if (end == response) return -3;
    while (*end && isspace((unsigned char)*end)) ++end;
    if (*end) return -3;
    *value = parsed; return 0;
}

int CpmScpi_QueryDouble(CpmScpi *scpi, const char *command, double *value)
{
    char response[128]; char *end; double parsed;
    if (!value) return -1;
    if (CpmScpi_Query(scpi, command, response, sizeof(response)) <= 0) return -2;
    parsed = strtod(response, &end);
    if (end == response) return -3;
    while (*end && isspace((unsigned char)*end)) ++end;
    if (*end) return -3;
    *value = parsed; return 0;
}

int CpmScpi_QueryBool(CpmScpi *scpi, const char *command, int *value)
{
    char response[32];
    if (!value) return -1;
    if (CpmScpi_Query(scpi, command, response, sizeof(response)) <= 0) return -2;
    if (strcmp(response, "1") == 0 || strcmp(response, "ON") == 0 || strcmp(response, "TRUE") == 0) { *value = 1; return 0; }
    if (strcmp(response, "0") == 0 || strcmp(response, "OFF") == 0 || strcmp(response, "FALSE") == 0) { *value = 0; return 0; }
    return -3;
}

int CpmScpi_QueryBinaryBlock(CpmScpi *scpi, const char *command, void *data, size_t capacity, size_t *dataSize)
{
    char prefix[2];
    char digits[10];
    int digitCount, i;
    size_t length = 0, total = 0;
    unsigned char *bytes = (unsigned char *)data;
    if (!scpi || !data || !dataSize) return -1;
    if (CpmScpi_Write(scpi, command) != 0) return -2;
    if (CpmScpi_ReadExactRaw(scpi, prefix, 2) != 2 || prefix[0] != '#' || prefix[1] < '0' || prefix[1] > '9') return -3;
    digitCount = prefix[1] - '0';
    if (digitCount == 0) return -4; /* Indefinite blocks deliberately not supported by this helper. */
    if (digitCount >= (int)sizeof(digits)) return -3;
    if (CpmScpi_ReadExactRaw(scpi, digits, (size_t)digitCount) != digitCount) return -3;
    for (i = 0; i < digitCount; ++i)
    {
        if (digits[i] < '0' || digits[i] > '9') return -3;
        length = length * 10u + (size_t)(digits[i] - '0');
    }
    if (length > capacity) { *dataSize = length; return -5; }
    while (total < length)
    {
        int n = scpi->readFn(scpi->context, bytes + total, length - total, scpi->timeoutMs);
        if (n <= 0) return -6;
        total += (size_t)n;
    }
    *dataSize = total;
    return 0;
}

int CpmScpi_Idn(CpmScpi *scpi, char *response, size_t responseSize) { return CpmScpi_Query(scpi, "*IDN?", response, responseSize); }
int CpmScpi_Clear(CpmScpi *scpi) { return CpmScpi_Write(scpi, "*CLS"); }
int CpmScpi_Reset(CpmScpi *scpi) { return CpmScpi_Write(scpi, "*RST"); }
int CpmScpi_Opc(CpmScpi *scpi, int *complete) { return CpmScpi_QueryBool(scpi, "*OPC?", complete); }
int CpmScpi_SystemError(CpmScpi *scpi, char *response, size_t responseSize) { return CpmScpi_Query(scpi, "SYST:ERR?", response, responseSize); }
