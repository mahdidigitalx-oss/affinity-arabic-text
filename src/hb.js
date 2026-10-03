'use strict';
// Thin wrapper over the JavaScript build of HarfBuzz (build/hb-asm.cjs).
// Only what the tool needs: load a face, shape a run, read metrics, draw outlines.

const createAsm = require('../build/hb-asm.cjs');

const HB_DIRECTION_LTR = 4;
const HB_DIRECTION_RTL = 5;
const HB_MEMORY_MODE_READONLY = 1;
const GLYPH_CLASS_MARK = 3;

let X = null;          // HarfBuzz exports
let table = null;      // indirect function table (a plain JS array under wasm2js)

function u8() { return new Uint8Array(X.memory.buffer); }
function u16() { return new Uint16Array(X.memory.buffer); }
function i32() { return new Int32Array(X.memory.buffer); }
function u32() { return new Uint32Array(X.memory.buffer); }
function f32() { return new Float32Array(X.memory.buffer); }

function init() {
    if (X)
        return;
    const env = {
        _abort_js() { throw new Error('HarfBuzz aborted'); },
        _emscripten_runtime_keepalive_clear() {},
        _setitimer_js() { return 0; },
        emscripten_resize_heap(requested) {
            const have = X.memory.buffer.byteLength;
            let want = have;
            while (want < requested)
                want *= 2;
            return X.memory.grow((want - have) / 65536) === -1 ? 0 : 1;
        }
    };
    const wasi = { proc_exit(code) { throw new Error('HarfBuzz exited with ' + code); } };
    X = createAsm(env, wasi);
    table = X.__indirect_function_table;
    X.__wasm_call_ctors();
}

function addFunction(fn) {
    table.push(fn);
    return table.length - 1;
}

function tag(s) {
    return ((s.charCodeAt(0) & 255) << 24 | (s.charCodeAt(1) & 255) << 16 | (s.charCodeAt(2) & 255) << 8 | (s.charCodeAt(3) & 255)) >>> 0;
}

function asciiPtr(s) {
    const p = X.malloc(s.length + 1);
    const h = u8();
    for (let i = 0; i < s.length; ++i)
        h[p + i] = s.charCodeAt(i);
    h[p + s.length] = 0;
    return p;
}

// One loaded font file face. Bytes are copied into the HarfBuzz heap once and kept.
class Face {
    constructor(bytes, index = 0) {
        init();
        const p = X.malloc(bytes.length);
        u8().set(bytes, p);
        this.blob = X.hb_blob_create(p, bytes.length, HB_MEMORY_MODE_READONLY, 0, 0);
        this.ptr = X.hb_face_create(this.blob, index);
        this.upem = X.hb_face_get_upem(this.ptr);
    }

    hasTable(name) {
        const b = X.hb_face_reference_table(this.ptr, tag(name));
        const len = X.hb_blob_get_length(b);
        X.hb_blob_destroy(b);
        return len > 0;
    }

    glyphClass(gid) {
        return X.hb_ot_layout_get_glyph_class(this.ptr, gid);
    }

    isMark(gid) {
        return this.glyphClass(gid) === GLYPH_CLASS_MARK;
    }
}

// A face at its design scale (1 unit = 1 font unit), optionally with variation axes.
class Font {
    constructor(face, variations) {
        this.face = face;
        this.ptr = X.hb_font_create(face.ptr);
        X.hb_font_set_scale(this.ptr, face.upem, face.upem);
        if (variations && variations.length) {
            const p = X.malloc(8 * variations.length);
            variations.forEach((v, i) => {
                u32()[(p >> 2) + i * 2] = tag(v.tag);
                f32()[(p >> 2) + i * 2 + 1] = v.value;
            });
            X.hb_font_set_variations(this.ptr, p, variations.length);
            X.free(p);
        }
        this.outlines = new Map();
    }

    // Ascender / descender / line gap in font units (descender is negative).
    metrics() {
        const p = X.malloc(4);
        const get = t => (X.hb_ot_metrics_get_position_with_fallback(this.ptr, tag(t), p), i32()[p >> 2]);
        const m = { ascender: get('hasc'), descender: get('hdsc'), lineGap: get('hlgp') };
        X.free(p);
        return m;
    }

    hasGlyph(codepoint) {
        const p = X.malloc(4);
        const ok = X.hb_font_get_nominal_glyph(this.ptr, codepoint, p);
        X.free(p);
        return !!ok;
    }

    // Shape a UTF-16 string (a single-direction run). Returns glyphs in visual order.
    // cluster = index into `text` of the first code unit the glyph came from.
    shape(text, { rtl = true, script = 'Arab', language = 'ar', features = [] } = {}) {
        const buf = X.hb_buffer_create();
        const tp = X.malloc(text.length * 2 + 2);
        const w = u16();
        for (let i = 0; i < text.length; ++i)
            w[(tp >> 1) + i] = text.charCodeAt(i);
        X.hb_buffer_add_utf16(buf, tp, text.length, 0, text.length);
        X.free(tp);
        X.hb_buffer_set_direction(buf, rtl ? HB_DIRECTION_RTL : HB_DIRECTION_LTR);
        if (script) {
            const sp = asciiPtr(script);
            X.hb_buffer_set_script(buf, X.hb_script_from_string(sp, -1));
            X.free(sp);
        }
        if (language) {
            const lp = asciiPtr(language);
            X.hb_buffer_set_language(buf, X.hb_language_from_string(lp, -1));
            X.free(lp);
        }
        // Fills in whatever was left unset (script for non-Arabic runs).
        X.hb_buffer_guess_segment_properties(buf);

        let fp = 0;
        if (features.length) {
            fp = X.malloc(16 * features.length);
            features.forEach((f, i) => {
                const sp2 = asciiPtr(f);
                X.hb_feature_from_string(sp2, -1, fp + 16 * i);
                X.free(sp2);
            });
        }
        X.hb_shape(this.ptr, buf, fp, features.length);
        if (fp)
            X.free(fp);

        const lenp = X.malloc(4);
        const infos = X.hb_buffer_get_glyph_infos(buf, lenp);
        const n = u32()[lenp >> 2];
        const pos = X.hb_buffer_get_glyph_positions(buf, lenp);
        X.free(lenp);
        const U = u32(), I = i32();
        const out = new Array(n);
        for (let i = 0; i < n; ++i) {
            const ib = (infos >> 2) + i * 5, pb = (pos >> 2) + i * 5;
            out[i] = {
                g: U[ib], cl: U[ib + 2],
                ax: I[pb], ay: I[pb + 1], dx: I[pb + 2], dy: I[pb + 3]
            };
        }
        X.hb_buffer_destroy(buf);
        return out;
    }

    // Glyph outline as a list of contours in font units, y up.
    // Each contour: [{t:'M'|'L'|'Q'|'C', p:[x,y,...]}]
    outline(gid) {
        let o = this.outlines.get(gid);
        if (o)
            return o;
        o = [];
        drawSink.target = o;
        X.hb_font_draw_glyph(this.ptr, gid, drawFuncs(), 0);
        drawSink.target = null;
        this.outlines.set(gid, o);
        return o;
    }
}

const drawSink = { target: null, cur: null };
let dfuncs = 0;
function drawFuncs() {
    if (dfuncs)
        return dfuncs;
    dfuncs = X.hb_draw_funcs_create();
    const push = (t, p) => drawSink.cur.push({ t, p });
    X.hb_draw_funcs_set_move_to_func(dfuncs, addFunction((f, d, s, x, y) => {
        drawSink.cur = [{ t: 'M', p: [x, y] }];
        drawSink.target.push(drawSink.cur);
    }), 0, 0);
    X.hb_draw_funcs_set_line_to_func(dfuncs, addFunction((f, d, s, x, y) => push('L', [x, y])), 0, 0);
    X.hb_draw_funcs_set_quadratic_to_func(dfuncs, addFunction((f, d, s, cx, cy, x, y) => push('Q', [cx, cy, x, y])), 0, 0);
    X.hb_draw_funcs_set_cubic_to_func(dfuncs, addFunction((f, d, s, c1x, c1y, c2x, c2y, x, y) => push('C', [c1x, c1y, c2x, c2y, x, y])), 0, 0);
    X.hb_draw_funcs_set_close_path_func(dfuncs, addFunction(() => { drawSink.cur = null; }), 0, 0);
    return dfuncs;
}

module.exports = { Face, Font, init };
