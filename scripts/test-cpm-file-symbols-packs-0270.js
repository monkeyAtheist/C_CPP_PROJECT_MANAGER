'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');

const root = path.resolve(__dirname, '..');
const originalLoad = Module._load;
const symbolKind = { Function: 11, Method: 5, Constructor: 8, 11: 'Function', 5: 'Method', 8: 'Constructor' };
Module._load = function patched(request, parent, isMain) {
  if (request === 'vscode') return { SymbolKind: symbolKind };
  return originalLoad.call(this, request, parent, isMain);
};
const symbolsModule = require(path.join(root, 'out', 'services', 'cpmSymbolService.js'));
Module._load = originalLoad;

const source = `
static bool validateFiniteJsonValue(const QJsonValue &value)
{
    return value.isDouble();
}

double toSceneMm(double value)
{
    return value * 1000.0;
}

QPointF fromSceneMm(const QPointF &point)
{
    return QPointF(point.x() / 1000.0, point.y() / 1000.0);
}

QString coordText(const QPointF &xy, double z)
{
    return QStringLiteral("(%1, %2, %3)").arg(xy.x()).arg(xy.y()).arg(z);
}

MainWindow::MainWindow(QWidget *parent)
    : QMainWindow(parent), ui(std::make_unique<Ui::MainWindow>())
{
    QObject::connect(ui->pushButtonA, &QPushButton::clicked, this, &MainWindow::pushButton);
}

void MainWindow::pushButton()
{
    QPointF localPoint(1.0, 2.0);
    QString text = QStringLiteral("local");
}

Widget Widget::operator+(const Widget &other)
{
    Widget result(other);
    QPointF operatorLocalPoint(3.0, 4.0);
    return result;
}

Widget& Widget::operator+=(const Widget &other)
{
    Widget temporary(other);
    return *this;
}

Widget Widget::operator()(int value) const
{
    Widget callResult(*this);
    return callResult;
}
`;
const detected = symbolsModule.scanCFunctions(source, 'sample.cpp');
const names = detected.map((symbol) => symbol.qualifiedName || symbol.name);
assert.deepStrictEqual(names, [
  'validateFiniteJsonValue',
  'toSceneMm',
  'fromSceneMm',
  'coordText',
  'MainWindow::MainWindow',
  'MainWindow::pushButton'
]);
for (const falsePositive of ['QPointF', 'QStringLiteral', 'QObject::connect', 'localPoint', 'result', 'operatorLocalPoint', 'temporary', 'callResult']) {
  assert(!names.includes(falsePositive), `False positive still present: ${falsePositive}`);
}

const header = symbolsModule.buildHeaderFromSourceSymbols(detected, 'sample.cpp');
assert(header.includes('double toSceneMm(double value);'));
assert(header.includes('// static bool validateFiniteJsonValue'));
assert(header.includes('// void MainWindow::pushButton();'));
const generatedSource = symbolsModule.buildSourceFromSourceSymbols(detected, 'sample.cpp');
assert(generatedSource.includes('double toSceneMm(double value)\n{'));
assert(generatedSource.includes('std::abort();'));
assert(generatedSource.includes('void MainWindow::pushButton()\n{'));
assert(generatedSource.includes('MainWindow::MainWindow(QWidget *parent)\n{'));
assert(!generatedSource.includes('override'));
const markdown = symbolsModule.formatSourceSymbolList(detected, 'sample.cpp', 'markdown');
assert(markdown.includes('C/C++ File Symbols'));
assert(markdown.includes('MainWindow::pushButton'));

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const commandIds = new Set(manifest.contributes.commands.map((entry) => entry.command));
for (const command of [
  'cpm.library.createPack', 'cpm.library.importPack',
  'cpm.copyFileSymbol', 'cpm.copyFileSymbolDeclaration', 'cpm.copyFileSymbols',
  'cpm.copyFileSymbolDeclarations', 'cpm.exportFileSymbols', 'cpm.generateFileSymbolsHeader', 'cpm.generateFileSymbolsSource'
]) {
  assert(commandIds.has(command), `Missing contributed command: ${command}`);
}
const titleCommands = manifest.contributes.menus['view/title'].filter((entry) => entry.when === 'view == cpm.libraryExplorer').map((entry) => entry.command);
assert(titleCommands.includes('cpm.library.createPack'));
assert(titleCommands.includes('cpm.library.importPack'));
assert(manifest.contributes.submenus.some((entry) => entry.id === 'cpm.editorLibraries'));
assert((manifest.contributes.menus['cpm.editorLibraries'] || []).some((entry) => entry.command === 'cpm.library.createPack'));
assert((manifest.contributes.menus['cpm.editorLibraries'] || []).some((entry) => entry.command === 'cpm.library.importPack'));
const symbolTitleCommands = manifest.contributes.menus['view/title'].filter((entry) => entry.when === 'view == cpm.fileSymbols').map((entry) => entry.command);
assert(symbolTitleCommands.includes('cpm.copyFileSymbols'));
assert(symbolTitleCommands.includes('cpm.exportFileSymbols'));
assert(symbolTitleCommands.includes('cpm.generateFileSymbolsHeader'));
assert(symbolTitleCommands.includes('cpm.generateFileSymbolsSource'));
const sourceButton = manifest.contributes.menus['view/title'].find((entry) => entry.command === 'cpm.generateFileSymbolsSource');
const headerButton = manifest.contributes.menus['view/title'].find((entry) => entry.command === 'cpm.generateFileSymbolsHeader');
assert(sourceButton && headerButton);
assert(sourceButton.group === 'navigation@5');
assert(headerButton.group === 'navigation@4');

const embedded = fs.readFileSync(path.join(root, 'src', 'jcLibEmbedded.ts'), 'utf8');
assert(embedded.includes("{ label: 'C++', value: 'cpp' }"));
assert(embedded.includes("registerCommand('cpm.library.createPack'"));
assert(embedded.includes("registerCommand('cpm.library.importPack'"));
assert(embedded.includes("{ label: 'LabWindows/CVI', value: 'cvi' }"));

console.log('CPM 0.2.71 file-symbol filtering/export/source generation and pack create/import checks: OK');
