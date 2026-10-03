'use strict';
// Paragraph layout: line breaking, bidi reordering, shaping, alignment and
// justification (kashida first, then word spaces). Pure computation, no Affinity APIs.
//
// Output coordinates are "layout pixels", y down, with x = 0 at the alignment anchor
// (right edge for right-aligned / RTL-justified text, centre for centred, left edge
// for left-aligned) and y = 0 at the top of the first line.

const bidiFactory = require('bidi-js');
const kashida = require('./kashida.js');

const bidi = bidiFactory();
const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;

function makeShaper(font) {
    const cache = new Map();
    // Shape a logical line into visual-order glyphs with bidi runs resolved.
    function shapeLine(text, baseDir) {
        const key = baseDir + '\u0000' + text;
        const hit = cache.get(key);
        if (hit)
            return hit;
        const emb = bidi.getEmbeddingLevels(text, baseDir);
        const levels = emb.levels;
        const runs = [];
        for (let i = 0; i < text.length;) {
            let j = i + 1;
            while (j < text.length && levels[j] === levels[i])
                ++j;
            runs.push({ start: i, end: j, level: levels[i] });
            i = j;
        }
        // UAX #9 rule L2: reverse runs from the highest level down to the lowest odd level.
        const maxLevel = runs.reduce((m, r) => Math.max(m, r.level), 0);
        const minOdd = runs.reduce((m, r) => (r.level & 1 ? Math.min(m, r.level) : m), 255);
        for (let lvl = maxLevel; lvl >= minOdd && lvl > 0; --lvl) {
            for (let i = 0; i < runs.length;) {
                if (runs[i].level >= lvl) {
                    let j = i;
                    while (j < runs.length && runs[j].level >= lvl)
                        ++j;
                    const seg = runs.slice(i, j).reverse();
                    runs.splice(i, j - i, ...seg);
                    i = j;
                } else {
                    ++i;
                }
            }
        }
        const glyphs = [];
        let x = 0;
        for (const r of runs) {
            const runText = text.slice(r.start, r.end);
            const rtl = (r.level & 1) === 1;
            const arabic = ARABIC.test(runText);
            const shaped = font.shape(runText, { rtl, script: arabic ? 'Arab' : null, language: arabic ? 'ar' : null });
            for (const g of shaped) {
                glyphs.push({ g: g.g, x: x + g.dx, dy: g.dy, ax: g.ax, cl: r.start + g.cl });
                x += g.ax;
            }
        }
        const res = { glyphs, width: x };
        cache.set(key, res);
        return res;
    }
    return shapeLine;
}

function splitWords(s) {
    const words = [];
    const re = /[^ \t]+/g;
    let m;
    while ((m = re.exec(s)))
        words.push({ start: m.index, end: m.index + m[0].length, text: m[0] });
    return words;
}

// opts: { sizePx, align: 'right'|'center'|'left'|'justify', lineSpacing, width (px, 0 = no wrap),
//         kashida, direction: 'rtl'|'ltr'|'auto',
//         stretch: { count, scope: 'best'|'last' } — one stretched word per line (optional) }
function layout(text, font, opts) {
    const upem = font.face.upem;
    const s = opts.sizePx / upem;
    const maxW = opts.width > 0 ? opts.width / s : 0;     // font units
    const shapeLine = makeShaper(font);
    const m = font.metrics();
    const lineAdvance = (m.ascender - m.descender + m.lineGap) * opts.lineSpacing;
    const tatweelWidth = font.hasGlyph(0x0640) ? font.shape(kashida.TATWEEL).reduce((w, g) => w + g.ax, 0) : 0;

    const lines = [];
    let wordBase = 0;
    for (const para of text.split('\n')) {
        const baseDir = opts.direction === 'auto' ? (bidi.getEmbeddingLevels(para).paragraphs[0]?.level & 1 ? 'rtl' : 'ltr') : opts.direction;
        const words = splitWords(para);
        if (!words.length) {
            lines.push({ text: '', baseDir, glyphs: [], width: 0, last: true, wordBase });
            continue;
        }
        // Greedy fill. Measuring words on their own is exact enough: joining never crosses a space.
        const spaceW = shapeLine(' ', baseDir).width;
        let cur = [], curW = 0;
        const flush = last => {
            const lineText = para.slice(cur[0].start, cur[cur.length - 1].end);
            lines.push({ text: lineText, baseDir, words: cur.map(w => ({ start: w.start - cur[0].start, text: w.text })), last, wordBase });
            wordBase += cur.length;
        };
        for (const w of words) {
            const ww = shapeLine(w.text, baseDir).width;
            const add = cur.length ? spaceW + ww : ww;
            if (maxW && cur.length && curW + add > maxW) {
                flush(false);
                cur = [w];
                curW = ww;
            } else {
                cur.push(w);
                curW += add;
            }
        }
        flush(true);
    }

    // Shape each line, justify where asked.
    for (const line of lines) {
        if (!line.text)
            continue;
        let lineText = line.text;
        let shaped = shapeLine(lineText, line.baseDir);
        if (opts.stretch && opts.stretch.count > 0) {
            // With a fixed width, shorten the stretch (binary search) until the line still fits.
            const limit = Math.max(maxW, shaped.width) + 0.5;
            const attempt = n => {
                const t = kashida.stretchLine(line.text, line.words, n, opts.stretch.scope);
                return { t, r: shapeLine(t, line.baseDir) };
            };
            let best = attempt(opts.stretch.count);
            if (maxW && best.r.width > limit) {
                let lo = 0, hi = opts.stretch.count;   // lo fits, hi does not
                best = null;
                while (hi - lo > 1) {
                    const mid = (lo + hi) >> 1;
                    const a = attempt(mid);
                    if (a.r.width <= limit) {
                        lo = mid;
                        best = a;
                    } else {
                        hi = mid;
                    }
                }
            }
            if (best) {
                lineText = best.t;
                shaped = best.r;
            }
            line.words = splitWords(lineText).map(w => ({ start: w.start, text: w.text }));
        }
        const justify = opts.align === 'justify' && maxW > 0 && !line.last;
        if (justify && opts.kashida && tatweelWidth > 0 && shaped.width < maxW) {
            // Fonts may reshape around inserted tatweels, so back off until the line fits.
            let n = Math.floor((maxW - shaped.width) / tatweelWidth);
            while (n > 0) {
                const t = kashida.insert(lineText, line.words, n);
                const r = shapeLine(t, line.baseDir);
                if (r.width <= maxW + 0.5) {
                    lineText = t;
                    shaped = r;
                    break;
                }
                --n;
            }
        }
        let glyphs = shaped.glyphs.map(g => ({ ...g }));
        let width = shaped.width;
        if (justify && width < maxW) {
            const spaces = glyphs.filter(g => lineText[g.cl] === ' ');
            if (spaces.length) {
                const extra = (maxW - width) / spaces.length;
                let shift = 0;
                for (const g of glyphs) {
                    g.x += shift;
                    if (lineText[g.cl] === ' ')
                        shift += extra;
                }
                width = maxW;
            }
        }
        // Word index per glyph (for the per-word structure).
        const wordOfChar = new Int32Array(lineText.length).fill(-1);
        let wi = -1, inWord = false;
        for (let i = 0; i < lineText.length; ++i) {
            const sp = lineText[i] === ' ' || lineText[i] === '\t';
            if (!sp && !inWord)
                ++wi;
            inWord = !sp;
            if (!sp)
                wordOfChar[i] = wi;
        }
        for (const g of glyphs) {
            const w = wordOfChar[g.cl];
            g.word = w < 0 ? -1 : line.wordBase + w;
            g.mark = font.face.isMark(g.g);
        }
        line.glyphs = glyphs;
        line.width = width;
        line.text = lineText;
    }

    const blockW = maxW || lines.reduce((mx, l) => Math.max(mx, l.width), 0);
    const anchor = opts.align === 'center' ? blockW / 2
        : opts.align === 'left' ? 0
        : opts.align === 'justify' ? (opts.direction === 'ltr' ? 0 : blockW)
        : blockW;
    lines.forEach((line, i) => {
        const startAligned = line.baseDir === 'rtl' ? blockW - line.width : 0;
        const x0 = opts.align === 'center' ? (blockW - line.width) / 2
            : opts.align === 'left' ? 0
            : opts.align === 'right' ? blockW - line.width
            : (line.width >= blockW - 0.5 ? 0 : startAligned);   // justify: short lines sit at the start
        line.x = (x0 - anchor) * s;
        line.baseline = (m.ascender + i * lineAdvance) * s;
    });

    return {
        lines,
        scale: s,
        width: blockW * s,
        height: ((lines.length - 1) * lineAdvance + m.ascender - m.descender) * s,
        anchor: anchor * s
    };
}

module.exports = { layout };
