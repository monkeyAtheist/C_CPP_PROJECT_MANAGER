# CPM C++ Ethernet bundle

C++17 RAII classes:
- `cpm::TcpClient`
- `cpm::TcpServer`
- `cpm::UdpSocket`

The bundle includes the maintained C socket backend. Windows projects need `ws2_32` (CPM adds it automatically when creating the bundle).
