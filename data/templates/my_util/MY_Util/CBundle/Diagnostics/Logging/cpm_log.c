#if !defined(_WIN32)
#ifndef _POSIX_C_SOURCE
#define _POSIX_C_SOURCE 200809L
#endif
#endif
#include "cpm_log.h"
#include <stdio.h>
#include <string.h>
#include <time.h>

static CpmLogLevel g_level = CPM_LOG_INFO;
static int g_console = 1;
static FILE *g_file = NULL;
static CpmLogCallback g_callback = NULL;
static void *g_callbackData = NULL;

const char *CpmLog_LevelName(CpmLogLevel level){switch(level){case CPM_LOG_TRACE:return"TRACE";case CPM_LOG_DEBUG:return"DEBUG";case CPM_LOG_INFO:return"INFO";case CPM_LOG_WARN:return"WARN";case CPM_LOG_ERROR:return"ERROR";case CPM_LOG_FATAL:return"FATAL";case CPM_LOG_OFF:return"OFF";default:return"?";}}
void CpmLog_Init(void){g_level=CPM_LOG_INFO;g_console=1;g_callback=NULL;g_callbackData=NULL;}
void CpmLog_Shutdown(void){CpmLog_CloseFile();g_callback=NULL;g_callbackData=NULL;}
void CpmLog_SetLevel(CpmLogLevel level){g_level=level;}CpmLogLevel CpmLog_GetLevel(void){return g_level;}void CpmLog_EnableConsole(int enabled){g_console=enabled!=0;}
int CpmLog_SetFile(const char *path,int append){FILE*f;if(!path||!*path)return-1;f=fopen(path,append?"ab":"wb");if(!f)return-2;if(g_file)fclose(g_file);g_file=f;return 0;}
void CpmLog_CloseFile(void){if(g_file){fclose(g_file);g_file=NULL;}}
void CpmLog_SetCallback(CpmLogCallback cb,void*ud){g_callback=cb;g_callbackData=ud;}
static void timestamp(char*b,size_t n){time_t now=time(NULL);struct tm tmv;
#if defined(_WIN32)
 if(localtime_s(&tmv,&now)!=0){if(n)b[0]='\0';return;}
#else
 if(localtime_r(&now,&tmv)==NULL){if(n)b[0]='\0';return;}
#endif
 strftime(b,n,"%Y-%m-%d %H:%M:%S",&tmv);}
void CpmLog_WriteV(CpmLogLevel level,const char*fmt,va_list args){char msg[2048],line[2304],ts[32];int m,n;va_list copy;if(!fmt||level<g_level||level>=CPM_LOG_OFF)return;va_copy(copy,args);m=vsnprintf(msg,sizeof(msg),fmt,copy);va_end(copy);if(m<0)return;timestamp(ts,sizeof(ts));n=snprintf(line,sizeof(line),"[%s] [%-5s] %s%s",ts,CpmLog_LevelName(level),msg,(m>0&&msg[(size_t)m<sizeof(msg)?(size_t)m-1:sizeof(msg)-2]=='\n')?"":"\n");if(n<0)return;if(g_console){FILE*out=level>=CPM_LOG_ERROR?stderr:stdout;fputs(line,out);fflush(out);}if(g_file){fputs(line,g_file);fflush(g_file);}if(g_callback)g_callback(level,line,g_callbackData);}
void CpmLog_Write(CpmLogLevel level,const char*fmt,...){va_list args;va_start(args,fmt);CpmLog_WriteV(level,fmt,args);va_end(args);}
void CpmLog_Hex(CpmLogLevel level,const char*label,const void*data,size_t size,size_t perLine){const unsigned char*p=(const unsigned char*)data;size_t i,j;if(level<g_level||level>=CPM_LOG_OFF)return;if(!p&&size){CpmLog_Write(level,"%s: <null>",label?label:"HEX");return;}if(!perLine)perLine=16;CpmLog_Write(level,"%s (%lu bytes)",label?label:"HEX",(unsigned long)size);for(i=0;i<size;i+=perLine){char line[256];size_t used=0;int w=snprintf(line,sizeof(line),"%04lX: ",(unsigned long)i);if(w<0)continue;used=(size_t)w;for(j=0;j<perLine&&i+j<size&&used+4<sizeof(line);j++){w=snprintf(line+used,sizeof(line)-used,"%02X ",p[i+j]);if(w<0)break;used+=(size_t)w;}CpmLog_Write(level,"%s",line);}}
