// Sanity checks for line breaking, justification and bidi on a real font.
const fs = require('fs');
const assert = require('assert');
const { Face, Font } = require('../src/hb.js');
const { layout } = require('../src/layout.js');
const { opportunities } = require('../src/kashida.js');
const { prepare } = require('../src/text.js');

const font = new Font(new Face(new Uint8Array(fs.readFileSync('C:/Windows/Fonts/tahoma.ttf'))));
const para = 'الخط العربي فن جميل يجمع بين الدقة والإبداع، وقد تطور عبر القرون حتى صار من أعظم الفنون.';
const base = { sizePx: 40, lineSpacing: 1, width: 0, kashida: true, direction: 'rtl', align: 'right' };

// 1. No width: one line, anchor at the right edge.
let r = layout(para, font, base);
assert.strictEqual(r.lines.length, 1);
assert.ok(Math.abs(r.anchor - r.width) < 1e-6);

// 2. Wrapping: every non-last line fits; justified lines fill the width exactly.
r = layout(para, font, { ...base, width: 400, align: 'justify' });
assert.ok(r.lines.length > 2, 'expected several lines, got ' + r.lines.length);
for (const l of r.lines.slice(0, -1)) {
  assert.ok(l.width * r.scale <= 400 + 0.5, 'line too wide');
  assert.ok(Math.abs(l.width * r.scale - 400) < 1, 'justified line short: ' + l.width * r.scale);
}
const usedKashida = r.lines.some(l => l.text.includes('\u0640'));
assert.ok(usedKashida, 'kashida should be used when justifying');

// 3. Justify without kashida stretches spaces only.
r = layout(para, font, { ...base, width: 400, align: 'justify', kashida: false });
assert.ok(!r.lines.some(l => l.text.includes('\u0640')));

// 4. Bidi: the English word keeps its letters in reading order inside RTL text.
r = layout('برنامج Affinity رائع', font, base);
const gl = r.lines[0].glyphs;
const latin = gl.filter(g => 'Affinity'.includes(r.lines[0].text[g.cl]) && /[A-Za-z]/.test(r.lines[0].text[g.cl]));
assert.ok(latin.every((g, i) => i === 0 || g.x > latin[i - 1].x), 'Latin run should read left to right');
const firstArabic = gl.find(g => g.cl === 0);   // first logical letter of the line ...
assert.ok(firstArabic.x > latin[0].x, '... sits to the right of the Latin word');

// 5. Kashida never splits lam-alef, prefers seen/sad.
assert.ok(opportunities('سلام').every(o => !(o.at === 2)), 'no tatweel inside لا');
assert.strictEqual(opportunities('مسجد').reduce((a, b) => a.priority < b.priority ? a : b).priority, 1);

// 6. Digits and harakat options.
assert.strictEqual(prepare('عام 2026', { digits: 'arabic' }), 'عام ٢٠٢٦');
assert.strictEqual(prepare('عام ٢٠٢٦', { digits: 'latin' }), 'عام 2026');
assert.strictEqual(prepare('بِسْمِ', { harakat: false }), 'بسم');

// 7. Marks are flagged.
r = layout('بِسْمِ', font, base);
assert.ok(r.lines[0].glyphs.some(g => g.mark));
// 8. Word stretching: never inside the name of God; one word per line fits the width.
const { stretchWords } = require('../src/kashida.js');
assert.strictEqual(stretchWords('الله', 3), 'الله');
assert.strictEqual(stretchWords('والله', 3), 'والله');
assert.strictEqual(stretchWords('جميل', 3), 'جميـــل');
r = layout(para, font, { ...base, width: 400, stretch: { count: 6, scope: 'best' } });
for (const line of r.lines) {
    const runs = line.text.match(/ـ+/g) || [];
    assert.ok(runs.length <= 1, 'one stretched word per line: ' + line.text);
    assert.ok(line.width <= 400 / r.scale + 0.5, 'stretched line still fits: ' + line.text);
}
assert.ok(r.lines.some(l => l.text.includes('ـ')), 'some line is stretched');
r = layout('الخط العربي فن', font, { ...base, stretch: { count: 3, scope: 'last' } });
assert.ok(/ـــ/.test(r.lines[0].text.split(' ').pop()), 'last word stretched: ' + r.lines[0].text);
console.log('layout tests OK');
