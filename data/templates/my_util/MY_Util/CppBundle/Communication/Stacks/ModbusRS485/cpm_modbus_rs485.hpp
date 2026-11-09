#pragma once
#include "cpm_modbus_rs485.h"
#include <stdexcept>
#include <vector>
namespace cpm { class ModbusRs485Client { CpmModbusRs485 c_{}; public: ModbusRs485Client(CpmRs485*bus,uint8_t slave,int timeoutMs=500){CpmModbusRs485_Init(&c_,bus,slave,timeoutMs);} std::vector<uint16_t> readHolding(uint16_t a,uint16_t q){std::vector<uint16_t>v(q);size_t n=0;if(CpmModbusRs485_ReadHolding(&c_,a,q,v.data(),v.size(),&n)!=0)throw std::runtime_error("Modbus RTU read failed");v.resize(n);return v;} void write(uint16_t a,uint16_t v){if(CpmModbusRs485_WriteSingle(&c_,a,v)!=0)throw std::runtime_error("Modbus RTU write failed");} }; }
