# Validation — C/C++ Project Manager and Build 0.2.7

## Objet

Renommer l'identifiant Marketplace de l'extension pour éviter le conflit avec une extension existante nommée `cpp-project-manager`.

## Modifications

- `package.json.name` : `c-cpp-project-manager-and-build`
- `package.json.displayName` : `C/C++ Project Manager and Build`
- `package.json.version` : `0.2.7`
- `package-lock.json` synchronisé avec le nouveau nom et la nouvelle version.
- `README.md` : titre mis à jour.

## Justification du nom technique

Le nom Marketplace technique doit rester compatible avec les contraintes du manifeste VS Code : minuscule et sans espaces. Le nom demandé `C_CPP_project_manager_and_build` a donc été converti en identifiant de publication compatible :

`c-cpp-project-manager-and-build`

Le nom visible par l'utilisateur est :

`C/C++ Project Manager and Build`

## Validation

Commandes exécutées :

```powershell
npm ci --ignore-scripts
npm run compile
npm run package
```

Résultats :

- `npm ci --ignore-scripts` : OK
- `npm run compile` : OK
- `npm run package` : OK
- VSIX généré : `c-cpp-project-manager-and-build-0.2.7.vsix`

## Note

`vsce` signale uniquement un avertissement : champ `repository` absent du `package.json`. Cela ne bloque pas le packaging. Pour publier sur Marketplace, il est préférable d'ajouter un dépôt GitHub ou d'utiliser `--allow-missing-repository` si nécessaire.
