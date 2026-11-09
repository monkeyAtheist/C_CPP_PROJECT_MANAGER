#pragma once
#include "cpm_log.h"
#include <cstddef>
#include <string>
#include <vector>
namespace cpm {
enum class LogLevel { Trace=CPM_LOG_TRACE, Debug=CPM_LOG_DEBUG, Info=CPM_LOG_INFO, Warn=CPM_LOG_WARN, Error=CPM_LOG_ERROR, Fatal=CPM_LOG_FATAL, Off=CPM_LOG_OFF };
class Logger { public: Logger(){CpmLog_Init();} ~Logger(){CpmLog_Shutdown();} Logger(const Logger&)=delete;Logger&operator=(const Logger&)=delete; void setLevel(LogLevel l){CpmLog_SetLevel(static_cast<CpmLogLevel>(l));} void enableConsole(bool e){CpmLog_EnableConsole(e?1:0);} bool setFile(const std::string&p,bool append=true){return CpmLog_SetFile(p.c_str(),append?1:0)==0;} void closeFile(){CpmLog_CloseFile();} template<class...A> void write(LogLevel l,const char*fmt,A...a){CpmLog_Write(static_cast<CpmLogLevel>(l),fmt,a...);} void hex(LogLevel l,const std::string&label,const void*data,size_t n,size_t width=16){CpmLog_Hex(static_cast<CpmLogLevel>(l),label.c_str(),data,n,width);} };
}
