#include "cpm_containers.h"
#include <stdlib.h>
#include <string.h>

int CpmVector_Init(CpmVector*v,size_t es){if(!v||!es)return-1;v->data=NULL;v->count=0;v->capacity=0;v->elementSize=es;return 0;}
void CpmVector_Free(CpmVector*v){if(v){free(v->data);v->data=NULL;v->count=v->capacity=v->elementSize=0;}}
void CpmVector_Clear(CpmVector*v){if(v)v->count=0;}
int CpmVector_Reserve(CpmVector*v,size_t cap){unsigned char*p;size_t next;if(!v||!v->elementSize)return-1;if(cap<=v->capacity)return 0;if(cap>(size_t)-1/v->elementSize)return-2;next=v->capacity?v->capacity:8;while(next<cap){if(next>(size_t)-1/2){next=cap;break;}next*=2;}p=(unsigned char*)realloc(v->data,next*v->elementSize);if(!p)return-3;v->data=p;v->capacity=next;return 0;}
int CpmVector_Push(CpmVector*v,const void*e){if(!v||!e)return-1;if(CpmVector_Reserve(v,v->count+1))return-2;memcpy(v->data+v->count*v->elementSize,e,v->elementSize);v->count++;return 0;}
int CpmVector_Insert(CpmVector*v,size_t i,const void*e){if(!v||!e||i>v->count)return-1;if(CpmVector_Reserve(v,v->count+1))return-2;memmove(v->data+(i+1)*v->elementSize,v->data+i*v->elementSize,(v->count-i)*v->elementSize);memcpy(v->data+i*v->elementSize,e,v->elementSize);v->count++;return 0;}
int CpmVector_Remove(CpmVector*v,size_t i){if(!v||i>=v->count)return-1;memmove(v->data+i*v->elementSize,v->data+(i+1)*v->elementSize,(v->count-i-1)*v->elementSize);v->count--;return 0;}
void*CpmVector_At(CpmVector*v,size_t i){return v&&i<v->count?v->data+i*v->elementSize:NULL;}const void*CpmVector_AtConst(const CpmVector*v,size_t i){return v&&i<v->count?v->data+i*v->elementSize:NULL;}
int CpmRingBuffer_Init(CpmRingBuffer*r,size_t es,size_t cap){if(!r||!es||!cap||cap>(size_t)-1/es)return-1;r->data=(unsigned char*)malloc(es*cap);if(!r->data)return-2;r->capacity=cap;r->count=0;r->head=0;r->tail=0;r->elementSize=es;return 0;}
void CpmRingBuffer_Free(CpmRingBuffer*r){if(r){free(r->data);r->data=NULL;r->capacity=r->count=r->head=r->tail=r->elementSize=0;}}
void CpmRingBuffer_Clear(CpmRingBuffer*r){if(r){r->count=0;r->head=r->tail=0;}}
int CpmRingBuffer_Push(CpmRingBuffer*r,const void*e,int overwrite){if(!r||!r->data||!e)return-1;if(r->count==r->capacity){if(!overwrite)return 1;r->head=(r->head+1)%r->capacity;r->count--;}memcpy(r->data+r->tail*r->elementSize,e,r->elementSize);r->tail=(r->tail+1)%r->capacity;r->count++;return 0;}
int CpmRingBuffer_Pop(CpmRingBuffer*r,void*e){if(!r||!r->data||!e)return-1;if(!r->count)return 1;memcpy(e,r->data+r->head*r->elementSize,r->elementSize);r->head=(r->head+1)%r->capacity;r->count--;return 0;}
int CpmRingBuffer_Peek(const CpmRingBuffer*r,size_t i,void*e){size_t idx;if(!r||!r->data||!e||i>=r->count)return-1;idx=(r->head+i)%r->capacity;memcpy(e,r->data+idx*r->elementSize,r->elementSize);return 0;}
