# Publish the VS Code extension from Windows

The source package uses the public npm registry. Run these commands from the project root in `cmd.exe`:

```bat
npm config set registry https://registry.npmjs.org/
if exist node_modules rmdir /s /q node_modules
npm cache verify
npm ci
npm run compile
vsce login jc-tools
vsce publish --allow-missing-repository
```

For a first publication, the already generated `.vsix` can also be uploaded manually from the Visual Studio Marketplace publisher management page. This bypasses the local `npm ci` and TypeScript compilation steps.

If `rmdir` fails with `EPERM`, close VS Code, close terminals using the folder and pause OneDrive synchronization, or move the project temporarily outside OneDrive, for example to `C:\dev\labwindows-cvi-project-manager`.

For `vsce login`, create an Azure DevOps PAT using the Microsoft account that owns the publisher. Set `Organization` to `All accessible organizations`, enable `Show all scopes`, then select `Marketplace > Manage`.
