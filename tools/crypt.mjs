#!/usr/bin/env node
// Verschlüsselungs-Werkzeug für den Filamentbestand (gleiches Format wie die WebApp).
//
//   node tools/crypt.mjs init <klartext.json>          → erzeugt data/filamente.enc.json + data/team.enc.json (neues Salt)
//   node tools/crypt.mjs decrypt <datei.enc.json>       → gibt den Klartext auf stdout aus (z. B. für Backups)
//   node tools/crypt.mjs encrypt <klartext.json> <ziel.enc.json> --typ data|team --salt-from data/team.enc.json
//
// Das Passwort wird aus der Umgebungsvariable FB_PASSWORD gelesen oder interaktiv abgefragt.
import { webcrypto as wc } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

export const ITERATIONS = 600000;
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = buf => Buffer.from(buf).toString('base64');
const unb64 = s => new Uint8Array(Buffer.from(s, 'base64'));

export async function deriveKey(password, saltB64, iterations = ITERATIONS) {
  const base = await wc.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return wc.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: unb64(saltB64), iterations },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function encrypt(key, saltB64, typ, obj, iterations = ITERATIONS) {
  const iv = wc.getRandomValues(new Uint8Array(12));
  const ct = await wc.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode('filamentbestand:' + typ) }, key, enc.encode(JSON.stringify(obj)));
  return { format: 'filamentbestand-enc', v: 1, typ, kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: saltB64 }, iv: b64(iv), ct: b64(ct) };
}
export async function decrypt(key, env) {
  const pt = await wc.subtle.decrypt({ name: 'AES-GCM', iv: unb64(env.iv), additionalData: enc.encode('filamentbestand:' + env.typ) }, key, unb64(env.ct));
  return JSON.parse(dec.decode(pt));
}

async function askPassword(prompt) {
  if (process.env.FB_PASSWORD) return process.env.FB_PASSWORD;
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise(res => rl.question(prompt, a => { rl.close(); res(a); }));
}
const write = (p, o) => writeFileSync(p, JSON.stringify(o, null, 2) + '\n');

async function main() {
  const [cmd, a, b] = process.argv.slice(2);
  const arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
  if (cmd === 'init') {
    const plain = JSON.parse(readFileSync(a, 'utf8'));
    const pw = await askPassword('Neues Team-Passwort: ');
    if (pw.length < 10) throw new Error('Passwort zu kurz (mind. 10 Zeichen)');
    const salt = b64(wc.getRandomValues(new Uint8Array(16)));
    const key = await deriveKey(pw, salt);
    write('data/filamente.enc.json', await encrypt(key, salt, 'data', plain));
    write('data/team.enc.json', await encrypt(key, salt, 'team', { token: '' }));
    console.error('Geschrieben: data/filamente.enc.json, data/team.enc.json');
  } else if (cmd === 'decrypt') {
    const env = JSON.parse(readFileSync(a, 'utf8'));
    const key = await deriveKey(await askPassword('Team-Passwort: '), env.kdf.salt, env.kdf.iterations);
    process.stdout.write(JSON.stringify(await decrypt(key, env), null, 2) + '\n');
  } else if (cmd === 'encrypt') {
    const typ = arg('--typ') || 'data';
    const salt = JSON.parse(readFileSync(arg('--salt-from') || 'data/team.enc.json', 'utf8')).kdf.salt;
    const key = await deriveKey(await askPassword('Team-Passwort: '), salt);
    write(b, await encrypt(key, salt, typ, JSON.parse(readFileSync(a, 'utf8'))));
  } else {
    console.error('Verwendung: node tools/crypt.mjs init|decrypt|encrypt …');
    process.exit(1);
  }
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error('Fehler:', e.message); process.exit(1); });
