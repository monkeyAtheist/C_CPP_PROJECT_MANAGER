#pragma once

#include "cpm_socket.hpp"

namespace cpm
{
/* Wi-Fi application traffic uses the regular IP stack after the OS has associated with an access point. */
using WifiTcpClient = TcpClient;
using WifiTcpServer = TcpServer;
using WifiUdpSocket = UdpSocket;
}
