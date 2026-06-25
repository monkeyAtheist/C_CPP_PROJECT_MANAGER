# LabWindows/CVI native target settings analysis — 0.6.2

Reference archive: `CVI_PRJ.zip`

The archive contains a CVI 2020 workspace with six projects: default and configured variants for executable, DLL and static-library targets. The configured variants were compared against their defaults. Only keys observed in valid CVI-generated `.prj` files are written by version 0.6.2.

## Confirmed native locations

### Per-configuration target settings

Target settings are stored in the project file under:

```ini
[Default Build Config Debug]
[Default Build Config Release]
[Default Build Config Debug64]
[Default Build Config Release64]
```

The selected VS Code build mode determines which section is edited.

### Output target path

The output file is stored in:

```ini
[Create Executable]
Executable File_Debug Is Rel = True
Executable File_Debug Rel To = "Project"
Executable File_Debug Rel Path = "..."
Executable File_Debug = "/c/..."
```

Equivalent keys exist for `Release`, `Debug64` and `Release64`.

### LoadExternalModule files

The modules selected through **Add Files to Executable** or **Add Files to DLL** are stored in:

```ini
[Modules Forced Into Executable]
Module 0001 Is Rel = False
Module 0001 = "analysis.lib"
Module 0002 Is Rel = False
Module 0002 = "toolbox.obj"
```

The section name is the same for EXE and DLL projects.

## Confirmed executable keys

The executable configured sample confirms the following keys:

```ini
Application Title
Icon File Is Rel
Icon File Rel To
Icon File Rel Path
Icon File
Runtime Support
Runtime Binding
Generate Source Documentation
Manifest Embed
Manifest Path Is Rel
Manifest Path Rel To
Manifest Path Rel Path
Manifest Path
Embed Project .UIRs
Generate Map File
Create Console Application
Embed Timestamp
Using LoadExternalModule
```

## Confirmed DLL keys

The DLL configured sample confirms the following additional keys:

```ini
Use Dflt Import Lib Base Name
Import Lib Base Name
Where to Copy DLL
Custom Directory to Copy DLL Is Rel
Custom Directory to Copy DLL Rel To
Custom Directory to Copy DLL Rel Path
Custom Directory to Copy DLL
Use IVI Subdirectories for Import Libraries
Use VXIPNP Subdirectories for Import Libraries
DLL Exports
Export File1
Add Type Lib To DLL
Include Type Lib Help Links
TLB Help Style
Type Lib FP File Is Rel
Type Lib FP File Rel To
Type Lib FP File Rel Path Line0001
Type Lib FP File Rel Path Line0002
Type Lib FP File
Add NI Type Info To DLL
Use Single Header for NI Type Info
Single Header NI Type Info File Is Rel
Single Header NI Type Info File Rel To
Single Header NI Type Info File Rel Path Line0001
Single Header NI Type Info File Rel Path Line0002
Single Header NI Type Info File
```

## Confirmed version and signing keys

The EXE and DLL configured samples confirm:

```ini
Numeric File Version
Numeric Prod Version
Comments / Comments Ex
Company Name / Company Name Ex
File Description / File Description Ex
File Version / File Version Ex
Internal Name / Internal Name Ex
Legal Copyright / Legal Copyright Ex
Legal Trademarks / Legal Trademarks Ex
Original Filename / Original Filename Ex
Private Build / Private Build Ex
Product Name / Product Name Ex
Product Version / Product Version Ex
Special Build / Special Build Ex
Sign
Sign Store
Sign Certificate
Sign Timestamp URL
Sign URL
```

The global signing section also confirms:

```ini
[Signing Info]
Sign Debug Build = True
```

## Intentionally conservative choices

- The UI preserves free-text fields for values such as runtime support, runtime binding, DLL copy mode and source-documentation mode. One configured sample is sufficient to confirm persistence keys but not to enumerate every legal CVI value safely.
- Project dependency persistence remains extension-managed because the reference workspace still contains only `Number of Dependencies = 0` examples.
- Automatic generation of an import library from a header and DLL is not implemented as an undocumented file mutation. The extension adds a guided command that opens the header in CVI and copies the selected DLL path to the clipboard for the native CVI command.
