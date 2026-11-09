/** @file cpm_json.h @brief Dependency-free JSON tokenizer, typed accessors and fixed-buffer writer. */
#ifndef CPM_JSON_H
#define CPM_JSON_H
#include <stddef.h>
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif

typedef enum CpmJsonType { CPM_JSON_UNDEFINED=0, CPM_JSON_OBJECT, CPM_JSON_ARRAY, CPM_JSON_STRING, CPM_JSON_PRIMITIVE } CpmJsonType;
typedef struct CpmJsonToken { CpmJsonType type; int start; int end; int size; int parent; } CpmJsonToken;

typedef struct CpmJsonWriter {
    char *buffer; size_t capacity; size_t length; int depth; int error;
    char container[32]; unsigned int count[32]; int expectingValue[32];
} CpmJsonWriter;

int CpmJson_Parse(const char *json, CpmJsonToken *tokens, size_t tokenCapacity);
int CpmJson_ObjectValue(const char *json, const CpmJsonToken *tokens, int tokenCount, int objectIndex, const char *key);
int CpmJson_ArrayElement(const CpmJsonToken *tokens, int tokenCount, int arrayIndex, size_t elementIndex);
int CpmJson_TokenEquals(const char *json, const CpmJsonToken *token, const char *text);
int CpmJson_GetString(const char *json, const CpmJsonToken *token, char *output, size_t outputSize);
int CpmJson_GetInt64(const char *json, const CpmJsonToken *token, int64_t *value);
int CpmJson_GetDouble(const char *json, const CpmJsonToken *token, double *value);
int CpmJson_GetBool(const char *json, const CpmJsonToken *token, int *value);

void CpmJsonWriter_Init(CpmJsonWriter *writer, char *buffer, size_t capacity);
int CpmJsonWriter_BeginObject(CpmJsonWriter *writer);
int CpmJsonWriter_EndObject(CpmJsonWriter *writer);
int CpmJsonWriter_BeginArray(CpmJsonWriter *writer);
int CpmJsonWriter_EndArray(CpmJsonWriter *writer);
int CpmJsonWriter_Key(CpmJsonWriter *writer, const char *key);
int CpmJsonWriter_String(CpmJsonWriter *writer, const char *value);
int CpmJsonWriter_Int64(CpmJsonWriter *writer, int64_t value);
int CpmJsonWriter_Double(CpmJsonWriter *writer, double value);
int CpmJsonWriter_Bool(CpmJsonWriter *writer, int value);
int CpmJsonWriter_Null(CpmJsonWriter *writer);
const char *CpmJsonWriter_Data(const CpmJsonWriter *writer);

#ifdef __cplusplus
}
#endif
#endif
