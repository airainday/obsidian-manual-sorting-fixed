const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const directory = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(directory, 'main.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
const normalize = value => JSON.parse(JSON.stringify(value));
const results = [];

function setup({own = null, legacy, configDir = '.obsidian'} = {}) {
  const calls = {exists: [], reads: [], saves: [], warns: [], registered: []};
  const obsidian = {
    Plugin: class {
      constructor(app) {this.app = app;}
      async loadData() {return own;}
      async saveData(data) {calls.saves.push(normalize(data));}
      registerEvent(ref) {calls.registered.push(ref);}
    },
    Modal: class {}, PluginSettingTab: class {}, Platform: {isMobile: false},
  };
  const context = vm.createContext({module: {exports: {}}, require: () => obsidian,
    console: {info() {}, log() {}, warn: (...args) => calls.warns.push(args)}});
  vm.runInContext(source, context);
  const app = {vault: {configDir,
    adapter: {
      async exists(p) {calls.exists.push(p); return legacy !== undefined;},
      async read(p) {calls.reads.push(p); return typeof legacy === 'string' ? legacy : JSON.stringify(legacy);},
    },
    on(name, callback) {return {name, callback};},
  }};
  return {plugin: new context.module.exports(app), calls};
}

async function test(name, fn) {await fn(); results.push(name); console.log('PASS', name);}
(async () => {
  await test('Distinct installable identity and complete files', async () => {
    assert.equal(manifest.id, 'manual-sorting-fixed');
    assert.equal(manifest.version, '1.0.0');
    for (const file of ['main.js', 'styles.css', 'manifest.json', 'LICENSE', 'README.md']) assert.ok(fs.existsSync(path.join(directory, file)));
    assert.ok(!fs.existsSync(path.join(directory, 'data.json')), 'No personal sorting data is distributed');
  });
  const legacy = {customOrder: {'/': {children: ['test'], sortOrder: 'custom'}, test: {children: ['test/b', 'test/a'], sortOrder: 'custom'}}, sortOrder: 'custom', debugMode: true, newItemPlacement: 'bottom'};
  await test('First load imports legacy sorting and preserves the original input', async () => {
    const before = JSON.stringify(legacy);
    const {plugin, calls} = setup({legacy}); await plugin.loadSettings();
    assert.deepEqual(normalize(plugin.settings.customOrder), legacy.customOrder);
    assert.equal(plugin.settings.newItemPlacement, 'bottom');
    assert.deepEqual(calls.saves, [legacy]);
    assert.equal(JSON.stringify(legacy), before);
  });
  await test('Existing standalone settings are never overwritten by legacy settings', async () => {
    const own = {...legacy, newItemPlacement: 'top'};
    const {plugin, calls} = setup({own, legacy}); await plugin.loadSettings();
    assert.equal(plugin.settings.newItemPlacement, 'top');
    assert.deepEqual(calls.reads, []); assert.deepEqual(calls.saves, []);
  });
  await test('Fresh install without the old plugin uses defaults', async () => {
    const {plugin, calls} = setup(); await plugin.loadSettings();
    assert.deepEqual(normalize(plugin.settings.customOrder), {'/': {children: [], sortOrder: 'custom'}});
    assert.deepEqual(calls.saves, []);
  });
  await test('Invalid legacy JSON falls back without overwriting either data file', async () => {
    const {plugin, calls} = setup({legacy: '{invalid'}); await plugin.loadSettings();
    assert.equal(calls.warns.length, 1); assert.deepEqual(calls.saves, []);
    assert.equal(plugin.settings.sortOrder, 'custom');
  });
  await test('Older array-based sorting format is still migrated', async () => {
    const {plugin} = setup({legacy: {customOrder: {'/': ['b', 'a']}, sortOrder: 'customOrder'}});
    await plugin.loadSettings();
    assert.deepEqual(normalize(plugin.settings.customOrder), {'/': {children: ['b', 'a'], sortOrder: 'custom'}});
    assert.equal(plugin.settings.sortOrder, 'custom');
  });
  await test('Custom Obsidian configuration directory is respected', async () => {
    const {plugin, calls} = setup({legacy, configDir: '.obsidian-desktop'}); await plugin.loadSettings();
    assert.deepEqual(calls.reads, ['.obsidian-desktop/plugins/manual-sorting/data.json']);
  });
  await test('All vault listeners are registered for lifecycle cleanup', async () => {
    const {plugin, calls} = setup(); plugin.registerVaultHandlers();
    assert.deepEqual(calls.registered.map(ref => ref.name), ['rename', 'create', 'delete']);
  });
  fs.mkdirSync(path.join(__dirname, '../test-results'), {recursive: true});
  fs.writeFileSync(path.join(__dirname, '../test-results/settings.json'), JSON.stringify(results, null, 2));
  console.log(`${results.length} standalone checks passed.`);
})().catch(error => {console.error(error); process.exitCode = 1;});
