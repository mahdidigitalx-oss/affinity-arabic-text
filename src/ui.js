'use strict';
// The tool's window, built from Affinity's own dialog controls.

const { Dialog } = require('/dialog.js');
const { UnitType } = require('/units.js');
const { RGBA8 } = require('/colours.js');
const { HorizontalAlignment } = require('affinity:common');

const ALIGN = ['right', 'center', 'left', 'justify'];
const ALIGN_LABELS = ['يمين', 'وسط', 'يسار', 'ضبط'];
const DIRECTION = ['rtl', 'auto', 'ltr'];
const DIRECTION_LABELS = ['من اليمين إلى اليسار', 'تلقائي حسب النص', 'من اليسار إلى اليمين'];
const DIGITS = ['asTyped', 'arabic', 'latin'];
const DIGITS_LABELS = ['كما كُتبت', 'عربية ١٢٣', 'إنجليزية 123'];
const MODE = ['single', 'line', 'word', 'marks'];
const MODE_LABELS = ['شكل واحد', 'شكل لكل سطر', 'شكل لكل كلمة', 'الحركات في شكل منفصل'];
const STRETCH_SCOPE = ['all', 'best', 'last'];
const STRETCH_SCOPE_LABELS = ['كل الكلمات', 'كلمة واحدة في كل سطر (الأنسب)', 'آخر كلمة في كل سطر'];
const WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900];
const WEIGHT_LABELS = ['رفيع جداً', 'رفيع', 'خفيف', 'عادي', 'متوسط', 'شبه عريض', 'عريض', 'عريض جداً', 'أسود'];

const DEFAULTS = {
    text: '',
    family: null,
    weight: 400,
    italic: false,
    sizePt: 36,
    colour: { r: 0, g: 0, b: 0, alpha: 255 },
    align: 'right',
    lineSpacing: 100,
    widthPx: 0,
    direction: 'rtl',
    kashida: true,
    stretch: 0,
    stretchScope: 'all',
    harakat: true,
    digits: 'asTyped',
    mode: 'single'
};

// Objects made by the first version stored harakat separation as a flag.
function normalise(s) {
    const out = { ...DEFAULTS, ...s };
    if (s.separateMarks && (!s.mode || s.mode === 'single'))
        out.mode = 'marks';
    delete out.separateMarks;
    return out;
}

function idx(list, value, fallback = 0) {
    const i = list.indexOf(value);
    return i < 0 ? fallback : i;
}

function nearestWeightIndex(w) {
    let best = 0;
    WEIGHTS.forEach((v, i) => { if (Math.abs(v - w) < Math.abs(WEIGHTS[best] - w)) best = i; });
    return best;
}

// s: settings to start from; families: font index; units: document display units; editing: bool
function build(s, families, units, editing, version = '') {
    const dlg = Dialog.create((editing ? 'تعديل النص العربي' : 'النص العربي') + (version ? '  ' + version : ''));
    dlg.setIsResizable(true);
    dlg.initialWidth = 820;
    const names = families.map(f => f.name);

    // Two columns of similar height so the window fits a 768 px tall screen.
    const left = dlg.addColumn();
    const textGroup = left.addGroup('النص');
    // Text is set after switching to multi-line: switching clears what the box displays.
    dlg.text = textGroup.addTextBox('', '').setIsMultiLine(true).setRowSpan(5).setIsFullWidth(true);
    dlg.text.text = s.text;
    dlg.status = textGroup.addStaticText('', '').setIsFullWidth(true);

    const right = dlg.addColumn();
    const fontGroup = right.addGroup('الخط');
    dlg.family = fontGroup.addComboBox('الخط', names, Math.max(0, names.indexOf(s.family)));
    dlg.weight = fontGroup.addComboBox('السماكة', WEIGHT_LABELS, nearestWeightIndex(s.weight));
    dlg.italic = fontGroup.addSwitch('مائل', s.italic);
    dlg.size = fontGroup.addUnitValueEditor('الحجم', UnitType.Point, UnitType.Point, s.sizePt, 1, 2000).setPrecision(1);
    dlg.colour = fontGroup.addColourPicker('اللون', RGBA8(s.colour.r, s.colour.g, s.colour.b, s.colour.alpha));

    const paraGroup = right.addGroup('الفقرة');
    dlg.align = paraGroup.addButtonSet('المحاذاة', ALIGN_LABELS, idx(ALIGN, s.align));
    dlg.lineSpacing = paraGroup.addUnitValueEditor('تباعد الأسطر', UnitType.Percentage, UnitType.Percentage, s.lineSpacing, 50, 400).setPrecision(0);
    dlg.width = paraGroup.addUnitValueEditor('عرض النص (٠ = بلا التفاف)', UnitType.Pixel, units, s.widthPx, 0).setNoMaxValue().setPrecision(0);
    dlg.direction = paraGroup.addComboBox('الاتجاه', DIRECTION_LABELS, idx(DIRECTION, s.direction));

    // Stretching words with tatweel, e.g. جميل -> جميـــل.
    const stretchGroup = right.addGroup('تمديد الكلمات (كشيدة)');
    dlg.stretch = stretchGroup.addUnitValueEditor('مقدار التمديد', UnitType.Number, UnitType.Number, s.stretch, 0, 30).setPrecision(0);
    dlg.stretch.showPopupSlider = true;
    dlg.stretchScope = stretchGroup.addComboBox('الكلمات الممدودة', STRETCH_SCOPE_LABELS, idx(STRETCH_SCOPE, s.stretchScope));

    const optGroup = left.addGroup('خيارات');
    dlg.kashida = optGroup.addSwitch('الكشيدة عند محاذاة «ضبط»', s.kashida);
    dlg.harakat = optGroup.addSwitch('إظهار الحركات', s.harakat);
    dlg.digits = optGroup.addComboBox('الأرقام', DIGITS_LABELS, idx(DIGITS, s.digits));
    dlg.mode = optGroup.addComboBox('طريقة عرض النص', MODE_LABELS, idx(MODE, s.mode));

    // The text box follows the chosen alignment (Affinity's dialog can't show the font itself).
    // Only touched when alignment or direction change: setting it raises a change event of its own.
    let boxAlign = null;
    dlg.alignTextBox = () => {
        const a = ALIGN[dlg.align.selectedIndex];
        const rtl = DIRECTION[dlg.direction.selectedIndex] !== 'ltr';
        const want = a === 'center' ? HorizontalAlignment.Centre
            : a === 'left' || (a === 'justify' && !rtl) ? HorizontalAlignment.Left
            : HorizontalAlignment.Right;
        if (boxAlign !== null && boxAlign.value === want.value)
            return false;
        boxAlign = want;
        dlg.text.textHorizontalAlignment = want;
        return true;
    };
    dlg.alignTextBox();

    // Edits keep the object's own fill unless the colour is changed here.
    dlg.colourTouched = !editing;
    dlg.colour.onValueChangedHandler = () => { dlg.colourTouched = true; };
    return dlg;
}

function read(dlg, families) {
    const c = dlg.colour.value;
    const rgba = c ? c.rgba8 : { r: 0, g: 0, b: 0, alpha: 255 };
    return {
        text: dlg.text.text,
        family: families[dlg.family.selectedIndex]?.name,
        weight: WEIGHTS[dlg.weight.selectedIndex],
        italic: dlg.italic.value,
        sizePt: dlg.size.value,
        colour: { r: rgba.r, g: rgba.g, b: rgba.b, alpha: rgba.alpha },
        align: ALIGN[dlg.align.selectedIndex],
        lineSpacing: dlg.lineSpacing.value,
        widthPx: dlg.width.value,
        direction: DIRECTION[dlg.direction.selectedIndex],
        kashida: dlg.kashida.value,
        stretch: Math.round(dlg.stretch.value),
        stretchScope: STRETCH_SCOPE[dlg.stretchScope.selectedIndex],
        harakat: dlg.harakat.value,
        digits: DIGITS[dlg.digits.selectedIndex],
        mode: MODE[dlg.mode.selectedIndex]
    };
}

module.exports = { build, read, normalise, DEFAULTS };
