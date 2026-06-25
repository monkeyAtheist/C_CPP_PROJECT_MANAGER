# Manual test checklist — 0.6.11

## Target-settings dependencies

1. Open an executable project and expand **Signing information**.
2. Confirm certificate fields are dimmed while **Sign target** is unchecked.
3. Enable **Sign target** and confirm all signing controls become editable.
4. Confirm **External executable for DLL debugging** is dimmed for the executable target.
5. Switch the target to **Dynamic Link Library** and confirm the DLL-debugging executable field becomes editable.
6. Switch the target to **Static Library** and confirm the complete **Executable command line** section disappears.

## Function-panel browsing

1. Add or select a `.fp` file in **CVI Workspace**.
2. Double-click the `.fp` file or use **Open CVI Function Panel** from its context menu.
3. Confirm a native VS Code function selector appears.
4. Select a function and verify that its prototype-and-parameters details page opens.
5. Confirm a packaged JC Lib card is used when available and that an extracted fallback card opens for a symbol absent from the bundled pack.
