// 智慧翻譯：把玩家的中文構圖描述，轉成 NovelAI 看得懂的提示詞
// 用玩家自己的 AI 金鑰，從瀏覽器直接送到該服務；金鑰只存在這台瀏覽器（localStorage），不進備份、不經過本站
const KEY = 'nightjar-ai';
export const AI_PROVIDERS = [
  ['gemini', 'Google Gemini（有免費額度）', 'https://generativelanguage.googleapis.com/v1beta', 'gemini-2.5-flash'],
  ['openai', 'OpenAI 相容（OpenAI / OpenRouter / DeepSeek / 本機 LM Studio、Ollama…）', 'https://api.openai.com/v1', 'gpt-4o-mini'],
  ['anthropic', 'Anthropic Claude', 'https://api.anthropic.com/v1', 'claude-haiku-4-5'],
];
export function aiConfig() {
  let c = {};
  try { c = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { }
  const p = AI_PROVIDERS.find(x => x[0] === c.provider) || AI_PROVIDERS[0];
  return { provider: p[0], base: c.base || p[2], model: c.model || p[3], key: c.key || '' };
}
export function setAiConfig(c) { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { } }
export const aiReady = () => !!aiConfig().key;

export const MODES = [
  ['tags', 'Danbooru TAG'],
  ['en', '英文自然語句'],
  ['ja', '日文自然語句'],
  ['mix', 'TAG ＋ 英文語句'],
];

const SYSTEM = `You write image prompts for NovelAI Diffusion (V4.5 / V5, anime models trained on Danbooru).
Rules:
- Output ONLY the prompt. No explanations, no quotes, no markdown.
- Danbooru tags: lowercase English, spaces instead of underscores, comma-separated, only tags that really exist on danbooru.donmai.us.
- Order: subject count (1girl / 2girls / 1boy / no humans) → character traits (hair, eyes, body) → outfit & accessories → expression & pose → action / held items → background & place → lighting & time → camera / composition.
- Do NOT add quality tags (masterpiece, best quality…) or artist tags unless the user asks for them.
- Keep it under about 60 tags or 120 words; NovelAI's prompt limit is 512 tokens.
- Natural-language sentences must be simple, concrete and visual (what is seen, where, how lit), no story or feelings that cannot be drawn.`;
const ASK = {
  tags: 'Convert to Danbooru tags only.',
  en: 'Write it as 1–3 clear English sentences (natural language), no tag list.',
  ja: 'Write it as 1–3 clear Japanese sentences (natural language), no tag list.',
  mix: 'First a Danbooru tag list, then ONE short English sentence describing the scene, all on one line separated by ", ".',
};

async function call(messages) {
  const c = aiConfig();
  if (!c.key) throw new Error('還沒設定 AI 金鑰（設定 → 連線 → 智慧翻譯）');
  const base = c.base.replace(/\/+$/, '');
  let r, j;
  if (c.provider === 'gemini') {
    r = await fetch(`${base}/models/${encodeURIComponent(c.model)}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': c.key },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: messages[0].content }] }, contents: messages.slice(1).map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })), generationConfig: { temperature: .4 } }),
    });
    j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error?.message || 'Gemini 回應 ' + r.status);
    return (j.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim();
  }
  if (c.provider === 'anthropic') {
    r = await fetch(`${base}/messages`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': c.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model: c.model, max_tokens: 800, system: messages[0].content, messages: messages.slice(1) }),
    });
    j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error?.message || 'Claude 回應 ' + r.status);
    return (j.content || []).map(p => p.text || '').join('').trim();
  }
  r = await fetch(`${base}/chat/completions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + c.key },
    body: JSON.stringify({ model: c.model, messages, temperature: .4 }),
  });
  j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error?.message || 'AI 服務回應 ' + r.status);
  return (j.choices?.[0]?.message?.content || '').trim();
}

/** 中文描述 → 提示詞；hints 是詞庫先對到的 TAG，給 AI 參考 */
export async function aiTranslate(text, mode = 'tags', hints = []) {
  const user = `${ASK[mode] || ASK.tags}\n${hints.length ? `Tags already matched from a Danbooru dictionary (keep the relevant ones): ${hints.join(', ')}\n` : ''}Description:\n${text}`;
  const out = await call([{ role: 'system', content: SYSTEM }, { role: 'user', content: user }]);
  return out.replace(/```[\w-]*/g, '').trim().replace(/^["「]|["」]$/g, '').replace(/\s*\n+\s*/g, ', ').replace(/(\w)_(\w)/g, '$1 $2').replace(/,\s*$/, '').trim();
}

/** 測試金鑰能不能用 */
export async function aiTest() {
  const t = await call([{ role: 'system', content: 'Reply with the single word OK.' }, { role: 'user', content: 'ping' }]);
  return t;
}
