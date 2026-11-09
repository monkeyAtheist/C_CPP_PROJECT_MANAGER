# CPM MQTT automatic reconnect stack

Adds bounded retry/backoff, connection health checks, automatic reconnect and subscription restoration on top of the maintained MQTT 3.1.1 bundle. Credentials are copied into the client object; avoid logging or serializing the structure.
