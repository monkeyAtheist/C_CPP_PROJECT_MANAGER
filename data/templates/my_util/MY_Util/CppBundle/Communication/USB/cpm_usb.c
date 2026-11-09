#include "cpm_usb.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#if defined(_WIN32)
#include <windows.h>
#else
#include <dlfcn.h>
#endif
/* Minimal libusb-1.0 ABI declarations: no libusb headers are required. */
typedef struct libusb_context libusb_context;typedef struct libusb_device libusb_device;typedef struct libusb_device_handle libusb_device_handle;
typedef struct LibusbDescriptor{uint8_t bLength,bDescriptorType;uint16_t bcdUSB;uint8_t bDeviceClass,bDeviceSubClass,bDeviceProtocol,bMaxPacketSize0;uint16_t idVendor,idProduct,bcdDevice;uint8_t iManufacturer,iProduct,iSerialNumber,bNumConfigurations;} LibusbDescriptor;
typedef int(*FnInit)(libusb_context**);typedef void(*FnExit)(libusb_context*);typedef intptr_t(*FnGetList)(libusb_context*,libusb_device***);typedef void(*FnFreeList)(libusb_device**,int);typedef int(*FnDesc)(libusb_device*,LibusbDescriptor*);typedef int(*FnOpen)(libusb_device*,libusb_device_handle**);typedef void(*FnClose)(libusb_device_handle*);typedef int(*FnString)(libusb_device_handle*,uint8_t,unsigned char*,int);typedef int(*FnClaim)(libusb_device_handle*,int);typedef int(*FnRelease)(libusb_device_handle*,int);typedef int(*FnBulk)(libusb_device_handle*,unsigned char,unsigned char*,int,int*,unsigned int);typedef int(*FnInterrupt)(libusb_device_handle*,unsigned char,unsigned char*,int,int*,unsigned int);typedef int(*FnControl)(libusb_device_handle*,uint8_t,uint8_t,uint16_t,uint16_t,unsigned char*,uint16_t,unsigned int);typedef uint8_t(*FnBus)(libusb_device*);typedef uint8_t(*FnAddr)(libusb_device*);
enum{F_INIT,F_EXIT,F_LIST,F_FREE,F_DESC,F_OPEN,F_CLOSE,F_STRING,F_CLAIM,F_RELEASE,F_BULK,F_INTERRUPT,F_CONTROL,F_BUS,F_ADDR,F_COUNT};static char g_error[256];
static void* sym(void*l,const char*n){
#if defined(_WIN32)
 return (void*)GetProcAddress((HMODULE)l,n);
#else
 return dlsym(l,n);
#endif
}
static void close_lib(void*l){if(!l)return;
#if defined(_WIN32)
 FreeLibrary((HMODULE)l);
#else
 dlclose(l);
#endif
}
void CpmUsb_RuntimeInit(CpmUsbRuntime*r){if(r)memset(r,0,sizeof(*r));}const char*CpmUsb_LastErrorText(void){return g_error[0]?g_error:"No USB error";}
int CpmUsb_LoadLibrary(CpmUsbRuntime*r,const char*p){static const char*n[]={"libusb_init","libusb_exit","libusb_get_device_list","libusb_free_device_list","libusb_get_device_descriptor","libusb_open","libusb_close","libusb_get_string_descriptor_ascii","libusb_claim_interface","libusb_release_interface","libusb_bulk_transfer","libusb_interrupt_transfer","libusb_control_transfer","libusb_get_bus_number","libusb_get_device_address"};int i;libusb_context*ctx=NULL;if(!r||!p)return -1;CpmUsb_Unload(r);
#if defined(_WIN32)
 r->library=(void*)LoadLibraryA(p);
#else
 r->library=dlopen(p,RTLD_NOW|RTLD_LOCAL);
#endif
 if(!r->library){snprintf(g_error,sizeof(g_error),"Unable to load %s",p);return -2;}for(i=0;i<F_COUNT;i++){r->functions[i]=sym(r->library,n[i]);if(!r->functions[i]){snprintf(g_error,sizeof(g_error),"Missing libusb export: %s",n[i]);CpmUsb_Unload(r);return -3;}}if(((FnInit)r->functions[F_INIT])(&ctx)!=0){snprintf(g_error,sizeof(g_error),"libusb_init failed");CpmUsb_Unload(r);return -4;}r->context=ctx;g_error[0]='\0';return 0;}
int CpmUsb_Load(CpmUsbRuntime*r){const char*names[]=
#if defined(_WIN32)
 {"libusb-1.0.dll"};
#elif defined(__APPLE__)
 {"libusb-1.0.dylib","/opt/homebrew/lib/libusb-1.0.dylib","/usr/local/lib/libusb-1.0.dylib"};
#else
 {"libusb-1.0.so.0","libusb-1.0.so"};
#endif
 size_t i;for(i=0;i<sizeof(names)/sizeof(names[0]);i++)if(CpmUsb_LoadLibrary(r,names[i])==0)return 0;snprintf(g_error,sizeof(g_error),"No usable libusb-1.0 runtime found");return -1;}
void CpmUsb_Unload(CpmUsbRuntime*r){if(!r)return;if(r->context&&r->functions[F_EXIT])((FnExit)r->functions[F_EXIT])((libusb_context*)r->context);if(r->library)close_lib(r->library);CpmUsb_RuntimeInit(r);}int CpmUsb_IsLoaded(const CpmUsbRuntime*r){return r&&r->library&&r->context;}
static void readstr(CpmUsbRuntime*r,libusb_device_handle*h,uint8_t idx,char*out,size_t cap){int n;if(!out||!cap)return;out[0]='\0';if(!idx)return;n=((FnString)r->functions[F_STRING])(h,idx,(unsigned char*)out,(int)(cap-1));if(n>0)out[n<(int)cap?(size_t)n:cap-1]='\0';}
int CpmUsb_Enumerate(CpmUsbRuntime*r,CpmUsbDeviceInfo*items,size_t cap,size_t*count){libusb_device**list=NULL;intptr_t n,i;size_t used=0;if(count)*count=0;if(!CpmUsb_IsLoaded(r)||(!items&&cap))return -1;n=((FnGetList)r->functions[F_LIST])((libusb_context*)r->context,&list);if(n<0)return -2;for(i=0;i<n;i++){LibusbDescriptor d;libusb_device_handle*h=NULL;if(((FnDesc)r->functions[F_DESC])(list[i],&d)!=0)continue;if(used<cap){CpmUsbDeviceInfo*x=&items[used];memset(x,0,sizeof(*x));x->vendorId=d.idVendor;x->productId=d.idProduct;x->deviceClass=d.bDeviceClass;x->deviceSubClass=d.bDeviceSubClass;x->deviceProtocol=d.bDeviceProtocol;x->busNumber=((FnBus)r->functions[F_BUS])(list[i]);x->deviceAddress=((FnAddr)r->functions[F_ADDR])(list[i]);if(((FnOpen)r->functions[F_OPEN])(list[i],&h)==0&&h){readstr(r,h,d.iManufacturer,x->manufacturer,sizeof(x->manufacturer));readstr(r,h,d.iProduct,x->product,sizeof(x->product));readstr(r,h,d.iSerialNumber,x->serialNumber,sizeof(x->serialNumber));((FnClose)r->functions[F_CLOSE])(h);}}used++;}((FnFreeList)r->functions[F_FREE])(list,1);if(count)*count=used;return used>cap?1:0;}
void CpmUsb_DeviceInit(CpmUsbDevice*d){if(d){memset(d,0,sizeof(*d));d->claimedInterface=-1;}}
int CpmUsb_OpenVidPid(CpmUsbRuntime*r,CpmUsbDevice*d,uint16_t vid,uint16_t pid,const char*serial){libusb_device**list=NULL;intptr_t n,i;if(!CpmUsb_IsLoaded(r)||!d)return -1;CpmUsb_Close(d);n=((FnGetList)r->functions[F_LIST])((libusb_context*)r->context,&list);if(n<0)return -2;for(i=0;i<n;i++){LibusbDescriptor desc;libusb_device_handle*h=NULL;if(((FnDesc)r->functions[F_DESC])(list[i],&desc)!=0||desc.idVendor!=vid||desc.idProduct!=pid)continue;if(((FnOpen)r->functions[F_OPEN])(list[i],&h)!=0||!h)continue;if(serial&&*serial){char s[CPM_USB_MAX_STRING];readstr(r,h,desc.iSerialNumber,s,sizeof(s));if(strcmp(s,serial)!=0){((FnClose)r->functions[F_CLOSE])(h);continue;}}d->runtime=r;d->handle=h;d->claimedInterface=-1;((FnFreeList)r->functions[F_FREE])(list,1);return 0;}((FnFreeList)r->functions[F_FREE])(list,1);return -3;}
void CpmUsb_Close(CpmUsbDevice*d){if(!d)return;if(d->handle){if(d->claimedInterface>=0)CpmUsb_ReleaseInterface(d);((FnClose)d->runtime->functions[F_CLOSE])((libusb_device_handle*)d->handle);}CpmUsb_DeviceInit(d);}int CpmUsb_ClaimInterface(CpmUsbDevice*d,int n){int rc;if(!d||!d->handle)return -1;rc=((FnClaim)d->runtime->functions[F_CLAIM])((libusb_device_handle*)d->handle,n);if(rc==0)d->claimedInterface=n;return rc;}int CpmUsb_ReleaseInterface(CpmUsbDevice*d){int rc;if(!d||!d->handle||d->claimedInterface<0)return -1;rc=((FnRelease)d->runtime->functions[F_RELEASE])((libusb_device_handle*)d->handle,d->claimedInterface);if(rc==0)d->claimedInterface=-1;return rc;}
static int xfer(CpmUsbDevice*d,uint8_t ep,void*data,size_t size,int timeout,int intr){int done=0,rc;if(!d||!d->handle||(!data&&size)||size>2147483647U)return -1;rc=(intr?((FnInterrupt)d->runtime->functions[F_INTERRUPT]):((FnBulk)d->runtime->functions[F_BULK]))((libusb_device_handle*)d->handle,ep,(unsigned char*)data,(int)size,&done,(unsigned int)(timeout<0?0:timeout));return rc==0?done:rc;}
int CpmUsb_BulkTransfer(CpmUsbDevice*d,uint8_t ep,void*data,size_t n,int t){return xfer(d,ep,data,n,t,0);}int CpmUsb_InterruptTransfer(CpmUsbDevice*d,uint8_t ep,void*data,size_t n,int t){return xfer(d,ep,data,n,t,1);}int CpmUsb_ControlTransfer(CpmUsbDevice*d,uint8_t rt,uint8_t req,uint16_t val,uint16_t idx,void*data,uint16_t len,int t){if(!d||!d->handle)return -1;return ((FnControl)d->runtime->functions[F_CONTROL])((libusb_device_handle*)d->handle,rt,req,val,idx,(unsigned char*)data,len,(unsigned int)(t<0?0:t));}
