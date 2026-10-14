// IndexedDB：卡片、卡冊、動態作品與設定都只存在這台電腦的瀏覽器裡
const DB_NAME = 'nightjar-gacha';
const STORES = ['cards', 'albums', 'lives', 'kv', 'assets'];   // assets：自己上傳的素材（v2 新增）
let dbp;

function open() {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: s === 'kv' ? 'key' : 'id' });
    };
    req.onsuccess = () => { const d = req.result; d.onversionchange = () => d.close(); resolve(d); };   // 新版開啟時讓舊分頁讓出資料庫
    req.onblocked = () => console.warn('資料庫升級等待中：請關掉其他開著本網站的分頁')
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const r = fn(t.objectStore(store));
    t.oncomplete = () => resolve(r?.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('儲存失敗（瀏覽器空間可能不足）'));
  });
}

export const db = {
  get: (store, id) => tx(store, 'readonly', s => s.get(id)),
  all: (store) => tx(store, 'readonly', s => s.getAll()),
  put: (store, obj) => tx(store, 'readwrite', s => s.put(obj)),
  del: (store, id) => tx(store, 'readwrite', s => s.delete(id)),
  clear: (store) => tx(store, 'readwrite', s => s.clear()),
  async kvGet(key, fallback) {
    const row = await this.get('kv', key);
    return row ? row.value : fallback;
  },
  kvSet: (key, value) => tx('kv', 'readwrite', s => s.put({ key, value })),
};
