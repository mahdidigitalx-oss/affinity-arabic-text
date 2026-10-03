'use strict';
// Preview path for both create and edit, for every display mode, without showing the dialog.
// Also previews a change of display mode (a structure change): the old object must only be
// hidden during the preview, and come back untouched when the preview is cleared.
const { Document, DocumentPreset } = require('/document.js');
const { Selection } = require('/selections.js');
const fonts = require('../src/fonts.js');
const ui = require('../src/ui.js');
const { editContext, buildCommand, selectResult } = require('../src/engine.js');

const doc = Document.createFromPreset(DocumentPreset.all.filter(p => p.name.includes('A4'))[0], false);
const out = [];
try {
    const index = fonts.readIndex();
    const base = { ...ui.DEFAULTS, family: fonts.defaultFamily(index), text: 'مهدي محمد' };
    const MODES = ['single', 'line', 'word', 'marks'];
    for (const mode of MODES) {
        doc.selection = Selection.createEmpty(doc);
        let ctx = editContext(doc);
        const s = { ...base, mode, text: mode === 'marks' ? 'بِسْمِ ٱللَّهِ' : base.text };
        try {
            doc.executeCommand(buildCommand(doc, index, s, ctx, true, true).cmd, true);
            out.push(mode + ' create-preview ok');
        } catch (e) { out.push(mode + ' create-preview FAIL ' + e.message); }
        doc.clearPreviews();
        const made = buildCommand(doc, index, s, ctx, true).cmd;
        doc.executeCommand(made);
        selectResult(doc, made);
        ctx = editContext(doc);
        const layers = () => [...doc.layers].length;
        const before = layers();
        for (const t of ['مهدي', 'مهدي محمد علي']) {
            try {
                doc.executeCommand(buildCommand(doc, index, { ...ctx.stored.settings, text: t }, ctx, false, true).cmd, true);
                out.push(mode + ' edit-preview ok (' + t + ')');
            } catch (e) { out.push(mode + ' edit-preview FAIL (' + t + '): ' + e.message); }
        }
        const other = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
        try {
            doc.executeCommand(buildCommand(doc, index, { ...ctx.stored.settings, mode: other, stretch: 3, stretchScope: 'best' }, ctx, false, true).cmd, true);
            out.push(mode + ' -> ' + other + ' preview ok');
        } catch (e) { out.push(mode + ' -> ' + other + ' preview FAIL ' + e.message); }
        doc.clearPreviews();
        const back = editContext(doc);
        out.push(mode + ' after clear: ' + (layers() === before && back.target && back.target.isSameNode(ctx.target) ? 'original intact' : 'CHANGED (layers ' + before + ' -> ' + layers() + ')'));
        try {
            doc.executeCommand(buildCommand(doc, index, { ...ctx.stored.settings, text: 'نص جديد', stretch: 2, stretchScope: 'last' }, ctx, false).cmd);
            out.push(mode + ' edit-final ok');
        } catch (e) { out.push(mode + ' edit-final FAIL ' + e.message); }
    }
} finally {
    console.log(out.join('\n'));
    doc.close();   // scratch document: discard it
}
