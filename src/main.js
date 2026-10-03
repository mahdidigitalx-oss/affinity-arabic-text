'use strict';
// Arabic Text for Affinity — entry point.
// Select nothing (or any non-Arabic object) to create; select an Arabic text object to edit it.

const { Document } = require('/document.js');
const { DialogResult } = require('/dialog.js');
const { setInterval } = require('/timers.js');

const fonts = require('./fonts.js');
const ui = require('./ui.js');
const { editContext, buildCommand, selectResult } = require('./engine.js');

const TITLE = 'النص العربي';
const VERSION = '1.3';

function isOk(result) {
    return (result?.value ?? result) == DialogResult.Ok.value;
}

function main() {
    const doc = Document.current;
    if (!doc) {
        alert('افتح مستنداً أولاً، ثم شغّل الأداة.', TITLE);
        return;
    }
    const index = fonts.readIndex();
    if (index.error || !index.families.length) {
        const denied = /PERMISSION/i.test(index.error || '');
        alert('تعذّرت قراءة مجلد الخطوط العربية على سطح المكتب.\n\n' +
            'المسار: ' + index.path + '\n' +
            'السبب: ' + (index.error || 'لا توجد خطوط في الفهرس') + '\n\n' +
            (denied
                ? 'Affinity لم يعد يسمح للأداة بقراءة هذا المجلد. احفظ عملك، ثم أغلق Affinity وافتحه من جديد؛ ' +
                  'سيعيد مراقب الخطوط الإذن تلقائياً. أو أضف المجلد بنفسك من Settings > Scripting.'
                : 'إن كان المجلد غير موجود فشغّل sync-fonts.cmd من مجلد الأداة.'), TITLE);
        return;
    }

    const ctx = editContext(doc);
    let start = ui.normalise({ ...(fonts.loadSettings() || {}), text: '' });
    if (ctx.target)
        start = ui.normalise(ctx.stored.settings);
    if (!index.families.some(f => f.name === start.family)) {
        if (ctx.target)
            alert('الخط «' + start.family + '» غير موجود على هذا الجهاز.\nاختر خطاً آخر من القائمة؛ لن يتغير النص الحالي ما لم تضغط «موافق».', TITLE);
        start.family = fonts.defaultFamily(index);
    }

    const dlg = ui.build(start, index.families, doc.units, !!ctx.target, VERSION);
    const originalSelection = doc.selection;
    const current = (preview = false) => buildCommand(doc, index, ui.read(dlg, index.families), ctx, dlg.colourTouched, preview);

    let busy = false;
    let shownText = null;
    const preview = () => {
        if (busy)       // changes made while previewing raise events too; ignore those
            return;
        busy = true;
        try {
            dlg.alignTextBox();
        } catch (e) {
            // cosmetic only
        }
        try {
            shownText = dlg.text.text;
            const { cmd, note } = current(true);
            dlg.status.text = note;
            if (cmd)
                doc.executeCommand(cmd, true);
            else
                doc.clearPreviews();
        } catch (e) {
            try {
                dlg.status.text = 'خطأ في المعاينة: ' + e.message;
                doc.clearPreviews();
            } catch (e2) {
                // never let an exception escape into the dialog's event loop
            }
        } finally {
            busy = false;
        }
    };
    dlg.onControlValueChangedHandler = preview;
    preview();

    // The text box may report its text only when it loses focus; look at it a few times a
    // second as well so the preview follows the typing.
    let poll = null;
    try {
        poll = setInterval(250, () => {
            try {
                if (dlg.text.text !== shownText)
                    preview();
            } catch (e) {
                // dialog already closed
            }
        });
    } catch (e) {
        poll = null;
    }
    const stopPolling = () => {
        try {
            if (poll)
                poll.cancel();
        } catch (e) {
            // already stopped
        }
        poll = null;
    };

    // Closing with Esc makes runModal throw INVALID_OP instead of returning Cancel.
    const run = () => {
        try {
            return dlg.runModal();
        } catch (e) {
            return null;
        }
    };
    try {
        while (isOk(run())) {
            let result;
            try {
                result = current();
            } catch (e) {
                alert('تعذّر رسم النص:\n' + e.message, TITLE);
                continue;
            }
            if (!result.cmd) {
                alert(result.note, TITLE);
                continue;
            }
            stopPolling();
            doc.clearPreviews();
            doc.executeCommand(result.cmd);
            selectResult(doc, result.cmd);
            const { text, ...settings } = ui.read(dlg, index.families);
            fonts.saveSettings(settings);
            return;
        }
        doc.clearPreviews();
        doc.selection = originalSelection;
    } finally {
        stopPolling();
    }
}

module.exports = { main, VERSION };
