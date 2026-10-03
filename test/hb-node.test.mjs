// Compares the JS HarfBuzz build against the official WASM build on real fonts.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import * as hb from 'harfbuzzjs';
const require = createRequire(import.meta.url);
const { Face, Font } = require('../src/hb.js');
const cases = [
  ['C:/Windows/Fonts/tahoma.ttf', 'سلام عليكم، لا إله إلا الله'],
  ['C:/Windows/Fonts/arabtype.ttf', 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ'],
  ['C:/Windows/Fonts/majalla.ttf', 'الخطّ العربيّ جميـــل'],
];
let fail = 0;
for (const [file, text] of cases) {
  if (!fs.existsSync(file)) { console.log('skip', file); continue; }
  const bytes = new Uint8Array(fs.readFileSync(file));
  const t0 = Date.now();
  const f = new Font(new Face(bytes));
  const mine = f.shape(text);
  const t1 = Date.now();
  const font = new hb.Font(new hb.Face(new hb.Blob(bytes.buffer)));
  const buf = new hb.Buffer(); buf.addText(text); buf.guessSegmentProperties(); hb.shape(font, buf);
  const infos = buf.getGlyphInfos(), pos = buf.getGlyphPositions();
  const same = infos.length === mine.length && infos.every((r, i) => r.codepoint === mine[i].g && r.cluster === mine[i].cl &&
    pos[i].xAdvance === mine[i].ax && pos[i].xOffset === mine[i].dx && pos[i].yOffset === mine[i].dy);
  if (!same) fail++;
  const o = f.outline(mine[0].g);
  console.log(file.split('/').pop(), same ? 'MATCH' : 'DIFF', 'glyphs', mine.length, 'shape ms', t1 - t0, 'contours', o.length,
    'refpath', font.glyphToPath(mine[0].g).slice(0, 40), 'mine', JSON.stringify(o[0]?.[0]));
}
process.exit(fail ? 1 : 0);
