'use strict';
// Arabic-capable fonts, as mirrored to the Desktop by tools/sync-fonts.ps1
// (Affinity only lets scripts read files under the Desktop).

const { File } = require('/fs.js');
const { Application } = require('/application.js');
const { Face, Font } = require('./hb.js');

const FOLDER = 'خطوط النص العربي';
const PREFERRED_DEFAULTS = ['Sakkal Majalla', 'Arabic Typesetting', 'Segoe UI', 'Tahoma', 'Arial'];

function rootPath() {
    return Application.userDesktopPath.replace(/\\/g, '/') + '/' + FOLDER;
}

function decodeUtf8(bytes) {
    let out = '', i = 0;
    if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF)
        i = 3;
    while (i < bytes.length) {
        const b = bytes[i++];
        let cp;
        if (b < 0x80) cp = b;
        else if (b < 0xE0) cp = ((b & 0x1F) << 6) | (bytes[i++] & 0x3F);
        else if (b < 0xF0) cp = ((b & 0x0F) << 12) | ((bytes[i++] & 0x3F) << 6) | (bytes[i++] & 0x3F);
        else cp = ((b & 0x07) << 18) | ((bytes[i++] & 0x3F) << 12) | ((bytes[i++] & 0x3F) << 6) | (bytes[i++] & 0x3F);
        out += String.fromCodePoint(cp);
    }
    return out;
}

function encodeUtf8(str) {
    const out = [];
    for (const ch of str) {
        const cp = ch.codePointAt(0);
        if (cp < 0x80) out.push(cp);
        else if (cp < 0x800) out.push(0xC0 | (cp >> 6), 0x80 | (cp & 0x3F));
        else if (cp < 0x10000) out.push(0xE0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3F), 0x80 | (cp & 0x3F));
        else out.push(0xF0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3F), 0x80 | ((cp >> 6) & 0x3F), 0x80 | (cp & 0x3F));
    }
    return new Uint8Array(out);
}

function readBytes(path) {
    return new Uint8Array(File.readAll(path).arrayBuffer);
}

function readText(path) {
    return decodeUtf8(readBytes(path));
}

function writeText(path, text) {
    const bytes = encodeUtf8(text);
    const f = File.create(path, 'wb');
    const { Buffer } = require('/buffer.js');
    const buf = Buffer.create(bytes.length);
    new Uint8Array(buf.arrayBuffer).set(bytes);
    f.write(buf, bytes.length);
    f.close();
}

// Returns { families: [{name, faces:[entry]}] }, or { error, path } when the index can't be read.
function readIndex() {
    let entries;
    const path = rootPath() + '/fonts.json';
    try {
        entries = JSON.parse(readText(path));
    } catch (e) {
        return { error: String(e && e.message || e), path, families: [] };
    }
    if (!Array.isArray(entries))
        entries = [entries];
    const byName = new Map();
    for (const e of entries) {
        const name = e.typographicFamily || e.family;
        if (!byName.has(name))
            byName.set(name, []);
        byName.get(name).push(e);
    }
    const families = [...byName.entries()]
        .map(([name, faces]) => ({ name, faces: faces.sort((a, b) => a.weight - b.weight || a.italic - b.italic) }))
        .sort((a, b) => (a.name.toLowerCase() < b.name.toLowerCase() ? -1 : a.name.toLowerCase() > b.name.toLowerCase() ? 1 : 0));  // localeCompare throws inside Affinity (ICU)
    return { families };
}

function defaultFamily(index) {
    for (const n of PREFERRED_DEFAULTS) {
        const f = index.families.find(x => x.name === n);
        if (f)
            return f.name;
    }
    return index.families[0].name;
}

// Closest face of a family to the requested weight / italic.
function pickFace(family, weight, italic) {
    let best = null, bestScore = Infinity;
    for (const f of family.faces) {
        const score = Math.abs(f.weight - weight) + (f.italic === italic ? 0 : 1000);
        if (score < bestScore) {
            best = f;
            bestScore = score;
        }
    }
    return best;
}

const loaded = new Map();
function loadFont(entry) {
    const key = entry.file + '#' + entry.index;
    let font = loaded.get(key);
    if (!font) {
        font = new Font(new Face(readBytes(rootPath() + '/fonts/' + entry.file), entry.index));
        loaded.set(key, font);
    }
    return font;
}

// Remembered dialog settings between runs (best effort).
function loadSettings() {
    try {
        return JSON.parse(readText(rootPath() + '/settings.json'));
    } catch (e) {
        return null;
    }
}

function saveSettings(settings) {
    try {
        writeText(rootPath() + '/settings.json', JSON.stringify(settings));
    } catch (e) {
        // Not being able to remember settings is harmless.
    }
}

module.exports = { FOLDER, rootPath, readIndex, defaultFamily, pickFace, loadFont, loadSettings, saveSettings, writeText };
