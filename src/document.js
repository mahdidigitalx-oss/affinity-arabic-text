'use strict';
// Everything that touches the Affinity document: building the commands that create
// the Arabic text object, and the ones that replace it in place when it is edited.

const { AddChildNodesCommandBuilder, CompoundCommandBuilder, DocumentCommand } = require('/commands.js');
const { PolyCurveNodeDefinition, ContainerNodeDefinition } = require('/nodes.js');
const { FillDescriptor } = require('/fills.js');
const { LineStyleDescriptor } = require('/linestyle.js');
const { Selection } = require('/selections.js');
const { BlendMode } = require('affinity:common');
const { DocumentCommandApi } = require('affinity:commands');
const { WindingOrder } = require('affinity:geometry');
const { unionBox } = require('./curves.js');

const TAG = 'arabic-text';          // on the root object: JSON with text + settings + placement
const PART_TAG = 'arabic-text-part'; // on children of a container: 'letters' | 'marks'

function readData(node) {
    try {
        if (node && node.tagInterface && node.hasKey(TAG))
            return JSON.parse(node.getValueForKey(TAG));
    } catch (e) {
        // not ours, or unreadable
    }
    return null;
}

// The Arabic text object the selection belongs to (the selection may be one of its children).
function findTarget(doc) {
    for (const n of doc.selection.nodes.toArray()) {
        for (let p = n; p; p = p.parent) {
            if (readData(p))
                return p;
            if (!p.parent || p.isSameNode(p.parent))
                break;
        }
    }
    return null;
}

function isContainer(node) {
    return !node.curvesInterface;
}

function childrenOf(node) {
    return node.children ? node.children.toArray() : [];
}

// Fill / stroke / transparency of an existing curves object, to carry over on re-creation.
function appearanceOf(node) {
    if (!node || !node.brushFillInterface)
        return null;
    const ls = node.lineStyleInterface;
    return {
        brush: node.brushFillInterface.getCurrentDescriptor(),
        pen: ls ? ls.getCurrentFillDescriptor() : FillDescriptor.createNone(),
        line: ls ? ls.getCurrentLineStyleDescriptor() : LineStyleDescriptor.createDefault(0),
        transparency: node.transparencyInterface ? node.transparencyInterface.fillDescriptor : FillDescriptor.createNone()
    };
}

function defaultAppearance(colour) {
    return {
        brush: FillDescriptor.createSolid(colour, BlendMode.Normal),
        pen: FillDescriptor.createNone(),
        line: LineStyleDescriptor.createDefault(0),
        transparency: FillDescriptor.createNone()
    };
}

function partDefinition(part, look) {
    const def = PolyCurveNodeDefinition.create(part.polyCurve, look.brush, look.pen, look.line, look.transparency);
    def.userDescription = part.label;
    return def;
}

function partsBox(parts) {
    return unionBox(parts.map(p => p.polyCurve.exactBoundingBox));
}

// Glyph contours overlap where letters join; the default odd-even fill would punch white
// holes there, so every curves object we make is filled with the non-zero rule.
// (The SDK has no JS wrapper for this command yet.) null selection = current selection.
function nonZeroFill(selection) {
    return new DocumentCommand(DocumentCommandApi.createSetWindingModeCommand(selection ? selection.handle : null, WindingOrder.NonZero));
}

function compound(cmds) {
    const b = CompoundCommandBuilder.create();
    for (const c of cmds)
        b.addCommand(c);
    return b.createCommand();
}

function rootName(text) {
    const first = text.replace(/\s+/g, ' ').trim();
    return 'نص عربي: ' + (first.length > 24 ? first.slice(0, 24) + '…' : first);
}

// Commands that add a brand-new object (selected afterwards). `looks` = {letters, marks}.
// `into`: parent to insert into; otherwise Affinity uses the selection (a selected group or
// layer receives the new object).
function addCommands(doc, parts, looks, data, into = null) {
    const cmds = [];
    const payload = JSON.stringify(data);
    if (parts.length === 1) {
        const b = AddChildNodesCommandBuilder.create();
        const def = partDefinition(parts[0], looks[parts[0].kind] || looks.letters);
        def.userDescription = rootName(data.text);
        if (into)
            b.setInsertionTarget(into);
        b.addPolyCurveNode(def);
        cmds.push(b.createCommand(true));
        cmds.push(nonZeroFill(null));
        cmds.push(DocumentCommand.createSetTagValueForKey(null, TAG, payload));
        return cmds;
    }
    // Container first (selected), then its children go into the selection.
    const cb = AddChildNodesCommandBuilder.create();
    if (into)
        cb.setInsertionTarget(into);
    cb.addContainerNode(ContainerNodeDefinition.create(rootName(data.text)));
    cmds.push(cb.createCommand(true));
    cmds.push(DocumentCommand.createSetTagValueForKey(null, TAG, payload));
    const kids = AddChildNodesCommandBuilder.create();
    for (const p of parts)
        kids.addPolyCurveNode(partDefinition(p, looks[p.kind] || looks.letters));
    cmds.push(kids.createCommand(true));
    cmds.push(nonZeroFill(null));
    return cmds;
}

function tagChildrenCommands(doc, container) {
    // Called after execution: mark each child with its part kind so edits can find the harakat.
    const cmds = [];
    for (const child of childrenOf(container)) {
        const kind = child.userDescription === 'الحركات' ? 'marks' : 'letters';
        cmds.push(DocumentCommand.createSetTagValueForKey(Selection.create(doc, [child]), PART_TAG, kind));
    }
    return cmds;
}

// Current placement of an existing object, in the same space its geometry was written in.
function currentBox(target) {
    if (!isContainer(target))
        return target.curvesInterface.polyCurve.exactBoundingBox;
    return target.getExactSpreadBaseBox();
}

// Re-fit the stored layout->document mapping to wherever the user moved or scaled the object.
function refitMapping(data, target) {
    const B0 = data.box, B1 = currentBox(target), M0 = data.map;
    const near = (a, b) => Math.abs(a - b) < 1e-6 * Math.max(1, Math.abs(b));
    let sx = B0.width > 0 ? B1.width / B0.width : 1;
    let sy = B0.height > 0 ? B1.height / B0.height : 1;
    if (near(sx, 1)) sx = 1;
    if (near(sy, 1)) sy = 1;
    return {
        a: M0.a * sx, d: M0.d * sy,
        e: B1.x + (M0.e - B0.x) * sx,
        f: B1.y + (M0.f - B0.y) * sy
    };
}

// Looks to reuse when replacing `target`: letters from the first letters part, harakat from
// the harakat part (falling back to letters), so gradients/strokes the user set survive.
function looksOf(target) {
    if (!isContainer(target)) {
        const look = appearanceOf(target);
        return { letters: look, marks: look };
    }
    const kids = childrenOf(target);
    const kindOf = c => c.hasKey && c.hasKey(PART_TAG) ? c.getValueForKey(PART_TAG) : (c.userDescription === 'الحركات' ? 'marks' : 'letters');
    const letters = kids.find(c => kindOf(c) === 'letters');
    const marks = kids.find(c => kindOf(c) === 'marks');
    const l = appearanceOf(letters) || appearanceOf(marks);
    return { letters: l, marks: appearanceOf(marks) || l };
}

// Commands that rewrite `target` with new parts, keeping its appearance and position.
// For a live preview (`preview`), old parts are only hidden: deleting objects on every
// keystroke churns the Layers panel, and the preview is thrown away anyway.
function replaceCommands(doc, target, parts, looks, data, preview = false) {
    const remove = sel => preview ? DocumentCommand.createHideSelection(sel) : DocumentCommand.createDeleteSelection(sel);
    const payload = JSON.stringify(data);
    const self = Selection.create(doc, [target]);
    const wasContainer = isContainer(target);
    if (!wasContainer && parts.length === 1) {
        // Same structure: swap the geometry only. Fill, effects, name and stacking all stay.
        return [
            DocumentCommand.createSetCurves(target.curvesInterface, parts[0].polyCurve),
            nonZeroFill(self),
            DocumentCommand.createSetTagValueForKey(self, TAG, payload),
            DocumentCommand.createSetDescription(self, rootName(data.text))
        ];
    }
    if (wasContainer && parts.length > 1) {
        // Keep the container (its effects and transform), rebuild the children.
        const cmds = [];
        const kids = childrenOf(target);
        if (kids.length)
            cmds.push(remove(Selection.create(doc, kids)));
        const b = AddChildNodesCommandBuilder.create();
        b.setInsertionTarget(target);
        for (const p of parts)
            b.addPolyCurveNode(partDefinition(p, looks[p.kind] || looks.letters));
        cmds.push(b.createCommand(true));
        cmds.push(nonZeroFill(null));
        cmds.push(DocumentCommand.createSetTagValueForKey(self, TAG, payload));
        cmds.push(DocumentCommand.createSetDescription(self, rootName(data.text)));
        cmds.push(DocumentCommand.createSetSelection(self));
        return cmds;
    }
    // Structure changes (one shape <-> several): add the new object beside the old one
    // (same parent), then remove the old one. The caller re-selects the new object.
    const cmds = addCommands(doc, parts, looks, data, target.parent);
    cmds.push(remove(self));
    return cmds;
}

module.exports = {
    TAG, PART_TAG, readData, findTarget, isContainer, childrenOf,
    defaultAppearance, looksOf, partsBox, refitMapping,
    addCommands, replaceCommands, tagChildrenCommands, compound
};
