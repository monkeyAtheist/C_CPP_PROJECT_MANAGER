# CPM HTTP / REST

Small HTTP/1.1 client built on `cpm_socket`.

- `GET`, `POST`, or arbitrary methods;
- custom request headers;
- status code/reason/content type/content length;
- fixed-length, connection-close and chunked response bodies;
- caller-owned response buffer (no hidden long-lived allocations).

This bundle supports **plain `http://` only**. It intentionally does not pretend to provide HTTPS. For production HTTPS, place a TLS implementation beneath the request layer or use a platform/vendor TLS library.
