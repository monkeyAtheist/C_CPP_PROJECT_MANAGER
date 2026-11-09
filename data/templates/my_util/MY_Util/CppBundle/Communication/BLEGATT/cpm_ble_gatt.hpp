#pragma once
#include "cpm_ble_gatt.h"
#include <stdexcept>
#include <string>
#include <vector>
namespace cpm { class BleGattDevice { CpmBleGattDevice d_{}; public: BleGattDevice(){CpmBleGatt_Init(&d_);} ~BleGattDevice(){CpmBleGatt_Close(&d_);} bool open(const std::string&p){return CpmBleGatt_OpenPath(&d_,p.c_str())==0;} std::vector<CpmBleGattService> services(){std::vector<CpmBleGattService>v(64);size_t n=0;int rc=CpmBleGatt_GetServices(&d_,v.data(),v.size(),&n);if(rc<0)throw std::runtime_error(CpmBleGatt_LastErrorText());v.resize(n<v.size()?n:v.size());return v;} std::vector<CpmBleGattCharacteristic> characteristics(const CpmBleGattService&s){std::vector<CpmBleGattCharacteristic>v(128);size_t n=0;int rc=CpmBleGatt_GetCharacteristics(&d_,&s,v.data(),v.size(),&n);if(rc<0)throw std::runtime_error(CpmBleGatt_LastErrorText());v.resize(n<v.size()?n:v.size());return v;} std::vector<uint8_t> read(const CpmBleGattCharacteristic&c,size_t max=512){std::vector<uint8_t>v(max);size_t n=0;if(CpmBleGatt_Read(&d_,&c,v.data(),v.size(),&n)!=0)throw std::runtime_error(CpmBleGatt_LastErrorText());v.resize(n);return v;} }; }
