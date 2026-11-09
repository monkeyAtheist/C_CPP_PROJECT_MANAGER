#pragma once
#include "cpm_modbus.h"
#include <cstdint>
#include <vector>

namespace cpm::modbus
{
inline std::vector<std::uint8_t> rtuRead(std::uint8_t slave, std::uint8_t function, std::uint16_t address, std::uint16_t quantity)
{ std::vector<std::uint8_t> frame(256); std::size_t n=0; if(CpmModbus_RtuBuildRead(slave,function,address,quantity,frame.data(),frame.size(),&n)!=0)return{}; frame.resize(n); return frame; }
inline std::vector<std::uint8_t> rtuWriteRegister(std::uint8_t slave, std::uint16_t address, std::uint16_t value)
{ std::vector<std::uint8_t> frame(8); std::size_t n=0; if(CpmModbus_RtuBuildWriteSingleRegister(slave,address,value,frame.data(),frame.size(),&n)!=0)return{}; frame.resize(n); return frame; }
inline std::vector<std::uint8_t> tcpRead(std::uint16_t transaction, std::uint8_t unit, std::uint8_t function, std::uint16_t address, std::uint16_t quantity)
{ std::vector<std::uint8_t> frame(12); std::size_t n=0; if(CpmModbus_TcpBuildRead(transaction,unit,function,address,quantity,frame.data(),frame.size(),&n)!=0)return{}; frame.resize(n); return frame; }
}
