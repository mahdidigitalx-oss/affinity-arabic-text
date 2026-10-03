// Minimal client for Affinity's built-in MCP server (legacy SSE transport).
// Usage:
//   node dev/mcp.mjs tools                       list tools
//   node dev/mcp.mjs call <tool> '<json args>'   call a tool
//   node dev/mcp.mjs run <file.js>               execute_script with file contents
import { readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';

const HOST = '::1', PORT = 6767;

function openSession() {
  return new Promise((resolve, reject) => {
    const pending = new Map();
    let buf = '';
    const req = http.get({ host: HOST, port: PORT, path: '/sse', headers: { Accept: 'text/event-stream' } }, res => {
      if (res.statusCode !== 200) return reject(new Error('SSE status ' + res.statusCode));
      res.setEncoding('utf8');
      res.on('data', chunk => {
        buf += chunk.replace(/\r\n/g, '\n');
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, i); buf = buf.slice(i + 2);
          let event = 'message', data = '';
          for (const line of block.split(/\r?\n/)) {
            if (line.startsWith('event:')) event = line.slice(6).trim();
            else if (line.startsWith('data:')) data += line.slice(5).trim();
          }
          if (event === 'endpoint') resolve({ endpoint: data, pending, close: () => req.destroy() });
          else if (data) {
            try {
              const msg = JSON.parse(data);
              const p = pending.get(msg.id);
              if (p) { pending.delete(msg.id); p(msg); }
            } catch { /* ignore keepalives */ }
          }
        }
      });
    });
    req.on('error', reject);
  });
}

let nextId = 1;
function post(session, body) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(body));
    const req = http.request({ host: HOST, port: PORT, path: session.endpoint, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': data.length } }, res => {
      let out = ''; res.on('data', c => out += c); res.on('end', () => resolve(out));
    });
    req.on('error', reject); req.end(data);
  });
}

async function rpc(session, method, params, timeoutMs = 600000) {
  const id = nextId++;
  const done = new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout ' + method)), timeoutMs);
    session.pending.set(id, m => { clearTimeout(t); resolve(m); });
  });
  await post(session, { jsonrpc: '2.0', id, method, params });
  return done;
}

async function main() {
  const [cmd, a, b] = process.argv.slice(2);
  const s = await openSession();
  await rpc(s, 'initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'arabic-text-dev', version: '1' } });
  await post(s, { jsonrpc: '2.0', method: 'notifications/initialized' });
  // The server refuses execute_script until the preamble was read in this session.
  if (cmd !== 'tools') await rpc(s, 'tools/call', { name: 'read_sdk_documentation_topic', arguments: { filename: 'preamble' } });
  let res;
  if (cmd === 'tools') res = await rpc(s, 'tools/list', {});
  else if (cmd === 'call') res = await rpc(s, 'tools/call', { name: a, arguments: b ? JSON.parse(b) : {} });
  else if (cmd === 'run') res = await rpc(s, 'tools/call', { name: 'execute_script', arguments: { script: readFileSync(a, 'utf8') } });
  else if (cmd === 'save') {
    // save <script file> <title> <description>: install a script into Affinity's library.
    const [, file, title, description] = process.argv.slice(2);
    res = await rpc(s, 'tools/call', { name: 'save_script_to_library', arguments: { title, description, code: readFileSync(file, 'utf8') } });
  }
  else if (cmd === 'render' || cmd === 'render-sel') {
    // render <out.jpg> [spreadIndex]: snapshot the current document for visual checks.
    const u = await rpc(s, 'tools/call', { name: 'execute_script', arguments: { script: "console.log(require('/document.js').Document.current.sessionUuid)" } });
    const uuid = u.result.content[0].text.trim();
    res = cmd === 'render'
      ? await rpc(s, 'tools/call', { name: 'render_spread', arguments: { document_session_uuid: uuid, spread_index: Number(b || 0) } })
      : await rpc(s, 'tools/call', { name: 'render_selection', arguments: { document_session_uuid: uuid } });
    const img = res.result?.content?.find(c => c.type === 'image');
    if (img) { writeFileSync(a, Buffer.from(img.data, 'base64')); console.log('saved', a); s.close(); process.exit(0); }
  }
  else throw new Error('unknown command');
  if (res.result?.content) for (const c of res.result.content) console.log(c.type === 'text' ? c.text : JSON.stringify(c));
  else console.log(JSON.stringify(res, null, 2));
  s.close();
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
