# CPM MQTT 3.1.1

Compact MQTT 3.1.1 client over the maintained TCP socket backend.

Included:
- CONNECT with clean session, username/password and Last Will;
- QoS 0/1 PUBLISH;
- SUBSCRIBE / UNSUBSCRIBE;
- PINGREQ/PINGRESP;
- incoming PUBLISH parsing and automatic PUBACK for QoS 1.

This bundle uses plain TCP (default port 1883). It does **not** implement TLS/MQTTS. Add a real TLS transport when broker authentication/security requires it. QoS 2 and persistent offline sessions are outside this compact client.
