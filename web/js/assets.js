// 我的素材：自己上傳的圖片（貼圖、背景、裝飾），存在這個瀏覽器的 IndexedDB「assets」
// 不會變成卡片，不會出現在卡冊；工坊的圖層用 src: 'asset:<id>' 引用
import { db } from './db.js';
import { uid, makeThumb } from './util.js';

export const MAX_ASSET_MB = 25;

/** 上傳多張圖片；回傳新增的素材（不是圖片或太大的會略過，並在 skipped 裡說明） */
/** credit：網路素材的來源、作者、授權（自己上傳的沒有） */
export async function addAssets(files, credit = null) {
  const added = [], skipped = [];
  for (const f of files) {
    if (!/^image\//.test(f.type)) { skipped.push(`${f.name}（不是圖片）`); continue; }
    if (f.size > MAX_ASSET_MB * 1048576) { skipped.push(`${f.name}（超過 ${MAX_ASSET_MB} MB）`); continue; }
    try {
      const t = await makeThumb(f, 360);
      const a = { id: uid('as'), name: f.name.replace(/\.\w+$/, '').slice(0, 30) || '素材', blob: f, thumb: t.blob, width: t.width, height: t.height, alpha: t.alpha, createdAt: Date.now(), ...(credit && { credit }) };
      await db.put('assets', a);
      added.push(a);
    } catch { skipped.push(`${f.name}（讀不出來）`); }
  }
  return { added, skipped };
}

export const allAssets = async () => (await db.all('assets')).sort((a, b) => b.createdAt - a.createdAt);
export const deleteAsset = id => db.del('assets', id);
export async function renameAsset(id, name) {
  const a = await db.get('assets', id);
  if (a) { a.name = name.slice(0, 30); await db.put('assets', a); }
}

/** 素材有沒有被動態作品或閃卡的圖層用到（刪除前提醒） */
export async function assetUsage(id) {
  const key = 'asset:' + id;
  const lives = (await db.all('lives')).filter(l => (l.layers || []).some(x => x.src === key)).length;
  const cards = (await db.all('cards')).filter(c => (c.craft?.layers || []).some(x => x.src === key)).length;
  return { lives, cards };
}
