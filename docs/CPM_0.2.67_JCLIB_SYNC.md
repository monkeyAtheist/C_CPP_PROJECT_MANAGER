# CPM 0.2.67 — Embedded JC Lib synchronization

## Scope

This update synchronizes only JC Lib packs already shipped by CPM's curated embedded payload. It does not restore pack families intentionally excluded from the Marketplace package in CPM 0.2.62.

Updated sources are taken from JC Lib 0.8.36.

| CPM embedded artifact | Previous | Updated |
| --- | ---: | ---: |
| `c_language_pack.json` | 1.12.0 | 2.0.0 |
| `cpp_language_pack.json` | 2.16.0 | 3.2.0 |
| `system_scripting_pack.json` | 1.9.1 | 1.12.0 |
| `cpm_core_pack.json` | 0.1.5 | 0.1.6 |

The auto-seeded `cpm_core_pack.json` was rebuilt from the updated `C Language` and `C++ Language` libraries while retaining CPM's existing `C DLL Helpers`, `C++ DLL Helpers`, and `C/C++ Preprocessor` libraries. Its compact structured-picker payload remains stripped in the same way as the previous CPM core pack.

## Engine compatibility changes

The embedded JC Lib engine in `src/jcLibEmbedded.ts` now supports:

- `insertValueMap` on parameters;
- bounded multi-pass placeholder expansion when a mapped value injects another `{{parameter}}` placeholder;
- `allowEmptySelection` for optional multi-select structured pickers;
- a `Clear selection` action in multi-select picker windows;
- empty parameter values in parameterized templates instead of silently restoring defaults;
- whitespace normalization for Git and Windows CMD/Batch parameterized commands when optional fragments are empty.

These changes are required by the current C/C++ allocation generators and by the Git cards introduced after the previous CPM synchronization.

## Targeted validation

Validated examples:

```c
char*** buffer = (char***)malloc(sizeof *buffer * (taille));
```

```cpp
char**** buffer = static_cast<char****>(std::malloc(sizeof *buffer * (taille)));
```

```cpp
char*** buffer = new char**[taille]{};
```

```text
git push -u origin withOperatorChoice
git push origin main
git clone repo.git
```

The `git push` flag picker contains both `-u` and `--set-upstream`, and Git clone/push flag pickers can be applied with no selected flags.

All 16 shipped pack JSON files parse successfully. Default parameter expansion was checked across the updated C, C++, Scripting/System and CPM core packs: no `{{placeholder}}` remained unresolved after expansion.

TypeScript compilation succeeds when invoked directly with the included compiler:

```text
node ./node_modules/typescript/bin/tsc -p ./ --pretty false
```

The archive supplied for this update does not contain `scripts/clean-legacy-cvi-sources.js`, although `npm run compile` references it. Consequently the npm wrapper fails before TypeScript starts; this is independent of the JC Lib changes.

## Deliberately not restored

The standalone Qt 6.11 pack modernized in JC Lib 0.8.36 is not added to CPM. CPM 0.2.62 intentionally removed `qt_pack.json` and other non-curated packs from the Marketplace payload, and the current CPM pack-family picker does not expose Qt as an embedded family.
