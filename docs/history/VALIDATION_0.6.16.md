# Validation report — LabWindows/CVI Project Manager 0.6.16

## Scope

Version 0.6.16 corrects the native CVI command bridge after a Windows runtime diagnostic returned DDEML error `16394` (`0x400A`, `DMLERR_NO_CONV_ESTABLISHED`). The error means that the DDE client could not establish the requested conversation. The identifiers remain those documented by the supplied CVI `cmdsrvr.h`: service `cvi`, topic `system`, and item `status`.

## Compatibility correction

The 0.6.15 bridge used Unicode DDEML entry points while passing the historical ANSI code page. Version 0.6.16 now attempts:

1. ANSI DDEML: `DdeInitializeA`, `DdeCreateStringHandleA`, `CP_WINANSI`;
2. Unicode DDEML fallback: `DdeInitializeW`, `DdeCreateStringHandleW`, `CP_WINUNICODE`.

Each failure is returned as structured JSON with the mode, connection stage, numeric DDEML code and symbolic name. PowerShell JSON output is forced to UTF-8.

If both DDE compatibility modes fail, the diagnostic command runs an additional registry scan for LabWindows/CVI ActiveX automation candidates and logs CLSID, ProgID and server paths. This is a diagnostic fallback only; 0.6.16 does not issue commands through ActiveX.

## Automated checks

| Check | Result |
|---|---|
| Manifest version `0.6.16` | OK |
| TypeScript compilation | OK |
| VSIX packaging | OK |
| ZIP integrity | OK |
| Packaged ANSI-first DDE compatibility script | OK |
| Packaged ActiveX registry-discovery script | OK |
| Packaged compiled native-command service | OK |
| ANSI DDEML entry points | OK |
| Unicode DDEML fallback with `CP_WINUNICODE` | OK |
| CVI DDE contract `cvi` / `system` / `status` | OK |
| Symbolic `DMLERR_NO_CONV_ESTABLISHED` mapping | OK |
| Structured DDE attempt reporting | OK |
| UTF-8 PowerShell JSON output | OK |
| ActiveX registry-discovery fallback wiring | OK |
| Eight native-command contributions and registrations | OK |
| 0.6.14 breakpoint serialization regression | OK |
| Uploaded CVI breakpoint fixture regression | OK |
| 0.6.13 workspace scaffold regression | OK |
| Generated JavaScript syntax checks | OK |

## Runtime boundary

The Windows DDE exchange cannot be executed in the Linux packaging environment. Run `MANUAL_TEST_CHECKLIST_0.6.16.md` on the target Windows workstation. If the ANSI mode resolves the issue, the output channel will report a successful `ansi` attempt. If both modes fail, transmit the ActiveX candidate lines printed by the diagnostic so that a release-specific ActiveX command transport can be implemented without guessing the installed ProgID.
