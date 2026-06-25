# Publication Marketplace VS Code

Publisher Marketplace correct : `JerryCrozet-ElectronicEngineer`.

## Première publication

```bat
npm ci
npm run compile
vsce ls-publishers
vsce publish --allow-missing-repository
```

`vsce ls-publishers` doit afficher `JerryCrozet-ElectronicEngineer`.

Ne lancez pas `vsce login jc-tools` : ce publisher ne correspond pas au compte utilisé pour JC Lib.

## Publication manuelle

Le fichier VSIX corrigé peut également être téléversé depuis la page de gestion du Marketplace sous le publisher `JerryCrozet-ElectronicEngineer`.
