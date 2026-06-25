/*
 * Removes legacy LabWindows/CVI TypeScript sources that may remain when this
 * extension source tree is updated by copying a newer archive over an older one.
 * These files are obsolete in CPM and can break `tsc` after the internal type
 * namespace was migrated from Cvi* to Cpm*.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const legacyFiles = [
  'src/model/cviParser.ts',
  'src/providers/cviTreeProvider.ts',
  'src/services/cviBreakpointSyncService.ts',
  'src/services/cviBuildService.ts',
  'src/services/cviCppToolsService.ts',
  'src/services/cviInstallationService.ts',
  'src/services/cviProjectSettingsService.ts',
  'src/services/cviSymbolService.ts',
  'src/services/cviWorkspaceService.ts',
  'src/services/cviFunctionPanelService.ts',
  'src/services/cviLibraryPackService.ts',
  'src/services/cviTemplateService.ts',
  'src/views/cviHomePanel.ts',
  'src/views/cviBuildSettingsPanel.ts',
  'src/views/cviQuickActionsView.ts'
];

let removed = 0;
for (const relative of legacyFiles) {
  const absolute = path.join(root, relative);
  if (fs.existsSync(absolute)) {
    fs.rmSync(absolute, { force: true });
    removed += 1;
    console.log(`[CPM] Removed legacy CVI source: ${relative}`);
  }
}

if (removed > 0) {
  console.log(`[CPM] Removed ${removed} obsolete LabWindows/CVI source file(s).`);
}
