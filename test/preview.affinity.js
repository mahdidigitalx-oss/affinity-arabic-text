'use strict';
// Runs the dialog's preview path without showing the dialog: build the window, fill in text,
// fire the same handler a keystroke would, and report what happened.
const { Document, DocumentPreset } = require('/document.js');
const { Selection } = require('/selections.js');
const fonts = require('../src/fonts.js');
const ui = require('../src/ui.js');
const { editContext, buildCommand } = require('../src/engine.js');

const doc = Document.createFromPreset(DocumentPreset.all.filter(p => p.name.includes('A4'))[0], false);
const index = fonts.readIndex();
const ctx = editContext(doc);
const dlg = ui.build({ ...ui.DEFAULTS, family: fonts.defaultFamily(index) }, index.families, doc.units, false);
dlg.text.text = 'مرحبا بكم';
const steps = [];
try { dlg.alignTextBox(); steps.push('alignTextBox ok'); } catch (e) { steps.push('alignTextBox THREW: ' + e.message); }
let cmd;
try { cmd = buildCommand(doc, index, ui.read(dlg, index.families), ctx, dlg.colourTouched).cmd; steps.push('buildCommand ok'); } catch (e) { steps.push('buildCommand THREW: ' + e.message); }
try { doc.executeCommand(cmd, true); steps.push('preview execute ok, layers=' + [...doc.layers].length); } catch (e) { steps.push('preview execute THREW: ' + e.message); }
try { doc.clearPreviews(); steps.push('clearPreviews ok, layers=' + [...doc.layers].length); } catch (e) { steps.push('clear THREW: ' + e.message); }
try { doc.executeCommand(cmd, false); steps.push('final execute ok, layers=' + [...doc.layers].length); } catch (e) { steps.push('final THREW: ' + e.message); }
console.log(steps.join('\n'));
doc.close();   // scratch document: discard it
