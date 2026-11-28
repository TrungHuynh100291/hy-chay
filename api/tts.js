/**
 * HY CHAY POS - SERVERLESS NEURAL TTS API (VI-VN-HOAIMYNEURAL)
 * Giong nu mien Nam trong treo, de thuong, toc do 1.25x (+25%), pitch +6Hz.
 * Ho tro cache bo nho ngan han (LRU) + timeout cung 2.5s + fallback muot.
 */

const tls = require('tls');
const crypto = require('crypto');

const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const CHROMIUM_FULL_VERSION = '143.0.3650.75';
const CHROMIUM_MAJOR_VERSION = CHROMIUM_FULL_VERSION.split('.')[0];
const SEC_MS_GEC_VERSION = `2-${CHROMIUM_FULL_VERSION}`;
const WIN_EPOCH = 11644473600;
const VOICE_NAME = 'Microsoft Server Speech Text to Speech Voice (vi-VN, HoaiMyNeural)';

const CACHE_TTL_MS = 15 * 60 * 1000;
const CACHE_MAX_ENTRIES = 120;
const EDGE_TIMEOUT_MS = 5000;
const GOOGLE_FALLBACK_TIMEOUT_MS = 1800;

const ttsMemoryCache = new Map();
let clockSkewSeconds = 0;

const SHA256_INITIAL = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
];
const SHA256_STATE = [
  0xfd9fbea2, 0x91243ce7, 0xbe499094, 0xcd2e1e0a,
  0x6c006f49, 0x04bd35ab, 0xfeb0a7e4, 0x03effbd2
];
const SHA256_SCHEDULE = [
  0xeb24bf9e, 0x1558691f, 0xa0c09ee2, 0x0cfa32ba, 0xa622ee8c, 0xd1dd9491, 0xc0dd25a0,
  0xf9e70ab6, 0xf0c31573, 0x7058ce4e, 0x7188e606, 0x00e5ab33, 0xd258b060, 0x72766564
];
const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
];
const SHA256_ADJ = 0xc9dc06a7;
const SHA256_K_BLOCK = SHA256_K.slice(0, 14).concat([SHA256_ADJ], SHA256_K.slice(15));
const CS64_COEFF = [
  [0xe82e91b1, 0xb32700d0], [0x44de24c6, 0x88dff51d], [0x3beb65bc, 0x29514038], [0xc89c5933, 0xb328cbdf],
  [0x8d1ec211, 0xd405b4d5], [0x314ef5d5, 0x26e55f3c], [0xe92491b1, 0x607801c6], [0xf0a5b9d5, 0x82b2c1fb],
  [0x06064cf3, 0xfa51a3da], [0xda79fa60, 0x207cc464], [0xbed20560, 0x3c3c74f3], [0x89f9c9f8, 0xd2d14b61],
  [0x35fa38c6, 0xbb04a2c1], [0xcb49e3c6, 0xc5626167]
];

const ror = (v, n) => ((v >>> n) | (v << (32 - n))) >>> 0;
const rol16 = (v) => ((v << 16) | (v >>> 16)) >>> 0;
const s0 = (v) => (ror(v, 7) ^ ror(v, 18) ^ (v >>> 3)) >>> 0;
const s1 = (v) => (ror(v, 17) ^ ror(v, 19) ^ (v >>> 10)) >>> 0;
const S0 = (v) => (ror(v, 2) ^ ror(v, 13) ^ ror(v, 22)) >>> 0;
const S1 = (v) => (ror(v, 6) ^ ror(v, 11) ^ ror(v, 25)) >>> 0;

function sha256Rounds(state, words, firstRound = 0) {
  let [a, b, c, d, e, f, g, h] = state;
  const K = firstRound === 14 ? SHA256_K_BLOCK : SHA256_K;
  for (let i = firstRound; i < 64; i++) {
    const ch = (g ^ (e & (f ^ g))) >>> 0;
    const maj = ((a & b) | (c & (a | b))) >>> 0;
    const t1 = (h + S1(e) + ch + K[i] + words[i]) >>> 0;
    const t2 = (S0(a) + maj) >>> 0;
    h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
  }
  return [a, b, c, d, e, f, g, h];
}

function expandWords(words, from = 16) {
  for (let i = from; i < 64; i++) {
    words[i] = (s1(words[i - 2]) + words[i - 7] + s0(words[i - 15]) + words[i - 16]) >>> 0;
  }
}

function customSha256(dataBuf) {
  const w0 = new Array(14).fill(0);
  w0.push(((dataBuf[0] << 16) | (dataBuf[1] << 8) | dataBuf[2]) >>> 0);
  w0.push(dataBuf.readUInt32BE(3));
  for (let i = 16; i < 30; i++) {
    let val = SHA256_SCHEDULE[i - 16];
    if (i - 2 >= 14) val = (val + (i === 16 ? (s1(w0[i - 2]) ^ 0x000b92c0) >>> 0 : s1(w0[i - 2]))) >>> 0;
    if (i - 7 >= 14) val = (val + w0[i - 7]) >>> 0;
    if (i - 15 >= 14) val = (val + (i === 29 ? (s0(w0[i - 15]) ^ 0x059c0b80) >>> 0 : s0(w0[i - 15]))) >>> 0;
    w0.push(val >>> 0);
  }
  w0.push((s1(w0[28]) + w0[23] + s0(w0[15]) + w0[14] + SHA256_ADJ - SHA256_K[14]) >>> 0);
  expandWords(w0, 31);
  let working = sha256Rounds(SHA256_STATE, w0, 14);
  let state = SHA256_INITIAL.map((x, idx) => (x + working[idx]) >>> 0);

  const length = 57 + dataBuf.length;
  const padZeros = (((55 - length) % 64) + 64) % 64;
  const tail = Buffer.alloc(dataBuf.length - 7 + 1 + padZeros + 8);
  dataBuf.copy(tail, 0, 7);
  tail[dataBuf.length - 7] = 0x80;
  tail.writeBigUInt64BE(BigInt(length) * 8n, tail.length - 8);
  for (let off = 0; off < tail.length; off += 64) {
    const words = [];
    for (let j = 0; j < 16; j++) words.push(tail.readUInt32BE(off + j * 4));
    expandWords(words, 16);
    working = sha256Rounds(state, words, 0);
    state = state.map((x, idx) => (x + working[idx]) >>> 0);
  }
  const out = Buffer.alloc(32);
  state.forEach((v, idx) => out.writeUInt32BE(v, idx * 4));
  return out;
}

function cs64Digest(dataBuf, shaBuf) {
  const keyA = (shaBuf.readUInt32LE(0) | 1) >>> 0;
  const keyB = (shaBuf.readUInt32LE(4) | 1) >>> 0;
  const fA = Math.imul(keyA, 0x82893933) >>> 0;
  const fB = Math.imul(keyB, 0x82893933) >>> 0;
  const terms = CS64_COEFF.map(([c], i) => Math.imul(c, i % 2 === 0 ? fA : fB) >>> 0);
  const offsets = CS64_COEFF.map(([, o]) => o >>> 0);

  const pref = Buffer.concat([Buffer.from([0]), dataBuf]);
  const padLen = (4 - (pref.length % 4)) % 4;
  const padded = padLen ? Buffer.concat([pref, Buffer.alloc(padLen)]) : pref;
  const words = [];
  for (let i = 0; i < padded.length; i += 4) words.push(padded.readUInt32LE(i));
  if (words.length % 2 === 1) words.push(0);

  words.forEach((w, idx) => {
    let term = Math.imul(w, idx % 2 === 0 ? keyA : keyB) >>> 0;
    let offset = Math.imul(rol16(w), idx % 2 === 0 ? 0xef0569fb : 0xc31713db) >>> 0;
    if (idx === 0) {
      term = (term + Math.imul(0xf2f90b1a, fA)) >>> 0;
      offset = (offset + 0x0b1a0000) >>> 0;
    }
    terms.push(term >>> 0);
    offsets.push(offset >>> 0);
  });

  let swapAcc = 0;
  let swapLast = 0;
  let st = 0;
  let acc = 0;
  for (let i = 0; i < terms.length; i += 2) {
    const x = terms[i];
    const y = terms[i + 1];
    let t = rol16((offsets[i] + x) >>> 0);
    let q = Math.imul(t, 0x76f50f34) >>> 0;
    swapAcc = (swapAcc + ((Math.imul(rol16(q), 0xc3efea97) + q) >>> 0)) >>> 0;
    t = rol16((offsets[i + 1] + y) >>> 0);
    q = Math.imul(t, 0x1881ce3c) >>> 0;
    swapLast = (Math.imul(rol16(q), 0x35bd1ec9) + q) >>> 0;
    swapAcc = (swapAcc + swapLast) >>> 0;

    st = (Math.imul(st, keyA) + x) >>> 0;
    st = Math.imul(rol16(st), 0xcf98b111) >>> 0;
    st = Math.imul(rol16(st), 0x87085b9f) >>> 0;
    st = Math.imul(rol16(st), 0x12ceb96d) >>> 0;
    st = Math.imul(rol16(st), 0x257e1d83) >>> 0;
    acc = (acc + st) >>> 0;
    t = (Math.imul(st, keyB) + y) >>> 0;
    t = Math.imul(rol16(t), 0xa27416f5) >>> 0;
    t = Math.imul(rol16(t), 0xd38396ff) >>> 0;
    st = Math.imul(rol16(Math.imul(rol16(t), 0x7c932b89) >>> 0), 0xbfa49f69) >>> 0;
    acc = (acc + st) >>> 0;
  }

  const out = Buffer.alloc(8);
  out.writeUInt32LE((swapLast ^ st) >>> 0, 0);
  out.writeUInt32LE((swapAcc ^ acc) >>> 0, 4);
  return out.toString('hex').toUpperCase();
}

function generateSecMsGecV2() {
  let ticks = Math.floor(Date.now() / 1000 + clockSkewSeconds) + WIN_EPOCH;
  ticks -= ticks % 300;
  ticks *= 1e7;
  const dataBuf = Buffer.from(ticks.toFixed(0) + TRUSTED_CLIENT_TOKEN, 'ascii');
  const shaBuf = customSha256(dataBuf);
  return `${cs64Digest(dataBuf, shaBuf)}-${shaBuf.toString('hex').toUpperCase()}`;
}

function edgeDateStr() {
  const d = new Date();
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const mons = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const pad = (n) => String(n).padStart(2, '0');
  return `${days[d.getUTCDay()]} ${mons[d.getUTCMonth()]} ${pad(d.getUTCDate())} ${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} GMT+0000 (Coordinated Universal Time)`;
}

function escapeXml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function sanitizeSpeechText(raw) {
  return String(raw || '')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 320);
}

function getCacheEntry(key) {
  const hit = ttsMemoryCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > CACHE_TTL_MS) {
    ttsMemoryCache.delete(key);
    return null;
  }
  ttsMemoryCache.delete(key);
  ttsMemoryCache.set(key, hit);
  return hit;
}

function setCacheEntry(key, value) {
  if (ttsMemoryCache.has(key)) ttsMemoryCache.delete(key);
  while (ttsMemoryCache.size >= CACHE_MAX_ENTRIES) {
    const oldestKey = ttsMemoryCache.keys().next().value;
    ttsMemoryCache.delete(oldestKey);
  }
  ttsMemoryCache.set(key, { ...value, ts: Date.now() });
}

function synthesizeWithEdgeNeural(text, timeoutMs = EDGE_TIMEOUT_MS, allowSkewRetry = true) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const connId = crypto.randomBytes(16).toString('hex');
    const reqId = crypto.randomBytes(16).toString('hex');
    const muid = crypto.randomBytes(16).toString('hex').toUpperCase();
    const path = `/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}&Sec-MS-GEC=${generateSecMsGecV2()}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}&ConnectionId=${connId}`;
    const wsKey = crypto.randomBytes(16).toString('base64');

    let settled = false;
    let upgraded = false;
    let recvBuf = Buffer.alloc(0);
    const audioChunks = [];

    const finish = (err, data) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { sock.destroy(); } catch (_) {}
      if (err) reject(err);
      else resolve(data);
    };

    const timer = setTimeout(() => {
      finish(new Error(`Edge TTS timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    const sock = tls.connect({
      host: 'speech.platform.bing.com',
      port: 443,
      servername: 'speech.platform.bing.com'
    });

    const sendFrame = (frameText) => {
      const payload = Buffer.from(frameText, 'utf8');
      const mask = crypto.randomBytes(4);
      let hdr;
      if (payload.length < 126) {
        hdr = Buffer.from([0x81, 0x80 | payload.length]);
      } else {
        hdr = Buffer.alloc(4);
        hdr[0] = 0x81;
        hdr[1] = 0x80 | 126;
        hdr.writeUInt16BE(payload.length, 2);
      }
      const masked = Buffer.alloc(payload.length);
      for (let i = 0; i < payload.length; i++) masked[i] = payload[i] ^ mask[i & 3];
      sock.write(Buffer.concat([hdr, mask, masked]));
    };

    sock.on('secureConnect', () => {
      const reqHeaders = [
        `GET ${path} HTTP/1.1`,
        'Host: speech.platform.bing.com',
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Key: ${wsKey}`,
        'Sec-WebSocket-Version: 13',
        'Origin: chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
        `User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROMIUM_MAJOR_VERSION}.0.0.0 Safari/537.36 Edg/${CHROMIUM_MAJOR_VERSION}.0.0.0`,
        'Accept-Encoding: identity',
        'Accept-Language: en-US,en;q=0.9',
        `Cookie: muid=${muid};`,
        'Pragma: no-cache',
        'Cache-Control: no-cache',
        '', ''
      ].join('\r\n');
      sock.write(reqHeaders);
    });

    sock.on('data', (chunk) => {
      if (settled) return;
      recvBuf = Buffer.concat([recvBuf, chunk]);

      if (!upgraded) {
        const hdrEnd = recvBuf.indexOf('\r\n\r\n');
        if (hdrEnd === -1) return;
        const headerStr = recvBuf.slice(0, hdrEnd).toString('utf8');
        if (!headerStr.includes('101')) {
          const dateMatch = headerStr.match(/^Date:\s*(.+)$/im);
          if (allowSkewRetry && headerStr.includes('403') && dateMatch) {
            const srvMs = Date.parse(dateMatch[1].trim());
            if (!Number.isNaN(srvMs)) {
              clockSkewSeconds = (srvMs - Date.now()) / 1000;
              const remain = timeoutMs - (Date.now() - startTime);
              if (remain > 700) {
                settled = true;
                clearTimeout(timer);
                try { sock.destroy(); } catch (_) {}
                synthesizeWithEdgeNeural(text, remain, false).then(resolve).catch(reject);
                return;
              }
            }
          }
          finish(new Error(`Edge TTS handshake failed: ${headerStr.split('\r\n')[0]}`));
          return;
        }
        upgraded = true;
        recvBuf = recvBuf.slice(hdrEnd + 4);

        const ts = edgeDateStr();
        sendFrame(
          `X-Timestamp:${ts}\r\n` +
          'Content-Type:application/json; charset=utf-8\r\n' +
          'Path:speech.config\r\n\r\n' +
          '{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"true","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}\r\n'
        );
        const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'><voice name='${VOICE_NAME}'><prosody pitch='+6Hz' rate='+25%' volume='+0%'>${escapeXml(text)}</prosody></voice></speak>`;
        sendFrame(
          `X-RequestId:${reqId}\r\n` +
          'Content-Type:application/ssml+xml\r\n' +
          `X-Timestamp:${ts}Z\r\n` +
          'Path:ssml\r\n\r\n' +
          ssml
        );
      }

      while (recvBuf.length >= 2) {
        const opcode = recvBuf[0] & 0x0f;
        let len = recvBuf[1] & 0x7f;
        let off = 2;
        if (len === 126) {
          if (recvBuf.length < 4) break;
          len = recvBuf.readUInt16BE(2);
          off = 4;
        } else if (len === 127) {
          if (recvBuf.length < 10) break;
          len = Number(recvBuf.readBigUInt64BE(2));
          off = 10;
        }
        if (recvBuf.length < off + len) break;
        const payload = recvBuf.slice(off, off + len);
        recvBuf = recvBuf.slice(off + len);

        if (opcode === 1) {
          const msg = payload.toString('utf8');
          if (msg.includes('Path:turn.end')) {
            const audio = Buffer.concat(audioChunks);
            if (!audio.length) finish(new Error('Edge TTS returned empty audio'));
            else finish(null, audio);
            return;
          }
        } else if (opcode === 2 && payload.length >= 2) {
          const hLen = payload.readUInt16BE(0);
          if (payload.length >= 2 + hLen) {
            const hdr = payload.slice(2, 2 + hLen).toString('utf8');
            if (hdr.includes('Path:audio')) audioChunks.push(payload.slice(2 + hLen));
          }
        } else if (opcode === 8) {
          const audio = Buffer.concat(audioChunks);
          if (audio.length > 0) finish(null, audio);
          else finish(new Error('Edge TTS closed before audio'));
          return;
        }
      }
    });

    sock.on('error', (err) => finish(err));
    sock.on('close', () => {
      if (!settled) {
        const audio = Buffer.concat(audioChunks);
        if (audio.length > 0) finish(null, audio);
        else finish(new Error('Edge TTS socket closed unexpectedly'));
      }
    });
  });
}

async function synthesizeWithGoogleFallback(text) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GOOGLE_FALLBACK_TIMEOUT_MS);
  try {
    const url = `https://translate.googleapis.com/translate_tts?client=gtx&ie=UTF-8&tl=vi&dt=t&q=${encodeURIComponent(text)}`;
    const upstream = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0',
        Referer: 'https://translate.google.com/'
      }
    });
    if (!upstream.ok) {
      throw new Error(`Fallback TTS HTTP ${upstream.status}`);
    }
    const arrBuf = await upstream.arrayBuffer();
    const buf = Buffer.from(arrBuf);
    if (!buf.length) throw new Error('Fallback TTS empty audio');
    return buf;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  let rawText = (req.query && req.query.text) || '';
  if (!rawText && req.url && req.url.includes('?')) {
    const qIdx = req.url.indexOf('?');
    const params = new URLSearchParams(req.url.slice(qIdx + 1));
    rawText = params.get('text') || '';
  }

  const cleanText = sanitizeSpeechText(rawText);
  if (!cleanText) {
    return res.status(400).json({ error: 'Missing text query parameter' });
  }

  const cacheKey = cleanText.toLowerCase();
  const cached = getCacheEntry(cacheKey);
  if (cached) {
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400');
    res.setHeader('X-TTS-Voice', cached.voice);
    res.setHeader('X-TTS-Engine', cached.engine);
    res.setHeader('X-TTS-Rate', cached.rate);
    res.setHeader('X-TTS-Cache', 'HIT');
    return res.status(200).send(req.method === 'HEAD' ? undefined : cached.audio);
  }

  let audioBuffer = null;
  let engine = 'edge-neural';
  let voice = 'vi-VN-HoaiMyNeural';
  let rate = '1.25';

  try {
    audioBuffer = await synthesizeWithEdgeNeural(cleanText, EDGE_TIMEOUT_MS, true);
  } catch (edgeErr) {
    try {
      audioBuffer = await synthesizeWithGoogleFallback(cleanText);
      engine = 'google-fallback';
      voice = 'vi-VN-Standard';
      rate = '1.0';
    } catch (fbErr) {
      return res.status(503).json({
        error: 'TTS synthesis temporarily unavailable',
        detail: `${edgeErr.message}; fallback: ${fbErr.message}`
      });
    }
  }

  setCacheEntry(cacheKey, { audio: audioBuffer, engine, voice, rate });

  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400');
  res.setHeader('X-TTS-Voice', voice);
  res.setHeader('X-TTS-Engine', engine);
  res.setHeader('X-TTS-Rate', rate);
  res.setHeader('X-TTS-Cache', 'MISS');
  return res.status(200).send(req.method === 'HEAD' ? undefined : audioBuffer);
};
