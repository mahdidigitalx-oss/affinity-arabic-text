'use strict';
// Text clean-up before shaping: line endings, digit style, optional removal of harakat.

// Harakat, Quranic annotation marks and other Arabic combining marks.
const HARAKAT = /[ؐ-ًؚ-ٰٟۖ-ۜ۟-۪ۤۧۨ-ۭ࣓-ࣣ࣡-ࣿ]/g;

const ARABIC_INDIC_ZERO = 0x0660;
const EXT_ARABIC_INDIC_ZERO = 0x06F0;

function toArabicDigits(s) {
    return s.replace(/[0-9]/g, d => String.fromCharCode(ARABIC_INDIC_ZERO + (d.charCodeAt(0) - 48)));
}

function toLatinDigits(s) {
    return s.replace(/[٠-٩۰-۹]/g, d => {
        const c = d.charCodeAt(0);
        return String.fromCharCode(48 + c - (c >= EXT_ARABIC_INDIC_ZERO ? EXT_ARABIC_INDIC_ZERO : ARABIC_INDIC_ZERO));
    });
}

// digits: 'asTyped' | 'arabic' | 'latin'
function prepare(text, { digits = 'asTyped', harakat = true } = {}) {
    let s = text.replace(/\r\n?/g, '\n');
    if (digits === 'arabic')
        s = toArabicDigits(s);
    else if (digits === 'latin')
        s = toLatinDigits(s);
    if (!harakat)
        s = s.replace(HARAKAT, '');
    return s;
}

function isMarkChar(c) {
    HARAKAT.lastIndex = 0;
    return HARAKAT.test(c);
}

module.exports = { prepare, toArabicDigits, toLatinDigits, isMarkChar };
