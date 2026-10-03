'use strict';
// Where a tatweel (kashida, U+0640) may be inserted inside a word, ranked the way
// Arabic typesetters prefer. Lower priority number = better place to stretch.

const { isMarkChar } = require('./text.js');

const TATWEEL = 'ـ';

// Letters that connect only to the previous letter (never to the next one).
const RIGHT_JOINING = new Set([
    0x0622, 0x0623, 0x0624, 0x0625, 0x0627, 0x0629, 0x062F, 0x0630, 0x0631, 0x0632, 0x0648,
    0x0671, 0x0672, 0x0673, 0x0675, 0x0676, 0x0677,
    0x0688, 0x0689, 0x068A, 0x068B, 0x068C, 0x068D, 0x068E, 0x068F, 0x0690,
    0x0691, 0x0692, 0x0693, 0x0694, 0x0695, 0x0696, 0x0697, 0x0698, 0x0699,
    0x06C0, 0x06C3, 0x06C4, 0x06C5, 0x06C6, 0x06C7, 0x06C8, 0x06C9, 0x06CA, 0x06CB, 0x06CD, 0x06CF,
    0x06D2, 0x06D3, 0x06D5, 0x06EE, 0x06EF
]);

function isArabicLetter(c) {
    return (c >= 0x0620 && c <= 0x064A) || (c >= 0x066E && c <= 0x06D5) || (c >= 0x06EE && c <= 0x06FF) || (c >= 0x0750 && c <= 0x077F);
}

function joinsToNext(c) {
    return isArabicLetter(c) && !RIGHT_JOINING.has(c) && c !== 0x0621 && c !== 0x0674 || c === 0x0640;
}

function joinsToPrevious(c) {
    return (isArabicLetter(c) && c !== 0x0621 && c !== 0x0674) || c === 0x0640;
}

const SEEN_SAD = new Set([0x0633, 0x0634, 0x0635, 0x0636]);
const FINAL_TEH_HEH_DAL = new Set([0x0629, 0x0647, 0x062F, 0x0630, 0x06D5]);
const FINAL_ALEF_TAH_LAM_KAF = new Set([0x0627, 0x0623, 0x0625, 0x0622, 0x0671, 0x0637, 0x0638, 0x0644, 0x0643, 0x06A9, 0x06AF]);
const REH_WAW = new Set([0x0631, 0x0632, 0x0698, 0x0648, 0x0624]);
const FINAL_AIN_QAF_FEH = new Set([0x0639, 0x063A, 0x0642, 0x0641, 0x06A4]);
const FINAL_YEH = new Set([0x064A, 0x0649, 0x06CC, 0x0626]);
const ALEFS = new Set([0x0627, 0x0623, 0x0625, 0x0622, 0x0671]);

const LAM = 0x0644, HEH = 0x0647;

// Returns [{at, priority}] for one word; `at` is the string index to insert the tatweel before.
function opportunities(word) {
    const letters = [];
    for (let i = 0; i < word.length; ++i)
        if (!isMarkChar(word[i]))
            letters.push(i);
    const code = k => word.charCodeAt(letters[k]);
    // The name of God (الله، لله، بالله، اللهم...) is one ligature: never stretched inside.
    const allah = new Set();
    for (let k = 0; k + 2 < letters.length; ++k)
        if (code(k) === LAM && code(k + 1) === LAM && code(k + 2) === HEH)
            allah.add(k).add(k + 1).add(k + 2);
    // The lam of the definite article (ال، وال، بال...) is the last place to stretch.
    const p = letters.length > 3 && [0x0648, 0x0641, 0x0628, 0x0643].includes(code(0)) ? 1 : 0;
    const articleLam = letters.length > p + 2 && ALEFS.has(code(p)) && code(p + 1) === LAM ? p + 1 : -1;
    const out = [];
    for (let k = 0; k + 1 < letters.length; ++k) {
        const a = code(k), b = code(k + 1);
        if (!joinsToNext(a) || !joinsToPrevious(b) || a === 0x0640 || b === 0x0640 || allah.has(k))
            continue;
        if (a === 0x0644 && ALEFS.has(b))      // never split the lam-alef ligature
            continue;
        const last = k + 1 === letters.length - 1;
        let priority = 7;
        if (SEEN_SAD.has(a)) priority = 1;
        else if (last && FINAL_TEH_HEH_DAL.has(b)) priority = 2;
        else if (last && FINAL_ALEF_TAH_LAM_KAF.has(b)) priority = 3;
        else if (REH_WAW.has(b)) priority = 4;
        else if (last && FINAL_AIN_QAF_FEH.has(b)) priority = 5;
        else if (last && FINAL_YEH.has(b)) priority = 6;
        if (articleLam >= 0 && (k === articleLam || k === articleLam - 2)) priority = 8;
        // Insert after a's trailing marks so harakat stay on their letter.
        out.push({ at: letters[k + 1], priority });
    }
    return out;
}

// Spreads `count` tatweels over the words of a line. `words` = [{start, text}] in logical
// order; returns the line text with tatweels inserted.
function insert(lineText, words, count) {
    if (count <= 0)
        return lineText;
    const slots = [];
    for (const w of words) {
        const ops = opportunities(w.text);
        if (!ops.length)
            continue;
        const best = ops.reduce((a, b) => (b.priority < a.priority ? b : a));
        slots.push({ at: w.start + best.at, priority: best.priority, n: 0 });
    }
    if (!slots.length)
        return lineText;
    slots.sort((a, b) => a.priority - b.priority);
    for (let i = 0; i < count; ++i)
        slots[i % slots.length].n++;
    slots.sort((a, b) => b.at - a.at);
    let s = lineText;
    for (const slot of slots)
        s = s.slice(0, slot.at) + TATWEEL.repeat(slot.n) + s.slice(slot.at);
    return s;
}

// Lengthens every Arabic word by `count` tatweels at its best stretching point
// (the "جميـــل" effect). Words with nowhere to stretch are left as they are.
function stretchWords(text, count) {
    if (count <= 0)
        return text;
    return text.replace(/[^\s]+/g, word => {
        const best = bestOpportunity(word);
        return best ? word.slice(0, best.at) + TATWEEL.repeat(count) + word.slice(best.at) : word;
    });
}

function bestOpportunity(word) {
    const ops = opportunities(word);
    return ops.length ? ops.reduce((a, b) => (b.priority < a.priority ? b : a)) : null;
}

// Lengthens one word of a line, the way a calligrapher stretches a single word per line.
// scope: 'best' = the word that stretches most naturally (the later one on a tie),
//        'last' = the last word that can be stretched. `words` = [{start, text}], logical order.
function stretchLine(lineText, words, count, scope) {
    if (count <= 0)
        return lineText;
    let pick = null;
    for (const w of words) {
        const best = bestOpportunity(w.text);
        if (best && (!pick || scope === 'last' || best.priority <= pick.priority))
            pick = { at: w.start + best.at, priority: best.priority };
    }
    return pick ? lineText.slice(0, pick.at) + TATWEEL.repeat(count) + lineText.slice(pick.at) : lineText;
}

module.exports = { opportunities, insert, stretchWords, stretchLine, TATWEEL };
