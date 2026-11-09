#pragma once
#include "cpm_process.h"
#include <cstdlib>
#include <cstdint>
#include <stdexcept>
#include <string>
#include <utility>
namespace cpm {
struct ProcessResult { int exitCode{0}; std::string output; };
class Process {
public:
    static int run(const std::string& command) { int code=0; if(CpmProcess_Run(command.c_str(), &code)!=0) throw std::runtime_error("Process launch failed"); return code; }
    static ProcessResult runCapture(const std::string& command) {
        char* data=nullptr; size_t size=0; int code=0;
        if(CpmProcess_RunCapture(command.c_str(), &data, &size, &code)!=0) throw std::runtime_error("Process capture failed");
        ProcessResult r{code, data ? std::string(data,size) : std::string{}}; std::free(data); return r;
    }
    static void startDetached(const std::string& command) { if(CpmProcess_StartDetached(command.c_str())!=0) throw std::runtime_error("Detached process launch failed"); }
    static std::uint64_t currentId() noexcept { return CpmProcess_CurrentId(); }
    static std::string getenv(const std::string& name, const std::string& fallback={}) {
        char buf[4096]{}; return CpmProcess_GetEnv(name.c_str(),buf,sizeof(buf))==0 ? std::string(buf) : fallback;
    }
    static bool setenv(const std::string& name, const std::string& value) { return CpmProcess_SetEnv(name.c_str(),value.c_str())==0; }
};
}
