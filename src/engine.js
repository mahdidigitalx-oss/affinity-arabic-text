'use strict';
// Settings in, Affinity command out. Shared by the dialog (main.js) and the tests.

const { RGBA8 } = require('/colours.js');
const fonts = require('./fonts.js');
const { prepare } = require('./text.js');
const { layout } = require('./layout.js');
const { buildParts } = require('./curves.js');
const { stretchWords } = require('./kashida.js');
const D = require('./document.js');

const VERSION = 1;

// What an edit needs, captured before any preview modifies the object.
function editContext(doc) {
    const target = D.findTarget(doc);
    if (!target)
        return { target: null };
    const stored = D.readData(target);
    return { target, stored, map: D.refitMapping(stored, target), looks: D.looksOf(target) };
}

const STRETCH_STEP_EM = 0.2;

function tatweelsFor(font, steps) {
    if (steps <= 0 || !font.hasGlyph(0x0640))
        return steps;
    const w = font.shape('ـ', { rtl: true, script: 'Arab', language: 'ar' }).reduce((a, g) => a + g.ax, 0);
    return w > 0 ? Math.max(steps, Math.round(steps * STRETCH_STEP_EM * font.face.upem / w)) : steps;
}

function compose(doc, s, index, map) {
    const family = index.families.find(f => f.name === s.family) || index.families[0];
    const face = fonts.pickFace(family, s.weight, s.italic);
    const font = fonts.loadFont(face);
    // Stretching every word changes word widths, so it happens before line breaking;
    // one word per line is chosen once the lines are known.
    // One step of "stretch" is a fixed length (a fifth of the em), turned into however many
    // tatweels this font needs: tatweel widths differ twentyfold between fonts.
    const amount = tatweelsFor(font, Math.round(s.stretch || 0));
    const perLine = s.stretchScope === 'best' || s.stretchScope === 'last';
    const prepared = prepare(s.text, { digits: s.digits, harakat: s.harakat });
    const text = perLine ? prepared : stretchWords(prepared, amount);
    const L = layout(text, font, {
        stretch: perLine ? { count: amount, scope: s.stretchScope } : null,
        sizePx: s.sizePt * doc.dpi / 72,
        align: s.align,
        lineSpacing: s.lineSpacing / 100,
        width: s.widthPx,
        kashida: s.kashida,
        direction: s.direction
    });
    if (!map) {
        // New object: centre the text block on the current page.
        const page = doc.currentSpread.getSpreadBaseBox();
        map = {
            a: 1, d: 1,
            e: page.x + page.width / 2 - (L.width / 2 - L.anchor),
            f: page.y + page.height / 2 - L.height / 2
        };
    }
    // 'marks' = one shape for the letters and one for the harakat.
    const parts = s.mode === 'marks' ? buildParts(L, font, 'single', true, map) : buildParts(L, font, s.mode, false, map);
    const missing = [...new Set([...text].filter(ch => ch.trim() && !font.hasGlyph(ch.codePointAt(0))))];
    if (perLine && amount > 0 && !font.hasGlyph(0x0640))
        missing.push('ـ');
    return { parts, map, missing };
}

// Returns { cmd, note }; cmd is null when there is nothing to draw.
// `preview`: the command is for the live preview, not the final result.
function buildCommand(doc, index, s, ctx, colourTouched, preview = false) {
    if (!s.text.trim())
        return { cmd: null, note: 'اكتب النص في المربع. إن لم تتحدث المعاينة أثناء الكتابة فاضغط Tab.' };
    const { parts, map, missing } = compose(doc, s, index, ctx.target ? ctx.map : null);
    if (!parts.length)
        return { cmd: null, note: 'لا توجد حروف قابلة للرسم بهذا الخط.' };
    let looks = ctx.target ? ctx.looks : null;
    if (!looks || !looks.letters || colourTouched) {
        const fresh = D.defaultAppearance(RGBA8(s.colour.r, s.colour.g, s.colour.b, s.colour.alpha));
        looks = looks && looks.letters
            ? { letters: { ...looks.letters, brush: fresh.brush }, marks: { ...(looks.marks || looks.letters), brush: fresh.brush } }
            : { letters: fresh, marks: fresh };
    }
    const data = { v: VERSION, text: s.text, settings: s, map, box: D.partsBox(parts) };
    const cmds = ctx.target ? D.replaceCommands(doc, ctx.target, parts, looks, data, preview) : D.addCommands(doc, parts, looks, data);
    const note = missing.length ? 'تنبيه: الخط لا يحتوي هذه الحروف: ' + missing.join(' ') : '';
    return { cmd: D.compound(cmds), note };
}

// After execution, select the Arabic text object the command produced (structure changes
// delete the old object, which empties the selection).
// The commands may leave the parts (children) selected; select the whole object instead.
function selectResult(doc, cmd) {
    const { Selection } = require('/selections.js');
    let root = D.findTarget(doc);
    if (!root) {
        const made = cmd.newNodes ? (cmd.newNodes.toArray ? cmd.newNodes.toArray() : [...cmd.newNodes]) : [];
        root = made.find(n => D.readData(n));
    }
    if (root)
        doc.selection = Selection.create(doc, [root]);
}

module.exports = { editContext, buildCommand, selectResult, VERSION };
