# LabWindows/CVI Project Manager 0.6.11 validation

## Conditional target-settings UI

- Signing detail controls are grouped under `signingDetailsBlock`.
- `Sign debug build`, certificate store, certificate, timestamp URL and description URL are disabled until `Sign target` is checked.
- `External executable for DLL debugging` is wrapped in `externalProcessPathRow` and disabled unless the selected target type is `Dynamic Link Library`.
- `Executable command line` uses the existing `target-nonlib` visibility class and is hidden for `Static Library` targets.
- The generated inline webview script parses successfully.

## CVI function panels

The supplied `asynctmr.fp` file was parsed as a binary CVI function-panel container with embedded HTML references. The parser extracted eight unique functions:

1. `NewAsyncTimer`
2. `NewAsyncTimerWithPriority`
3. `DiscardAsyncTimer`
4. `SuspendAsyncTimerCallbacks`
5. `ResumeAsyncTimerCallbacks`
6. `SetAsyncTimerAttribute`
7. `GetAsyncTimerAttribute`
8. `GetAsyncTimerResolution`

The extracted cards include prototypes, return types, parameter names and the `toolbox\\asynctmr.h` include reference. Variadic parameters are preserved.

## Explorer integration

- `.fp` references use context value `cviFile.functionPanel.*`.
- Double-clicking a `.fp` reference invokes `labwindowsCvi.openFunctionPanel`.
- The context menu exposes `Open CVI Function Panel`.
- Selecting an extracted function invokes `labwindowsCvi.library.showFunctionDetailsByName`.
- The embedded JC Lib explorer prefers an existing packaged symbol and uses the extracted `.fp` card as fallback.

## Build verification

- `npm run compile`: OK
- `NODE_PATH=./test-mocks node scripts/test-ui-0611.js`: OK
- `NODE_PATH=./test-mocks node scripts/test-fp-0611.js`: OK
