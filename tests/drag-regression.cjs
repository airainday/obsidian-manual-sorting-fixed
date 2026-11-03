// Offline regression harness. No writes to the Obsidian vault.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const acorn = require('acorn');

function readAsar(file, entry) {
  const bytes = fs.readFileSync(file);
  const header = JSON.parse(bytes.subarray(16, 16 + bytes.readUInt32LE(12)));
  let item = header;
  for (const part of entry.split('/')) item = item.files[part];
  const offset = 8 + bytes.readUInt32LE(4) + Number(item.offset);
  return bytes.subarray(offset, offset + item.size).toString('utf8');
}
const asarPath = process.env.OBSIDIAN_ASAR;
if (!asarPath) throw new Error('Set OBSIDIAN_ASAR to your locally installed Obsidian 1.14.4 ASAR file. This optional test reads it without redistributing it.');
const core = readAsar(asarPath, 'app.js');

function functionAt(source, offset) {
  assert.ok(offset >= 0, 'Source function exists');
  const text = source.slice(offset);
  const tokens = acorn.tokenizer(text, {ecmaVersion: 'latest'});
  let depth = 0, started = false;
  for (;;) {
    const token = tokens.getToken();
    if (token.type.label === '{' || token.type.label === '${') {depth++; started = true;}
    if (token.type.label === '}' && --depth === 0 && started) return text.slice(0, token.end);
    assert.notEqual(token.type.label, 'eof', 'Function has closing brace');
  }
}
function method(name, predicate = () => true) {
  const marker = `.prototype.${name}=`;
  let at = -1;
  while ((at = core.indexOf(marker, at + 1)) >= 0) {
    const fn = functionAt(core, at + marker.length);
    if (predicate(fn)) return fn;
  }
  throw new Error(`Core method not found: ${name}`);
}
const asyncHelper = functionAt(core, core.indexOf('function y(e,t,n,i){return new(n||(n=Promise))'));
const generatorHelper = functionAt(core, core.indexOf('function b(e,t){var n,i,r,o,a={label:0'));
const queueClass = functionAt(core, core.indexOf('WT=function') + 3);
const canvasClass = functionAt(core, core.indexOf('ate=function(){function e(){var e=this;this.id="canvas"') + 4);
const nativeDrop = method('handleDrop', f => f.includes('e.addEventListener("dragover",r)'));
const attachDrop = method('attachDropHandler');
const renameFile = method('renameFile');
const runAsyncLinkUpdate = method('runAsyncLinkUpdate');

class FakeEvent {
  constructor(type, target, values = {}) {
    Object.assign(this, {type, target, clientX: 50, clientY: 50,
      defaultPrevented: false, stopped: false, immediateStopped: false,
      dataTransfer: {dropEffect: 'move'}}, values);
  }
  preventDefault() {this.defaultPrevented = true;}
  stopPropagation() {this.stopped = true;}
  stopImmediatePropagation() {this.stopped = this.immediateStopped = true;}
}
class Element {
  constructor(filePath = '', parent = null, classes = []) {
    this.dataset = {path: filePath}; this.parent = parent; this.listeners = [];
    this.classes = new Set(classes); this.index = 0;
    this.classList = {contains: name => this.classes.has(name)};
    this.win = {clearTimeout() {}, setTimeout() {}};
  }
  addEventListener(type, fn, opts) {
    this.listeners.push({type, fn, capture: opts === true || !!opts?.capture, once: !!opts?.once});
  }
  removeEventListener(type, fn, opts) {
    const capture = opts === true || !!opts?.capture;
    this.listeners = this.listeners.filter(l => !(l.type === type && l.fn === fn && l.capture === capture));
  }
  closest() {return this;}
  getBoundingClientRect() {return {left: 0, right: 200, top: 0, bottom: 200};}
  querySelector() {return this.selfEl ?? this;}
  compareDocumentPosition(other) {return this.index < other.index ? 4 : 2;}
}
function dispatch(event) {
  const chain = [];
  for (let el = event.target; el; el = el.parent) chain.push(el);
  function invoke(el, capture) {
    for (const listener of [...el.listeners]) {
      if (listener.type !== event.type || listener.capture !== capture) continue;
      listener.fn(event);
      if (listener.once) el.removeEventListener(listener.type, listener.fn, capture);
      if (event.immediateStopped) break;
    }
  }
  for (const el of [...chain].reverse()) {invoke(el, true); if (event.stopped) return;}
  for (const el of chain) {invoke(el, false); if (event.stopped) return;}
}
class Folder {
  constructor(filePath) {this.path = filePath; this.name = filePath.split('/').pop();}
}
class File {
  constructor(filePath) {this.path = filePath; this.name = filePath.split('/').pop(); this.extension = filePath.split('.').pop();}
}

async function scenario(version, options = {}) {
  const apiCalls = [], renames = [], notices = [], logs = [], processRequests = [];
  const rootEl = new Element();
  const outer = new Element();
  const folder = new Folder('test'), source = new Folder('test/test1'), target = new Folder('test/test2');
  const third = new Folder('test/test3'), outside = new Folder('other');
  const note = new File('test/test1/未命名 1.md');
  const canvasFile = new File('test/test1/未命名.canvas');
  const files = [folder, source, target, third, outside, note, canvasFile];
  source.parent = target.parent = third.parent = folder;
  note.parent = canvasFile.parent = source;
  let canvasData = {nodes: [{id: 'one-card', type: 'file', file: note.path}], edges: []};
  const nativeManager = {draggable: {type: 'folder', file: source}};
  const vault = {
    getName: () => 'test-vault',
    getAbstractFileByPath: p => files.find(f => f.path === p),
    getAvailablePath: p => p,
    async rename(file, destination) {
      // Mirrors Vault.rename's same-path guard; mutation uses in-memory files.
      if (file.path === destination) return;
      const oldPath = file.path;
      for (const item of files.filter(f => f.path === oldPath || f.path.startsWith(oldPath + '/'))) {
        const old = item.path;
        item.path = destination + item.path.slice(oldPath.length);
        renames.push([old, item.path]);
        canvas.onRename(item, old);
      }
      file.parent = files.find(f => f.path === destination.slice(0, destination.lastIndexOf('/')));
    },
    async process(file, callback) {
      processRequests.push(file.path);
      canvasData = JSON.parse(callback(JSON.stringify(canvasData)));
    },
  };
  const views = {fileItems: {}, tree: {selectedDoms: new Set()}, sort() {}};
  for (const [index, file] of [source, target, third].entries()) {
    const el = new Element(file.path, rootEl); el.index = index;
    views.fileItems[file.path] = {file, el, collapsed: true};
  }
  const sourceItem = views.fileItems[source.path];
  const targetItem = views.fileItems[target.path];
  const thirdItem = views.fileItems[third.path];
  if (options.multi) views.tree.selectedDoms = new Set([sourceItem, thirdItem]);
  const externalTargetEl = new Element(outside.path, outer);
  const metadataCache = {onCleanCache: cb => queueMicrotask(cb), iterateAllRefs() {}};
  const app = {vault, metadataCache, dragManager: nativeManager,
    workspace: {getLeavesOfType: () => [{view: views}]}};
  views.app = app;
  const obsidian = {Platform: {isMobile: false}, TFolder: Folder, TFile: File,
    Plugin: class {constructor(app) {this.app = app;}}, PluginSettingTab: class {}, Modal: class {}};
  const context = vm.createContext({
    module: {exports: {}}, require: name => {assert.equal(name, 'obsidian'); return obsidian;},
    console: {log() {}, warn: console.warn, error: console.error}, Promise, queueMicrotask, DragEvent: FakeEvent, Node: {DOCUMENT_POSITION_FOLLOWING: 4},
    window: new Element(), document: {},
    cancelAnimationFrame() {}, requestAnimationFrame: cb => {cb(); return 1;},
    setTimeout, clearTimeout,
    tI: Folder, eI: File, nI: class TemporaryFile {},
    FI: (file, parent) => file !== parent && !parent.path.startsWith(file.path + '/'),
    db: {interface: {dragAndDrop: {moveIntoFolder: ({folder}) => `Move into ${folder}`}}},
    Gl: callback => {const fn = () => {fn.pending = true;}; fn.flush = () => {if (fn.pending) {fn.pending = false; callback();}}; return fn;},
    nte: {name: () => 'Canvas', desc: () => '', msgUpdatingLinks: ({count}) => `updating ${count}`,
      msgUpdatedLinks: ({count}) => {notices.push(count); return `updated ${count}`;}},
    zT: class {constructor() {this.containerEl = {addClass() {}, removeClass() {}};} setMessage() {}},
    Yb: value => JSON.stringify(value), tte: 'canvas',
  });
  vm.runInContext(`Array.prototype.contains=function(x){return this.includes(x)};${asyncHelper};${generatorHelper};
    var WT=(${queueClass})();var CanvasClass=(${canvasClass})();`, context);
  const canvas = new context.CanvasClass();
  canvas.app = app;
  canvas.index = {getAll: () => ({[canvasFile.path]: {embeds: canvasData.nodes.map(n => ({file: n.file}))}})};
  canvas.localDataManager = {handleRename() {}};
  const actualRename = vm.runInContext(`(${renameFile})`, context);
  app.fileManager = {
    vault, app, updateQueue: new context.WT(), inProgressUpdates: null,
    runAsyncLinkUpdate: vm.runInContext(`(${runAsyncLinkUpdate})`, context),
    async updateAllLinks() {},
    renameFile(file, dest) {apiCalls.push([file.path, dest]); return actualRename.call(this, file, dest);},
  };
  nativeManager.handleDrop = vm.runInContext(`(${nativeDrop})`, context);
  views.attachDropHandler = vm.runInContext(`(${attachDrop})`, context);
  views.attachDropHandler(target, targetItem.el);
  views.attachDropHandler(outside, externalTargetEl);
  const pluginFile = version === 'main.js'
    ? path.resolve(__dirname, '../main.js')
    : path.join(__dirname, 'fixtures/manual-sorting-3.2.4.js');
  let pluginSource = fs.readFileSync(pluginFile, 'utf8');
  if (version === 'guard-only') pluginSource = pluginSource.replace(
    'this.plugin.app.fileManager.renameFile(a,c),this.plugin.orderManager.move(o,c,n,r)',
    'o!==c&&this.plugin.app.fileManager.renameFile(a,c),this.plugin.orderManager.move(o,c,n,r)');
  vm.runInContext(pluginSource, context);
  const plugin = new context.module.exports(app);
  plugin.settings = {sortOrder: 'custom', newItemPlacement: 'top', customOrder: {
    '/': {children: ['test', 'other'], sortOrder: 'custom'},
    test: {children: ['test/test1', 'test/test2', 'test/test3'], sortOrder: 'custom'},
    'test/test1': {children: [note.path, canvasFile.path], sortOrder: 'custom'},
    'test/test2': {children: [], sortOrder: 'custom'},
    'test/test3': {children: [], sortOrder: 'custom'},
  }};
  plugin.saveSettings = () => {};
  plugin.orderManager.reconcileOrder = () => {};
  plugin.explorerManager.waitForExplorerElement = async () => rootEl;
  const dnd = plugin.dndManager;
  dnd.log.info = (...parts) => logs.push(parts.join(' '));
  for (const key of ['collapseDraggedFolder', 'updateDropIndicators', 'clearDropIndicators', 'stopAutoScroll', 'handleAutoScroll']) dnd[key] = () => {};
  const sibling = options.into ? new Element('test/test2/temp', rootEl, ['temp-child']) : targetItem.el;
  dnd.findDropTarget = () => ({futureSibling: options.invalid ? null : sibling, dropPosition: 'after'});
  await dnd.enable();
  if (!options.external) {
    dispatch(new FakeEvent('dragstart', sourceItem.el));
    dispatch(new FakeEvent('drag', sourceItem.el));
  }
  const dropEvent = new FakeEvent('drop', options.outside ? externalTargetEl : targetItem.el);
  if (!options.cancel) dispatch(dropEvent);
  if (!options.external) dispatch(new FakeEvent('dragend', sourceItem.el));
  await app.fileManager.updateQueue.promise;
  canvas.requestProcessRename.flush();
  await canvas.renameQueue.promise;
  const captureHandlers = rootEl.listeners.filter(l => l.type === 'drop' && l.capture).length;
  dnd.disable();
  return {apiCalls, renames, notices, logs, processRequests, finalPath: source.path,
    cardPath: canvasData.nodes[0].file, order: plugin.settings.customOrder.test.children,
    dropPrevented: dropEvent.defaultPrevented, captureHandlers};
}

(async () => {
  const results = [];
  async function check(name, version, options, verify) {
    const result = await scenario(version, options); verify(result);
    results.push({name, ...result}); console.log('PASS', name);
  }
  await check('Original: sibling reorder makes two moves while custom log shows same path', 'original-main.js', {}, r => {
    assert.equal(r.finalPath, 'test/test1');
    assert.deepEqual(r.apiCalls, [['test/test1', 'test/test2/test1'], ['test/test1', 'test/test1']]);
    assert.deepEqual(r.notices, [2]);
    assert.ok(r.logs.some(l => l.includes("Moving 'test/test1' to 'test/test1'")));
  });
  await check('Original: intentional move into folder counts one card', 'original-main.js', {into: true}, r => {
    assert.equal(r.finalPath, 'test/test2/test1'); assert.deepEqual(r.notices, [1]);
  });
  await check('Guard alone is insufficient: native drop still moves a sibling into the hovered folder', 'guard-only', {}, r => {
    assert.equal(r.finalPath, 'test/test2/test1'); assert.equal(r.apiCalls.length, 1);
    assert.deepEqual(r.notices, [1]);
  });
  await check('Patched: sibling reorder changes order without any rename or Canvas processing', 'main.js', {}, r => {
    assert.deepEqual(r.apiCalls, []); assert.deepEqual(r.renames, []); assert.deepEqual(r.notices, []);
    assert.deepEqual(r.processRequests, []); assert.equal(r.finalPath, 'test/test1');
    assert.deepEqual(Array.from(r.order), ['test/test2', 'test/test1', 'test/test3']);
    assert.equal(r.captureHandlers, 0);
  });
  await check('Patched: intentional move executes once and counts one card', 'main.js', {into: true}, r => {
    assert.equal(r.apiCalls.length, 1); assert.equal(r.finalPath, 'test/test2/test1');
    assert.deepEqual(r.notices, [1]); assert.equal(r.captureHandlers, 0);
  });
  await check('Patched: cancelled drag neither moves nor reorders', 'main.js', {cancel: true}, r => {
    assert.deepEqual(r.apiCalls, []);
    assert.deepEqual(Array.from(r.order), ['test/test1', 'test/test2', 'test/test3']);
    assert.equal(r.captureHandlers, 0);
  });
  await check('Patched: external source retains native drop handling', 'main.js', {external: true}, r => {
    assert.equal(r.apiCalls.length, 1); assert.equal(r.finalPath, 'test/test2/test1');
  });
  await check('Patched: drop outside explorer retains native handling without a move back', 'main.js', {outside: true}, r => {
    assert.equal(r.apiCalls.length, 1); assert.equal(r.finalPath, 'other/test1');
  });
  await check('Patched: invalid custom target does not fall through to native folder move', 'main.js', {invalid: true}, r => {
    assert.deepEqual(r.apiCalls, []); assert.equal(r.captureHandlers, 0);
  });
  await check('Patched: multi-selection reorder invokes no file operations', 'main.js', {multi: true}, r => {
    assert.deepEqual(r.apiCalls, []);
    assert.deepEqual(Array.from(r.order), ['test/test2', 'test/test1', 'test/test3']);
  });
  await check('Patched: multi-selection cross-folder drop moves each selected folder once', 'main.js', {multi: true, into: true}, r => {
    assert.equal(r.apiCalls.length, 2); assert.equal(r.finalPath, 'test/test2/test1');
    assert.deepEqual(r.notices, [1]);
  });
  fs.mkdirSync(path.join(__dirname, '../test-results'), {recursive: true});
  fs.writeFileSync(path.join(__dirname, '../test-results/drag.json'), JSON.stringify(results, null, 2));
  console.log(`${results.length} checks passed. Vault files were not modified.`);
})().catch(error => {console.error(error); process.exitCode = 1;});
