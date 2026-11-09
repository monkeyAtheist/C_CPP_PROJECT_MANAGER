/** @file cpm_csv.h @brief Lightweight CSV reader/writer with quoted-field support. */
#ifndef CPM_CSV_H
#define CPM_CSV_H
#include <stddef.h>
#include <stdio.h>
#ifdef __cplusplus
extern "C" {
#endif

typedef struct CpmCsvRow { char **fields; size_t count; } CpmCsvRow;
typedef int (*CpmCsvRowCallback)(const CpmCsvRow *row, size_t rowIndex, void *userData);

int CpmCsv_ParseLine(const char *line, char delimiter, CpmCsvRow *row);
void CpmCsv_FreeRow(CpmCsvRow *row);
int CpmCsv_ReadFile(const char *path, char delimiter, CpmCsvRowCallback callback, void *userData);
int CpmCsv_WriteField(FILE *file, const char *value, char delimiter);
int CpmCsv_WriteRow(FILE *file, const char *const *fields, size_t fieldCount, char delimiter);
int CpmCsv_AppendRow(const char *path, const char *const *fields, size_t fieldCount, char delimiter);

#ifdef __cplusplus
}
#endif
#endif
