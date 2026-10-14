// 自動隨機命名：角色池取人名、場景池取地名，素材類卡池只標「道具 No.0134」這種簡單標籤
// 名字由詞庫隨機組合，盡量避開已經用過的名字

const pick = a => a[Math.floor(Math.random() * a.length)];

// ---- 角色 ----
// 二字詩意名：前字 + 後字
const POET_A = '月星霜緋琉夜雪蒼紫朔白玄銀翠嵐雲霧晴汐瑤櫻螢暮曦凜澪鈴璃詠歌夢羽寒虹棠葵蓮'.split('');
const POET_B = '華詠鈴音夢羽璃嵐歌葵瑤汐雪月櫻霜弦影燈織紗凜螢衣澄緒心寧晴雫'.split('');
// 洋名（中文音譯 + 英文拼法，英文拼法順便當首頁名牌的大字）
const WEST = [
  ['艾莉婭', 'ARIA'], ['莉瑟', 'LISE'], ['諾瓦', 'NOVA'], ['賽琳娜', 'SELENA'], ['露米娜', 'LUMINA'], ['伊芙', 'EVE'],
  ['奧蘿拉', 'AURORA'], ['菲莉絲', 'PHYLLIS'], ['薇歐拉', 'VIOLA'], ['卡特琳娜', 'CATERINA'], ['米蕾', 'MIREILLE'], ['艾絲蒂', 'ESTE'],
  ['蒂亞', 'TIA'], ['妮可菈', 'NICOLA'], ['瑟蕾絲', 'CELES'], ['蕾娜', 'LENA'], ['希爾薇', 'SYLVIE'], ['安潔莉卡', 'ANGELICA'],
  ['雅緹', 'ATTIE'], ['芙蘿拉', 'FLORA'], ['莉莉安', 'LILIANE'], ['艾莉絲', 'ALICE'], ['葛蕾絲', 'GRACE'], ['索菲婭', 'SOPHIA'],
  ['伊莎貝拉', 'ISABELLA'], ['瑪格麗特', 'MARGARET'], ['卡蜜拉', 'CAMILLA'], ['黛安娜', 'DIANA'], ['露娜', 'LUNA'], ['婕洛', 'JERO'],
  ['涅菈', 'NERA'], ['維斯珀', 'VESPER'], ['艾斯特', 'ASTER'], ['菈娜', 'RANA'], ['羅莎琳', 'ROSALIND'], ['塞西莉亞', 'CECILIA'],
  ['亞瑟', 'ARTHUR', 'm'], ['里昂', 'LEON', 'm'], ['諾亞', 'NOAH', 'm'], ['凱爾', 'KYLE', 'm'], ['艾德里安', 'ADRIAN', 'm'], ['路西安', 'LUCIEN', 'm'],
];
// SSR 稱號
const TITLE_A = ['星詠', '緋月', '霜華', '夜鶯', '白夜', '琉璃', '朔風', '蒼穹', '月蝕', '黎明', '深淵', '花冠', '銀翼', '靜謐', '永夜', '曙光'];
const TITLE_B = ['', '', '的魔女', '的歌姬', '的騎士', '的巫女', '的王女', '的旅人', '的守望者', '的司書'];
// 給詩意名配的英文稱號
const EN_WORD = ['SERENADE', 'NOCTURNE', 'ELEGY', 'REVERIE', 'SOLACE', 'REQUIEM', 'CELESTE', 'MIRAGE', 'EVERNIGHT', 'STARFALL',
  'MOONVEIL', 'FROSTBLOOM', 'CATENA', 'NOCTIS', 'ASTRAEA', 'SELENE', 'LYRA', 'HALCYON', 'EPHEMERA', 'AETHER', 'CRESCENT', 'VIGIL'];

// ---- 場景 ----
const PLACE_A = ['月下', '霧雨', '星落', '黃昏', '雪夜', '晨曦', '琉璃', '薄暮', '流光', '夜航', '花雨', '深藍', '寂靜', '螢火', '極光', '潮聲'];
const PLACE_B = ['舊城', '長街', '花園', '湖畔', '鐘樓', '海濱', '森林', '聖堂', '車站', '屋頂', '書庫', '神社', '山巔', '雲海', '小巷', '燈塔', '溫室', '庭院'];
const PLACE_EN = ['NOCTURNE', 'REVERIE', 'HORIZON', 'SANCTUARY', 'STARLIGHT', 'DUSKFALL', 'EMBERS', 'CRESCENT', 'TIDES', 'LANTERN', 'MIRAGE', 'STILLNESS'];

/** 卡池是哪一類：asset（透明素材）/ scene（場景）/ char（角色） */
export function bannerKind(banner) {
  if (!banner) return 'char';
  if (banner.kind === 'asset' || banner.transparent) return 'asset';
  if (banner.id === 'banner-scene' || /\b(no humans|scenery)\b/i.test(banner.prompt || '')) return 'scene';
  return 'char';
}
/** 素材類卡池的標籤 */
export function assetLabel(banner) {
  const map = { 'banner-items': '道具', 'banner-deco': '裝飾', 'banner-text': '文字', 'banner-fx': '光效' };
  return map[banner?.id] || '素材';
}

/** 產生一組 { name, subtitle }；taken 是已用過的名字（避開重複） */
export function randomName(kind = 'char', rarity = 'R', taken = null) {
  for (let tries = 0; tries < 30; tries++) {
    let name, subtitle;
    if (kind === 'scene') {
      name = Math.random() < .8 ? pick(PLACE_A) + pick(PLACE_B) : `${pick(PLACE_A)}之${pick(PLACE_B)}`;
      subtitle = pick(PLACE_EN);
    } else {
      const r = Math.random();
      if (rarity === 'SSR' && r < .5) {                // SSR 一半機會帶稱號
        const t = pick(TITLE_A), tb = pick(TITLE_B);
        const femaleTitle = /魔女|歌姬|巫女|王女/.test(tb);                  // 女性稱號只配女性名字
        const [w, en] = pick(femaleTitle ? WEST.filter(x => x[2] !== 'm') : WEST);
        name = tb ? `${t}${tb} · ${w}` : `「${t}」${w}`; subtitle = en;
      } else if (r < .5) {
        let a = pick(POET_A), b = pick(POET_B);
        while (b === a) b = pick(POET_B);
        name = a + b; subtitle = pick(EN_WORD);
      } else {
        const [w, en] = pick(WEST); name = w; subtitle = en;
      }
    }
    if (!taken || !taken.has(name)) return { name, subtitle };
  }
  return { name: kind === 'scene' ? pick(PLACE_A) + pick(PLACE_B) : pick(POET_A) + pick(POET_B), subtitle: pick(EN_WORD) };
}
