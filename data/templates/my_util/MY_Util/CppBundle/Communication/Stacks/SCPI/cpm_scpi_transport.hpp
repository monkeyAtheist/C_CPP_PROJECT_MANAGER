#pragma once
#include "cpm_scpi_transport.h"
#include <chrono>
#include <string>
namespace cpm { class ScpiTcpSession { CpmScpiTcpTransport t_{}; CpmScpi s_{}; public: ScpiTcpSession(){CpmScpiTcp_Init(&t_);} ~ScpiTcpSession(){CpmScpiTcp_Close(&t_);} bool connect(const std::string&h,uint16_t p=5025,std::chrono::milliseconds ms=std::chrono::seconds(3)){if(CpmScpiTcp_Connect(&t_,h.c_str(),p,(int)ms.count())!=0)return false;CpmScpi_BindTcp(&s_,&t_);return true;} CpmScpi*native(){return &s_;} }; }
