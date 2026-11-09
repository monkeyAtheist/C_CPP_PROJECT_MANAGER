/** @file cpm_containers.h @brief Generic vector and ring-buffer containers for C. */
#ifndef CPM_CONTAINERS_H
#define CPM_CONTAINERS_H
#include <stddef.h>
#ifdef __cplusplus
extern "C" {
#endif

typedef struct CpmVector {
    unsigned char *data;
    size_t count;
    size_t capacity;
    size_t elementSize;
} CpmVector;

typedef struct CpmRingBuffer {
    unsigned char *data;
    size_t capacity;
    size_t count;
    size_t head;
    size_t tail;
    size_t elementSize;
} CpmRingBuffer;

int CpmVector_Init(CpmVector *vector, size_t elementSize);
void CpmVector_Free(CpmVector *vector);
void CpmVector_Clear(CpmVector *vector);
int CpmVector_Reserve(CpmVector *vector, size_t capacity);
int CpmVector_Push(CpmVector *vector, const void *element);
int CpmVector_Insert(CpmVector *vector, size_t index, const void *element);
int CpmVector_Remove(CpmVector *vector, size_t index);
void *CpmVector_At(CpmVector *vector, size_t index);
const void *CpmVector_AtConst(const CpmVector *vector, size_t index);

int CpmRingBuffer_Init(CpmRingBuffer *ring, size_t elementSize, size_t capacity);
void CpmRingBuffer_Free(CpmRingBuffer *ring);
void CpmRingBuffer_Clear(CpmRingBuffer *ring);
int CpmRingBuffer_Push(CpmRingBuffer *ring, const void *element, int overwriteOldest);
int CpmRingBuffer_Pop(CpmRingBuffer *ring, void *element);
int CpmRingBuffer_Peek(const CpmRingBuffer *ring, size_t index, void *element);

#ifdef __cplusplus
}
#endif
#endif
