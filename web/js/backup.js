// 備份：把這個瀏覽器裡的卡片、卡冊、動態作品、設定打包成一個 .njbak 檔，或從檔案還原
// 檔案格式：'NJBAK1\n' + 4 位元組（說明 JSON 的長度）+ 說明 JSON + 所有圖片資料依序接在後面
// 說明 JSON 裡原本是圖片（Blob）的欄位，會換成 { "__blob": 編號 }
import { db } from './db.js';

const MAGIC = 'NJBAK1\n';
const STORES = ['cards', 'albums', 'lives', 'kv', 'assets'];

/** 匯出：回傳 { blob, counts } */
export async function exportBackup() {
  const blobs = [];
  const pack = v => {
    if (v instanceof Blob) { blobs.push(v); return { __blob: blobs.length - 1 }; }
    if (Array.isArray(v)) return v.map(pack);
    if (v && typeof v === 'object' && !(v instanceof ArrayBuffer) && !ArrayBuffer.isView(v)) {
      const o = {}; for (const k in v) o[k] = pack(v[k]); return o;
    }
    return v;
  };
  const stores = {}, counts = {};
  for (const s of STORES) {
    let rows = await db.all(s);
    if (s === 'kv') rows = rows.map(r => (r.key === 'settings' ? { ...r, value: { ...r.value, token: '', ...(r.value.customApi && { customApi: { ...r.value.customApi, key: '' } }) } } : r));   // 不匯出 NovelAI Token 和自訂 API 金鑰
    stores[s] = rows.map(pack); counts[s] = rows.length;
  }
  const manifest = { app: 'nightjar-gacha', version: 1, exportedAt: Date.now(), stores, blobs: blobs.map(b => ({ type: b.type, size: b.size })) };
  const json = new TextEncoder().encode(JSON.stringify(manifest));
  const len = new Uint8Array(4); new DataView(len.buffer).setUint32(0, json.length, true);
  return { blob: new Blob([MAGIC, len, json, ...blobs], { type: 'application/octet-stream' }), counts };
}

/** 讀取備份檔的內容（還沒寫入），回傳 { manifest, counts, unpack } */
export async function readBackup(file) {
  const head = new Uint8Array(await file.slice(0, MAGIC.length + 4).arrayBuffer());
  if (new TextDecoder().decode(head.subarray(0, MAGIC.length)) !== MAGIC) throw new Error('這不是夜航卡舍的備份檔（.njbak）');
  const len = new DataView(head.buffer).getUint32(MAGIC.length, true);
  const start = MAGIC.length + 4;
  const manifest = JSON.parse(new TextDecoder().decode(await file.slice(start, start + len).arrayBuffer()));
  if (manifest.app !== 'nightjar-gacha') throw new Error('這不是夜航卡舍的備份檔');
  // 圖片資料的位置
  let off = start + len;
  const blobs = manifest.blobs.map(b => { const part = file.slice(off, off + b.size, b.type); off += b.size; return part; });
  const unpack = v => {
    if (Array.isArray(v)) return v.map(unpack);
    if (v && typeof v === 'object') {
      if (typeof v.__blob === 'number' && Object.keys(v).length === 1) return blobs[v.__blob];
      const o = {}; for (const k in v) o[k] = unpack(v[k]); return o;
    }
    return v;
  };
  const counts = Object.fromEntries(STORES.map(s => [s, (manifest.stores[s] || []).length]));
  return { manifest, counts, unpack };
}

/** 寫入：mode = 'merge'（加進現有資料，同一張卡會被覆蓋）或 'replace'（先清空再還原，連設定一起） */
export async function importBackup({ manifest, unpack }, mode = 'merge') {
  // 圖片要先讀成真正的 Blob（file.slice 只是參照，原檔案關掉後會失效）
  const solid = async v => {
    if (v instanceof Blob) return new Blob([await v.arrayBuffer()], { type: v.type });
    if (Array.isArray(v)) return Promise.all(v.map(solid));
    if (v && typeof v === 'object') { const o = {}; for (const k in v) o[k] = await solid(v[k]); return o; }
    return v;
  };
  if (mode === 'replace') for (const s of STORES) await db.clear(s);
  let maxSerial = 0;
  for (const s of ['cards', 'albums', 'lives', 'assets']) {
    for (const raw of manifest.stores[s] || []) {
      const row = await solid(unpack(raw));
      if (s === 'cards') maxSerial = Math.max(maxSerial, row.serial || 0);
      await db.put(s, row);
    }
  }
  const kv = (manifest.stores.kv || []).map(unpack);
  if (mode === 'replace') {
    for (const row of kv) await db.put('kv', await solid(row));
  } else {
    // 合併時保留目前的設定，只補上提示詞組，並讓卡片編號接續下去
    const groups = kv.find(r => r.key === 'promptGroups')?.value;
    if (Array.isArray(groups)) {
      const cur = (await db.kvGet('promptGroups')) || [];
      const ids = new Set(cur.map(g => g.id));
      await db.kvSet('promptGroups', [...cur, ...groups.filter(g => !ids.has(g.id))]);
    }
  }
  const stats = (await db.kvGet('stats')) || {};
  if ((stats.serial || 0) < maxSerial) await db.kvSet('stats', { ...stats, serial: maxSerial });
}
