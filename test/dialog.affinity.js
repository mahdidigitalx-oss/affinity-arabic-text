'use strict';
// Builds the dialog without showing it and reads every control back.
const { Document } = require('/document.js');
const fonts = require('../src/fonts.js');
const ui = require('../src/ui.js');
const doc = Document.current;
const index = fonts.readIndex();
const s = { ...ui.DEFAULTS, text: 'تجربة', family: fonts.defaultFamily(index), align: 'justify', mode: 'word' };
const dlg = ui.build(s, index.families, doc.units, false);
const back = ui.read(dlg, index.families);
const diffs = Object.keys(s).filter(k => JSON.stringify(s[k]) !== JSON.stringify(back[k]));
console.log('dialog built; mismatches:', diffs.length ? diffs.map(k => k + '=' + JSON.stringify(back[k]) + ' expected ' + JSON.stringify(s[k])).join('; ') : 'none');
