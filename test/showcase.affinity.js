'use strict';
// Renders the README images in a scratch document (run through dev/mcp.mjs). The PNGs land on
// the Desktop as _showcase_<name>.png; move them into docs/images. Each image is a white card
// around its content.
const { Document, DocumentPreset, FileExportOptions, FileExportArea } = require('/document.js');
const { Selection } = require('/selections.js');
const { AddChildNodesCommandBuilder, DocumentCommand } = require('/commands.js');
const { PolyCurveNodeDefinition, PolyCurveTextNodeDefinition } = require('/nodes.js');
const { StoryBuilder } = require('/storybuilder.js');
const { StoryDelta } = require('/storydelta.js');
const { GlyphAttDoubleType } = require('/glyphatts.js');
const { CurveBuilder, PolyCurve, Transform } = require('/geometry.js');
const { FillDescriptor } = require('/fills.js');
const { LineStyleDescriptor } = require('/linestyle.js');
const { RGBA8 } = require('/colours.js');
const { BlendMode } = require('affinity:common');
const { Application } = require('/application.js');
const fonts = require('../src/fonts.js');
const ui = require('../src/ui.js');
const { buildCommand, editContext } = require('../src/engine.js');

const outDir = Application.userDesktopPath.split('\\').join('/');
const doc = Document.createFromPreset(DocumentPreset.all.filter(p => p.name.includes('A4'))[0], false);
const index = fonts.readIndex();
const page = doc.currentSpread.getSpreadBaseBox();
const log = [];

function rectCurve(x, y, w, h) {
    const pc = PolyCurve.create();
    pc.addCurve(new CurveBuilder().beginXY(x, y).lineToXY(x + w, y).lineToXY(x + w, y + h).lineToXY(x, y + h).close().createCurve());
    return pc;
}

function tool(settings, dy = 0) {
    doc.selection = Selection.createEmpty(doc);
    const s = { ...ui.DEFAULTS, family: 'Sakkal Majalla', ...settings };
    const { cmd } = buildCommand(doc, index, s, { target: null }, true);
    doc.executeCommand(cmd);
    const target = editContext(doc).target;
    if (dy)
        doc.executeCommand(DocumentCommand.createTransform(Selection.create(doc, [target]), Transform.createTranslate(0, dy)));
    return target;
}

// Affinity's own text, to show how it renders Arabic.
function nativeText(text, family, pt) {
    const sb = StoryBuilder.create();
    sb.setToFrameTextDefaultStyle(doc.dpi, doc.rasterFormat);
    sb.applyGlyphDelta(StoryDelta.createFamilyName(family));
    sb.applyGlyphDelta(StoryDelta.createGlyphDouble(GlyphAttDoubleType.Height, pt * doc.dpi / 72));
    sb.addText(text);
    const w = page.width * 0.95, h = pt * doc.dpi / 72 * 1.6;
    const b = AddChildNodesCommandBuilder.create();
    b.addNode(PolyCurveTextNodeDefinition.createFromStoryBuilder(rectCurve(page.x + (page.width - w) / 2, page.y + page.height / 2 - h / 2, w, h), sb));
    doc.executeCommand(b.createCommand(true));
    doc.selection = Selection.createEmpty(doc);
}

// A white card goes in first (so it sits at the back) and is fitted around the content
// before export; the card's area is what gets exported.
let card = null;
function startCard() {
    const def = PolyCurveNodeDefinition.create(rectCurve(page.x, page.y, 10, 10),
        FillDescriptor.createSolid(RGBA8(255, 255, 255, 255), BlendMode.Normal), FillDescriptor.createNone(),
        LineStyleDescriptor.createDefault(0), FillDescriptor.createNone());
    const b = AddChildNodesCommandBuilder.create();
    b.addPolyCurveNode(def);
    doc.executeCommand(b.createCommand(true));
    card = doc.selection.nodes.toArray()[0];
    doc.selection = Selection.createEmpty(doc);
}

function exportCard(name, pad = 60, box = null) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const n of doc.layers) {
        if (n.isSameNode(card))
            continue;
        const bb = box || n.getExactSpreadBaseBox();
        x0 = Math.min(x0, bb.x); y0 = Math.min(y0, bb.y);
        x1 = Math.max(x1, bb.x + bb.width); y1 = Math.max(y1, bb.y + bb.height);
    }
    doc.executeCommand(DocumentCommand.createSetCurves(card.curvesInterface, rectCurve(x0 - pad, y0 - pad, x1 - x0 + 2 * pad, y1 - y0 + 2 * pad)));
    // The whole page is exported; tools/crop line: name x y w h in page pixels.
    const path = outDir + '/_showcase_' + name + '.png';
    doc.export(path, FileExportOptions.createWithPresetName('PNG'), null, null);
    log.push(['crop', name, x0 - pad - page.x, y0 - pad - page.y, x1 - x0 + 2 * pad, y1 - y0 + 2 * pad].map(v => typeof v === 'number' ? Math.round(v) : v).join(' '));
    doc.executeCommand(DocumentCommand.createDeleteSelection(Selection.create(doc, [...doc.layers])));
    startCard();
}

try {
    startCard();
    const sentence = 'الخط العربي فنٌّ وجمال';
    nativeText(sentence, 'Sakkal Majalla', 48);
    exportCard('before');

    tool({ text: sentence, sizePt: 48 });
    exportCard('after');

    tool({ text: 'جميل', sizePt: 44, align: 'center', stretch: 0 }, -70);
    tool({ text: 'جميل', sizePt: 44, align: 'center', stretch: 6 }, 70);
    exportCard('kashida');

    tool({ text: 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ', family: 'Arabic Typesetting', sizePt: 48, align: 'center' });
    exportCard('harakat');

    tool({
        text: 'الخط العربي فن جميل يجمع بين الدقة والإبداع، وقد تطور عبر القرون حتى صار من أعظم الفنون التي عرفها الإنسان، وما زال حتى عام 2026 مصدر إلهام للمصممين.',
        sizePt: 22, align: 'justify', widthPx: 900, kashida: true, digits: 'arabic'
    });
    exportCard('justify');

    tool({ text: 'مرحباً بكم في Affinity 3 مع الأرقام ١٢٣', family: 'Segoe UI', sizePt: 34, align: 'center' });
    exportCard('mixed');
} catch (e) {
    log.push('ERROR ' + e.message + '\n' + e.stack);
} finally {
    console.log(log.join('\n'));
    doc.close();
}
