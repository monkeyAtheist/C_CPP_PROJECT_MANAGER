# CPM 0.2.71 — File Symbols overloaded-operator false-positive fix

## Problem

CPM 0.2.70 already ignored ordinary local constructor calls inside normal function bodies, but the body-range detector did not recognise C++ overloaded-operator definitions. As a consequence, local direct-initialisation inside an operator body could be scanned again as if it were a top-level function declaration.

Example false positives before the fix:

```cpp
vectorCoord vectorCoord::operator+(const vectorCoord &res)
{
    vectorCoord result(res);       // incorrectly exposed as `result`
    QPointF point(1.0, 2.0);       // incorrectly exposed as `point`
    return result;
}
```

## Fix

The function-body detector now recognises regular callable names plus C++ symbolic operators, `operator()`, `operator[]`, `operator new/delete` variants and conversion operators. This is ported from the corrected JC Lib 0.8.48 File Symbols scanner while retaining CPM-specific calling-convention handling.

## Regression coverage

The CPM File Symbols regression test now includes overloaded `operator+`, `operator+=` and `operator()` bodies containing class instantiations. The test verifies that the local variables are not surfaced as symbols while the existing free functions, constructors and methods remain detected.

## Validation result

- TypeScript compilation: PASS
- Existing File Symbols / pack regression test: PASS
- Header/source generation regression: PASS
- Reproduction of `vectorCoord result(res);` inside `operator+`: PASS (not emitted)
- Reproduction of `QPointF point(...)` inside `operator+`: PASS (not emitted)
- Reproduction of local class construction inside `operator+=`: PASS (not emitted)
- Reproduction of local class construction inside `operator()`: PASS (not emitted)
- Ordinary free-function detection remains active.
