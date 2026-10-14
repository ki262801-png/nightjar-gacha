// 內建提示詞庫：點一下就插入卡池提示詞。素材類搭配 V5 透明背景使用
// 每項：[顯示名稱, 插入的提示詞]；用 <A|B> 的會在每次召喚時隨機挑一個（可以巢狀）
// 字串項目是小標題。這裡是唯讀的內建詞庫，不會動到「我的提示詞組」
const R = (...xs) => `<${xs.join('|')}>`;

const HAIR_STYLE = ['long hair', 'very long hair', 'short hair', 'medium hair', 'bob cut', 'twintails', 'ponytail', 'side ponytail', 'braided hair', 'twin braids', 'wavy hair', 'messy hair', 'hime cut', 'drill hair', 'hair bun', 'double bun', 'ahoge', 'asymmetrical bangs', 'blunt bangs', 'wolf cut'];
const HAIR_COLOR = ['silver hair', 'white hair', 'black hair', 'blue hair', 'light blue hair', 'red hair', 'blonde hair', 'pink hair', 'purple hair', 'green hair', 'brown hair', 'orange hair', 'gradient hair', 'streaked hair', 'multicolored hair', 'two-tone hair'];
const EYES = ['red eyes', 'blue eyes', 'golden eyes', 'purple eyes', 'green eyes', 'pink eyes', 'aqua eyes', 'silver eyes', 'heterochromia', 'glowing eyes', 'star-shaped pupils', 'heart-shaped pupils', 'sanpaku', 'tsurime', 'tareme'];
const OUTFIT = ['gothic lolita dress', 'military uniform', 'kimono', 'yukata', 'witch robe', 'maid outfit', 'plate armor', 'school uniform', 'serafuku', 'qipao', 'hanfu', 'nun habit', 'idol costume', 'wedding dress', 'ballgown', 'trench coat', 'hoodie', 'sweater', 'suit and tie', 'cyberpunk jacket', 'sailor uniform', 'priestess outfit', 'knight armor', 'detective coat', 'pajamas', 'swimsuit', 'off-shoulder dress', 'cape and cloak'];
const EXPR = ['smile', 'gentle smile', 'grin', 'serious', 'expressionless', 'closed eyes', 'crying', 'tears', 'smirk', 'pout', 'blush', 'surprised', 'angry', 'sleepy', 'wink', 'open mouth', 'embarrassed', 'determined', 'melancholic', 'laughing'];
const POSE = ['standing', 'sitting', 'kneeling', 'lying', 'leaning forward', 'arms behind back', 'hand on hip', 'peace sign', 'hands on own chest', 'reaching out', 'looking back', 'from side', 'head tilt', 'stretching', 'holding umbrella', 'holding book', 'holding sword', 'holding flower', 'hugging pillow', 'dancing', 'running', 'floating', 'crossed arms', 'finger to mouth'];
const ACC = ['hair ribbon', 'hair flower', 'hairpin', 'tiara', 'crown', 'witch hat', 'beret', 'cat ears', 'fox ears', 'rabbit ears', 'horns', 'halo', 'angel wings', 'demon wings', 'tail', 'glasses', 'eyepatch', 'choker', 'earrings', 'gloves', 'scarf', 'headphones', 'mask', 'veil', 'necklace', 'flower crown'];
const RACE = ['elf', 'vampire', 'angel', 'demon girl', 'kitsune', 'catgirl', 'mermaid', 'android', 'witch', 'knight', 'princess', 'shrine maiden', 'idol', 'ninja', 'pirate', 'alchemist', 'valkyrie', 'dragon girl', 'ghost', 'fairy'];
const SCENE = ['night sky, full moon', 'cathedral interior, stained glass', 'flower field', 'rainy city street, neon lights', 'starry sky, nebula', 'ancient library', 'seaside, sunset', 'cherry blossom garden', 'snowy forest', 'japanese shrine, torii', 'floating islands', 'underwater ruins', 'cyberpunk city', 'castle ballroom', 'cafe interior', 'rooftop, city lights', 'classroom, afternoon', 'desert ruins', 'bamboo forest', 'autumn park, falling leaves', 'greenhouse', 'train station, rain', 'lighthouse, stormy sea', 'clock tower', 'magic academy', 'crystal cave', 'bedroom, morning light', 'festival, lanterns', 'mountain peak, clouds', 'lake reflection'];
const LIGHT = ['cinematic lighting', 'backlighting', 'rim light', 'volumetric lighting', 'god rays', 'soft lighting', 'dramatic lighting', 'golden hour', 'blue hour', 'moonlight', 'candlelight', 'neon glow', 'sunlight filtering through leaves', 'lens flare', 'chiaroscuro', 'bioluminescence'];
const STYLE = ['watercolor', 'oil painting', 'anime coloring', 'cel shading', 'thick painting', 'flat color', 'ink wash painting', 'pastel colors', 'sketch', 'lineart', 'pixel art', 'ukiyo-e', 'art nouveau', 'impressionism', 'retro anime', '90s anime', 'chibi', 'painterly', 'gouache', 'colored pencil', 'vaporwave', 'stained glass style', 'tarot card style', 'storybook illustration'];
const CAMERA = ['upper body', 'cowboy shot', 'full body', 'portrait', 'close-up', 'from above', 'from below', 'dutch angle', 'wide shot', 'profile', 'looking at viewer', 'looking away', 'pov', 'over the shoulder', 'fisheye', 'depth of field', 'symmetrical composition', 'dynamic angle'];
const WEATHER = ['rain', 'heavy rain', 'snow', 'fog', 'mist', 'storm, lightning', 'cherry blossoms falling', 'falling leaves', 'sunny', 'cloudy', 'rainbow', 'aurora', 'sunset clouds', 'starry night', 'meteor shower', 'fireflies'];
const PALETTE = ['monochrome', 'black and white', 'sepia', 'pastel palette', 'vivid colors', 'muted colors', 'red and black', 'blue and white', 'gold and black', 'purple theme', 'pink theme', 'green theme', 'teal and orange', 'limited palette', 'high contrast', 'warm tones', 'cool tones'];

export const PROMPT_LIBRARY = [
  {
    id: 'random', name: '隨機組合', icon: '🎲', items: [
      '一鍵隨機（每次召喚都不同）',
      ['隨機角色', `1girl, solo, ${R(...HAIR_COLOR)}, ${R(...HAIR_STYLE)}, ${R(...EYES)}, ${R(...OUTFIT)}, ${R(...EXPR)}`],
      ['隨機角色＋場景', `1girl, solo, ${R(...HAIR_COLOR)}, ${R(...HAIR_STYLE)}, ${R(...EYES)}, ${R(...OUTFIT)}, ${R(...POSE)}, ${R(...SCENE)}, ${R(...LIGHT)}`],
      ['隨機種族角色', `1girl, solo, ${R(...RACE)}, ${R(...HAIR_COLOR)}, ${R(...EYES)}, ${R(...ACC)}, ${R(...EXPR)}`],
      ['隨機少年', `1boy, solo, ${R('short hair', 'messy hair', 'medium hair', 'undercut', 'ponytail')}, ${R(...HAIR_COLOR)}, ${R(...EYES)}, ${R('military uniform', 'suit and tie', 'school uniform', 'knight armor', 'hoodie', 'trench coat', 'kimono')}, ${R('serious', 'smile', 'smirk', 'expressionless')}`],
      ['隨機場景（無人）', `no humans, scenery, ${R(...SCENE)}, ${R(...WEATHER)}, ${R(...LIGHT)}`],
      ['隨機畫風', R(...STYLE)],
      ['隨機鏡頭', R(...CAMERA)],
      ['隨機光線', R(...LIGHT)],
      ['隨機天氣', R(...WEATHER)],
      ['隨機配色', R(...PALETTE)],
      ['隨機飾品 ×2', `${R(...ACC)}, ${R(...ACC)}`],
      ['全隨機（大雜燴）', `1girl, solo, ${R(...RACE)}, ${R(...HAIR_COLOR)}, ${R(...HAIR_STYLE)}, ${R(...EYES)}, ${R(...OUTFIT)}, ${R(...ACC)}, ${R(...POSE)}, ${R(...EXPR)}, ${R(...SCENE)}, ${R(...WEATHER)}, ${R(...LIGHT)}, ${R(...CAMERA)}, ${R(...STYLE)}`],
      '主題隨機',
      ['奇幻冒險', `1girl, fantasy, ${R('knight', 'mage', 'elf archer', 'priestess', 'alchemist', 'dragon girl')}, ${R('ancient ruins', 'enchanted forest', 'castle', 'floating islands', 'crystal cave')}, ${R('magic circle', 'glowing runes', 'floating particles', 'sword', 'staff')}`],
      ['哥德暗黑', `1girl, gothic, ${R('vampire', 'nun', 'witch', 'doll', 'reaper')}, ${R('cathedral', 'graveyard', 'moonlit castle', 'rose garden at night')}, ${R('red and black', 'roses', 'candles', 'chains', 'crosses')}, dark atmosphere`],
      ['賽博龐克', `1girl, cyberpunk, ${R('android', 'hacker', 'mercenary', 'idol')}, ${R('neon city', 'rainy alley', 'rooftop', 'arcade')}, ${R('neon lights', 'holograms', 'glowing tattoos', 'visor')}, night`],
      ['和風', `1girl, japanese, ${R('kimono', 'yukata', 'shrine maiden', 'kunoichi')}, ${R('torii', 'shrine', 'bamboo forest', 'festival lanterns', 'cherry blossom river')}, ${R('fox mask', 'oil-paper umbrella', 'katana', 'fan')}`],
      ['日常治癒', `1girl, slice of life, ${R('cafe', 'bedroom', 'classroom', 'park bench', 'bookstore', 'kitchen')}, ${R('sweater', 'casual clothes', 'apron', 'pajamas')}, ${R('smile', 'sleepy', 'reading', 'drinking tea')}, soft lighting`],
      ['海洋夏日', `1girl, summer, ${R('beach', 'seaside', 'pool', 'underwater', 'sunflower field')}, ${R('swimsuit', 'sundress', 'straw hat')}, ${R('blue sky', 'sparkling water', 'cumulonimbus clouds')}`],
      ['星空夢境', `1girl, dreamy, ${R('starry sky', 'nebula', 'galaxy', 'moon')}, ${R('floating', 'lying on clouds', 'reaching for stars')}, ${R('star hair ornament', 'translucent dress', 'glowing particles')}, ethereal`],
      ['冬日', `1girl, winter, ${R('snowy street', 'snowy forest', 'frozen lake', 'christmas market')}, ${R('scarf', 'coat', 'earmuffs', 'mittens')}, snow, ${R('breath', 'warm light', 'blush')}`],
    ],
  },
  {
    id: 'char', name: '角色', icon: '♛', items: [
      '隨機欄位',
      ['髮型', R(...HAIR_STYLE)], ['髮色', R(...HAIR_COLOR)], ['瞳色', R(...EYES)], ['服裝', R(...OUTFIT)], ['表情', R(...EXPR)],
      ['姿勢', R(...POSE)], ['飾品', R(...ACC)], ['種族 / 職業', R(...RACE)],
      '人數',
      ['單人少女', '1girl, solo'], ['單人少年', '1boy, solo'], ['雙人', '2girls'], ['男女', '1girl, 1boy'], ['多人', 'multiple girls'],
      '構圖',
      ['半身', 'upper body, looking at viewer'], ['全身', 'full body, standing'], ['特寫', 'portrait, close-up'], ['膝上', 'cowboy shot'],
      '髮型（固定）', ...HAIR_STYLE.slice(0, 12).map(x => [x.replace(' hair', ''), x]),
      '服裝（固定）', ...OUTFIT.slice(0, 16).map(x => [x, x]),
    ],
  },
  {
    id: 'scene', name: '場景氛圍', icon: '☾', items: [
      ['隨機場景', R(...SCENE)],
      '地點', ...SCENE.map(x => [x.split(',')[0], x]),
      '天氣 / 季節', ...WEATHER.map(x => [x, x]),
    ],
  },
  {
    id: 'light', name: '光影鏡頭', icon: '◐', items: [
      ['隨機光線', R(...LIGHT)], ['隨機鏡頭', R(...CAMERA)],
      '光線', ...LIGHT.map(x => [x, x]),
      '鏡頭 / 構圖', ...CAMERA.map(x => [x, x]),
    ],
  },
  {
    id: 'style', name: '畫風色調', icon: '🎨', items: [
      ['隨機畫風', R(...STYLE)], ['隨機配色', R(...PALETTE)],
      '畫風', ...STYLE.map(x => [x, x]),
      '配色', ...PALETTE.map(x => [x, x]),
      '品質',
      ['高畫質', 'masterpiece, best quality, amazing quality, very aesthetic, absurdres'], ['細節豐富', 'highly detailed, intricate details'],
      ['柔和', 'soft focus, dreamy'], ['銳利', 'sharp focus'], ['精緻眼睛', 'beautiful detailed eyes'],
    ],
  },
  {
    id: 'item', name: '道具物品', icon: '⚔', asset: true, items: [
      ['寶劍', 'ornate sword, jeweled hilt'], ['魔杖', 'magic staff, glowing crystal tip'], ['藥水', 'potion bottle, glowing liquid, cork'],
      ['古書', 'ancient spell book, leather cover, gold clasp'], ['鑰匙', 'antique key, ornate bow'], ['王冠', 'jeweled crown'],
      ['懷錶', 'pocket watch, open lid, chain'], ['寶箱', 'treasure chest, gold coins'], ['提燈', 'vintage lantern, warm light'],
      ['玻璃罩玫瑰', 'rose in glass dome'], ['羽毛筆', 'quill pen, ink bottle'], ['塔羅牌', 'tarot card, ornate border'],
      ['寶石', '<ruby|sapphire|emerald|amethyst> gemstone, faceted'], ['項鍊', 'pendant necklace, gem'], ['盾牌', 'heraldic shield'],
      ['沙漏', 'ornate hourglass, glowing sand'], ['水晶球', 'crystal ball on stand'], ['魔法卷軸', 'magic scroll, wax seal'], ['弓箭', 'elegant bow and arrows'],
      ['茶具', 'porcelain teacup and teapot'], ['蛋糕', 'decorated cake, strawberries'], ['八音盒', 'music box, ballerina'], ['蠟燭', 'candelabra, lit candles'],
      ['隨機道具', '<ornate sword|crystal potion bottle|antique key|spell book|pocket watch|lantern|treasure chest|hourglass|crystal ball|music box>'],
    ],
  },
  {
    id: 'deco', name: '裝飾邊框', icon: '❦', asset: true, items: [
      ['華麗相框', 'ornate frame border, empty center'], ['蕾絲角花', 'lace corner ornament'], ['緞帶橫幅', 'ribbon banner, scroll'],
      ['花環', 'floral wreath, circle'], ['哥德花紋分隔線', 'gothic filigree divider, horizontal'], ['徽章紋章', 'crest emblem, symmetrical'],
      ['新藝術邊框', 'art nouveau border'], ['寶石鏈', 'chain and gem garland'], ['蝴蝶結', 'big ribbon bow'],
      ['羽翼', 'pair of angel wings, spread'], ['十字星', 'four-pointed star ornament'], ['名牌框', 'name plate frame, ornate, empty'],
      ['月亮裝飾', 'crescent moon ornament, stars'], ['藤蔓', 'twisting vines, roses'], ['雪花結晶', 'snowflake crystal ornament'], ['鐘錶齒輪', 'clockwork gears ornament'],
      '材質', ['金箔', 'gold leaf'], ['銀絲', 'silver filigree'], ['玫瑰金', 'rose gold'], ['黑鐵金', 'black iron and gold'], ['水晶', 'clear crystal'], ['琺瑯', 'enamel'],
    ],
  },
  {
    id: 'text', name: '文字標題', icon: 'Aa', asset: true, items: [
      ['文字內容', 'text "YOUR TEXT"'], ['哥德字', 'ornate gothic lettering'], ['書法標誌', 'elegant calligraphy logo'],
      ['金屬 3D 標題', 'metallic 3d title logo'], ['霓虹字', 'neon sign lettering'], ['雕刻燙金', 'engraved gold typography'],
      ['可愛圓體', 'cute rounded bubble lettering'], ['手寫簽名', 'handwritten signature'], ['遊戲 LOGO', 'game title logo, emblem behind'],
      ['SSR 字樣', 'text "SSR", shiny gold lettering'], ['日式毛筆', 'japanese brush calligraphy'], ['像素字', 'pixel font lettering'], ['冰晶字', 'ice crystal lettering'],
    ],
  },
  {
    id: 'fx', name: '光效美化', icon: '✦', asset: true, items: [
      ['魔法陣', 'magic circle, glowing runes'], ['閃光爆發', 'sparkle burst'], ['光點粒子', 'glowing particles, bokeh'],
      ['光束', 'light rays, god rays'], ['星團', 'star cluster, twinkling'], ['水晶碎片', 'floating crystal shards'],
      ['花瓣旋風', 'flower petals swirl'], ['羽毛飄散', 'feathers scatter'], ['泡泡', 'iridescent bubbles'],
      ['火焰', 'magic flame'], ['閃電', 'lightning bolt, electric'], ['煙霧', 'mystic smoke wisps'], ['水花', 'water splash'], ['極光帶', 'aurora ribbon'],
      '色調', ['金光', 'golden light'], ['藍光', 'blue glow'], ['彩虹', 'rainbow iridescent'], ['粉光', 'pink glow'], ['紫光', 'violet glow'],
    ],
  },
  {
    id: 'sticker', name: '貼圖圖示', icon: '☺', asset: true, items: [
      ['Q 版貼圖', 'chibi sticker, white outline, die-cut'], ['表情包', 'emote, expressive face, sticker'], ['小圖示', 'game ui icon, flat'],
      ['像素風', 'pixel art sprite'], ['徽章', 'enamel pin badge'], ['對話框', 'speech bubble, comic style'], ['壓克力立牌', 'acrylic stand figure'], ['吉祥物', 'mascot character, simple'],
    ],
  },
];

export const ASSET_TIPS = '透明素材建議：模型選 V5、勾選「透明背景」，提示詞以 no humans、single object、isolated 開頭，背景就會是透明的 PNG。';
