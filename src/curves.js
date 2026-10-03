'use strict';
// Turns a layout into Affinity curves, split the way the user asked:
// one shape, one per line, or one per word, with harakat optionally on their own.

const { PolyCurve, CurveBuilder } = require('/geometry.js');

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
function arabicNumber(n) {
    return String(n).replace(/[0-9]/g, d => ARABIC_DIGITS[d]);
}

// M maps layout pixels to document pixels: X = a*x + e, Y = d*y + f.
function addGlyph(cbList, font, glyph, line, s, M) {
    const ox = line.x + glyph.x * s, oy = line.baseline - glyph.dy * s;
    const X = x => M.a * (ox + x * s) + M.e;
    const Y = y => M.d * (oy - y * s) + M.f;
    for (const contour of font.outline(glyph.g)) {
        const cb = CurveBuilder.create();
        let lx = 0, ly = 0;
        for (const seg of contour) {
            const p = seg.p;
            if (seg.t === 'M') {
                cb.beginXY(X(p[0]), Y(p[1]));
                lx = p[0]; ly = p[1];
            } else if (seg.t === 'L') {
                cb.lineToXY(X(p[0]), Y(p[1]));
                lx = p[0]; ly = p[1];
            } else if (seg.t === 'Q') {
                // Quadratic -> cubic.
                const c1x = lx + 2 / 3 * (p[0] - lx), c1y = ly + 2 / 3 * (p[1] - ly);
                const c2x = p[2] + 2 / 3 * (p[0] - p[2]), c2y = p[3] + 2 / 3 * (p[1] - p[3]);
                cb.addBezierXY(X(c1x), Y(c1y), X(c2x), Y(c2y), X(p[2]), Y(p[3]));
                lx = p[2]; ly = p[3];
            } else {
                cb.addBezierXY(X(p[0]), Y(p[1]), X(p[2]), Y(p[3]), X(p[4]), Y(p[5]));
                lx = p[4]; ly = p[5];
            }
        }
        cb.close();
        cbList.push(cb.createCurve());
    }
}

// mode: 'single' | 'line' | 'word'. Returns [{label, kind: 'letters'|'marks', polyCurve}].
function buildParts(L, font, mode, separateMarks, M) {
    const groups = new Map();
    const order = [];
    const bucket = (key, label, kind) => {
        if (!groups.has(key)) {
            groups.set(key, { label, kind, curves: [] });
            order.push(key);
        }
        return groups.get(key).curves;
    };
    L.lines.forEach((line, li) => {
        for (const g of line.glyphs) {
            let key, label;
            if (separateMarks && g.mark) {
                key = 'marks';
                label = 'الحركات';
            } else if (mode === 'line') {
                key = 'line' + li;
                label = 'السطر ' + arabicNumber(li + 1);
            } else if (mode === 'word') {
                if (g.word < 0)
                    continue;
                key = 'word' + g.word;
                label = 'الكلمة ' + arabicNumber(g.word + 1);
            } else {
                key = 'all';
                label = 'نص عربي';
            }
            addGlyph(bucket(key, label, key === 'marks' ? 'marks' : 'letters'), font, g, line, L.scale, M);
        }
    });
    // Harakat last so they sit above the letters in the layer stack.
    order.sort((a, b) => (a === 'marks') - (b === 'marks'));
    const parts = [];
    for (const key of order) {
        const g = groups.get(key);
        if (!g.curves.length)
            continue;
        const pc = new PolyCurve();
        for (const c of g.curves)
            pc.addCurve(c);
        parts.push({ label: g.label, kind: g.kind, polyCurve: pc });
    }
    return parts;
}

function unionBox(boxes) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const b of boxes) {
        x0 = Math.min(x0, b.x);
        y0 = Math.min(y0, b.y);
        x1 = Math.max(x1, b.x + b.width);
        y1 = Math.max(y1, b.y + b.height);
    }
    return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

module.exports = { buildParts, unionBox, arabicNumber };
