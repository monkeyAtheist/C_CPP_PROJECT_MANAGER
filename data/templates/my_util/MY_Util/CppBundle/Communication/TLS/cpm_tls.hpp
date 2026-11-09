#pragma once
#include "cpm_tls.h"
#include <chrono>
#include <stdexcept>
#include <string>
#include <vector>
namespace cpm { class TlsClient { CpmTlsClient c_{}; public: TlsClient(){CpmTls_Init(&c_);} ~TlsClient(){CpmTls_Close(&c_);} TlsClient(const TlsClient&)=delete; TlsClient&operator=(const TlsClient&)=delete; bool connect(const std::string&host,std::uint16_t port,const CpmTlsConfig&cfg,std::chrono::milliseconds t=std::chrono::seconds(5)){return CpmTls_Connect(&c_,host.c_str(),port,&cfg,(int)t.count())==0;} void close(){CpmTls_Close(&c_);} int write(const void*d,std::size_t n){return CpmTls_Write(&c_,d,n);} std::vector<std::uint8_t> read(std::size_t max,std::chrono::milliseconds t=std::chrono::seconds(1)){std::vector<std::uint8_t>b(max);int n=CpmTls_Read(&c_,b.data(),b.size(),(int)t.count());if(n<0)throw std::runtime_error(CpmTls_LastErrorText());b.resize((std::size_t)n);return b;} static bool available(){return CpmTls_IsAvailable()!=0;} }; }
