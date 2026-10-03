'use strict';
// End-to-end check inside Affinity (run through dev/mcp.mjs): creates objects with
// several settings in a scratch document, edits one of them, and exports a PNG.

const { Document, DocumentPreset, FileExportOptions } = require('/document.js');
const { Selection } = require('/selections.js');
const { DocumentCommand } = require('/commands.js');
const { Application } = require('/application.js');
const fonts = require('../src/fonts.js');
const ui = require('../src/ui.js');
const D = require('../src/document.js');
const { editContext, buildCommand, selectResult } = require('../src/engine.js');

const log = [];
const check = (ok, msg) => log.push((ok ? 'PASS ' : 'FAIL ') + msg);

const preset = DocumentPreset.all.filter(p => p.name.includes('A4'))[0];
const doc = Document.createFromPreset(preset, false);
const index = fonts.readIndex();
check(index && index.families.length > 5, 'font index has ' + (index ? index.families.length : 0) + ' families');

function create(settings) {
    doc.selection = Selection.createEmpty(doc);
    const s = { ...ui.DEFAULTS, family: fonts.defaultFamily(index), ...settings };
    const { cmd, note } = buildCommand(doc, index, s, { target: null }, true);
    if (!cmd)
        throw new Error('no command: ' + note);
    doc.executeCommand(cmd);
    const ctx = editContext(doc);
    check(!!ctx.target, 'created object is selected and tagged (' + (settings.label || settings.mode || 'single') + ')');
    return ctx;
}

function moveBy(node, dx, dy) {
    const { Transform } = require('/geometry.js');
    doc.executeCommand(DocumentCommand.createTransform(Selection.create(doc, [node]), Transform.createTranslate(dx, dy)));
}

const page = doc.currentSpread.getSpreadBaseBox();
const W = page.width;

// 1. Headline, single shape, Sakkal Majalla bold-ish, centred.
const a = create({ text: 'الخط العربي فنّ وجمال', sizePt: 48, weight: 700, align: 'center', label: 'headline' });
moveBy(a.target, 0, -page.height * 0.36);

// 2. Justified paragraph with kashida, per-line structure, Arabic Typesetting with harakat.
const b = create({
    text: 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ\nالخط العربي فن جميل يجمع بين الدقة والإبداع، وقد تطور عبر القرون حتى صار من أعظم الفنون التي عرفها الإنسان في عام 2026.',
    family: 'Arabic Typesetting', sizePt: 20, align: 'justify', widthPx: W * 0.7, kashida: true, mode: 'line', digits: 'arabic', label: 'paragraph'
});
moveBy(b.target, 0, -page.height * 0.12);

// 3. Per word, separate harakat, mixed English.
const c = create({ text: 'مرحباً بكم في Affinity ٣', family: 'Tahoma', sizePt: 32, mode: 'word', label: 'words' });
moveBy(c.target, 0, page.height * 0.12);
check(D.isContainer(c.target) && D.childrenOf(c.target).length >= 5, 'per-word object has a child per word (' + D.childrenOf(c.target).length + ')');

// 4. Edit: change the headline text; the object must stay where it was moved to (right edge anchored for right-aligned).
const before = a.target.getExactSpreadBaseBox();
doc.selection = Selection.create(doc, [a.target]);
let ctx = editContext(doc);
check(ctx.stored.text === 'الخط العربي فنّ وجمال', 'stored text round-trips through the tag');
let res = buildCommand(doc, index, { ...ctx.stored.settings, text: 'الخط العربي فنّ وجمال وإبداع' }, ctx, false);
doc.executeCommand(res.cmd);
ctx = editContext(doc);
const after = ctx.target.getExactSpreadBaseBox();
const centreBefore = before.x + before.width / 2, centreAfter = after.x + after.width / 2;
check(Math.abs(centreBefore - centreAfter) < 2, 'centred headline keeps its centre after edit (' + centreBefore.toFixed(1) + ' vs ' + centreAfter.toFixed(1) + ')');
check(Math.abs(before.y - after.y) < 40, 'headline keeps its vertical position');
check(after.width > before.width, 'longer text gives a wider object');

// 5. Edit with structure change: per-word object back to a single shape.
doc.selection = Selection.create(doc, [c.target]);
ctx = editContext(doc);
res = buildCommand(doc, index, { ...ctx.stored.settings, mode: 'single' }, ctx, false);
doc.executeCommand(res.cmd);
selectResult(doc, res.cmd);
ctx = editContext(doc);
check(ctx.target && !D.isContainer(ctx.target), 'switching to one shape replaces the group with a single curves object');

// 6. Harakat in their own shape; manual stretching lengthens the words.
const dd = create({ text: 'بِسْمِ ٱللَّهِ', family: 'Arabic Typesetting', sizePt: 40, mode: 'marks', label: 'marks' });
const kinds = D.childrenOf(dd.target).map(c => c.userDescription);
check(D.isContainer(dd.target) && kinds.includes('الحركات') && kinds.length === 2, 'harakat mode gives letters + harakat shapes (' + kinds.join(' / ') + ')');
moveBy(dd.target, 0, page.height * 0.25);
const plain = create({ text: 'جميل', family: 'Arabic Typesetting', sizePt: 40, label: 'plain' });
const wPlain = plain.target.getExactSpreadBaseBox().width;
const longer = create({ text: 'جميل', family: 'Arabic Typesetting', sizePt: 40, stretch: 4, label: 'stretched' });
check(longer.target.getExactSpreadBaseBox().width > wPlain * 1.15, 'stretch 4 makes the word longer (' + (longer.target.getExactSpreadBaseBox().width / wPlain).toFixed(2) + 'x)');
doc.executeCommand(DocumentCommand.createDeleteSelection(Selection.create(doc, [plain.target, longer.target])));

// 6b. Stretching one word per line, shown on the exported page.
const verse = 'الخط العربي فن وجمال\nبسم الله الرحمن الرحيم';
const perLine = create({ text: verse, family: 'Arabic Typesetting', sizePt: 30, stretch: 6, stretchScope: 'best', align: 'center', label: 'stretch best' });
moveBy(perLine.target, 0, -page.height * 0.32);
const lastWord = create({ text: verse, family: 'Arabic Typesetting', sizePt: 30, stretch: 6, stretchScope: 'last', align: 'center', label: 'stretch last' });
moveBy(lastWord.target, 0, -page.height * 0.16);
check(perLine.target.getExactSpreadBaseBox().width > 0 && lastWord.target.getExactSpreadBaseBox().width > 0, 'per-line stretching draws');

// 7. Every curves object is filled with the non-zero rule (no holes where letters overlap).
const curves = [];
const walk = n => { if (n.curvesInterface) curves.push(n); for (const c of D.childrenOf(n)) walk(c); };
for (const n of doc.layers) walk(n);
check(curves.length > 0 && curves.every(n => String(n.curvesInterface.windingOrder) === 'NonZero'), 'all ' + curves.length + ' curves objects use non-zero fill');

const out = Application.userDesktopPath.replace(/\\/g, '/') + '/_arabic_e2e.png';
doc.export(out, FileExportOptions.createWithPresetName('PNG'), null, null);
console.log(log.join('\n'));
console.log('exported', out);
doc.close();   // scratch document: discard it
