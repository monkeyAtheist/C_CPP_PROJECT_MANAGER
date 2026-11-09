#pragma once
#include "cpm_usb.h"
#include <chrono>
#include <stdexcept>
#include <string>
#include <vector>
namespace cpm { class UsbRuntime { CpmUsbRuntime r_{}; public: UsbRuntime(){CpmUsb_RuntimeInit(&r_);} ~UsbRuntime(){CpmUsb_Unload(&r_);} bool load(){return CpmUsb_Load(&r_)==0;} CpmUsbRuntime*native(){return &r_;} std::vector<CpmUsbDeviceInfo> enumerate(std::size_t max=256){std::vector<CpmUsbDeviceInfo>v(max);size_t n=0;int rc=CpmUsb_Enumerate(&r_,v.data(),v.size(),&n);if(rc<0)throw std::runtime_error(CpmUsb_LastErrorText());v.resize(n<max?n:max);return v;} }; class UsbDevice { CpmUsbDevice d_{}; public: UsbDevice(){CpmUsb_DeviceInit(&d_);} ~UsbDevice(){CpmUsb_Close(&d_);} UsbDevice(const UsbDevice&)=delete; UsbDevice&operator=(const UsbDevice&)=delete; bool open(UsbRuntime&r,uint16_t vid,uint16_t pid,const std::string&serial={}){return CpmUsb_OpenVidPid(r.native(),&d_,vid,pid,serial.empty()?nullptr:serial.c_str())==0;} void claim(int i){if(CpmUsb_ClaimInterface(&d_,i)!=0)throw std::runtime_error("USB claim failed");} int bulk(uint8_t ep,void*data,size_t n,std::chrono::milliseconds t=std::chrono::seconds(1)){return CpmUsb_BulkTransfer(&d_,ep,data,n,(int)t.count());} }; }
