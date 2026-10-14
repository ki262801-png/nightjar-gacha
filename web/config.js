// 部署設定（一般的 script，不是模組）
// 本機版不用改：留空就會自動使用本機伺服器
// 線上版：把 relay 改成你的 Cloudflare Worker 網址，例如 'https://nightjar-relay.你的帳號.workers.dev'
//（tools/build.py 打包線上版時會自動寫入）
window.NJ_CONFIG = {
  relay: '',
};
