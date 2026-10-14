"""重新產生繁→簡對照表 web/js/t2s-data.js（網頁的「繁 / 简」切換用）。

需要先安裝：python -m pip install opencc-python-reimplemented
用法：python tools/build_t2s.py

想調整某個詞怎麼轉，改下面的 CUSTOM 再執行一次即可。
"""
import json
from pathlib import Path

import opencc
from opencc import OpenCC

ROOT = Path(__file__).resolve().parents[1]
DICT = Path(opencc.__file__).parent / 'dictionary'

# 本站介面用語：補充 OpenCC 沒有的，或修正不適合這個網站的大陸技術用語
CUSTOM = {
    '設定': '设置', '預設': '默认', '重新整理': '刷新', '游標': '光标', '伺服器': '服务器', '影片': '视频', '滑鼠': '鼠标',
    '資料夾': '文件夹', '檔案': '文件', '上傳': '上传', '下載': '下载', '螢幕': '屏幕', '解析度': '分辨率', '預覽': '预览',
    '視窗': '窗口', '連結': '链接', '訊息': '信息', '介面': '界面', '支援': '支持', '品質': '质量',
    '匯出': '导出', '匯入': '导入', '程式': '程序', '網路': '网络', '登入': '登录', '帳號': '账号', '快取': '缓存', '貼上': '粘贴',
    '儲存': '保存', '剪貼簿': '剪贴板', '演算法': '算法', '圖示': '图标', '選單': '菜单',
    # 保持一般用字，不換成技術用語
    '模擬': '模拟', '文字': '文字', '鐳射': '镭射', '新增': '新增', '複製': '复制', '啟用': '启用', '正規化': '标准化', '通道': '通道',
    '物件': '物品', '存檔': '存档', '截圖': '截图', '互動': '互动', '查詢': '查询', '機率': '概率', '欄位': '栏位', '牠': '它', '妳': '你',
}


def keys(name):
    out = []
    for line in (DICT / name).read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if line and not line.startswith('#'):
            out.append(line.split('\t')[0].split(' ')[0])
    return out


def main():
    cc = OpenCC('tw2sp')
    phrases = {}
    for f in ['TWPhrasesRev.txt', 'TWVariantsRevPhrases.txt', 'TSPhrases.txt']:
        for k in keys(f):
            if len(k) >= 2:
                v = cc.convert(k)
                if v != k:
                    phrases[k] = v
    phrases.update(CUSTOM)
    chars = {}
    for f in ['TSCharacters.txt', 'TWVariantsRev.txt']:
        for k in keys(f):
            if len(k) == 1:
                v = cc.convert(k)
                if v != k and len(v) == 1:
                    chars[k] = v
    pairs = ''.join(k + v for k, v in sorted(chars.items()))
    ph = sorted(phrases.items(), key=lambda kv: -len(kv[0]))
    js = ('// 繁 → 簡對照表（由 OpenCC 的 tw2sp 字典產生，Apache License 2.0：https://github.com/BYVoid/OpenCC）\n'
          '// CHARS：每兩個字一組（繁、簡）；PHRASES：台灣用語 → 大陸用語（含本站介面用語的修正）\n'
          '// 重新產生：見 tools/build_t2s.py\n'
          f'export const CHARS = {json.dumps(pairs, ensure_ascii=False)};\n'
          f'export const PHRASES = {json.dumps(ph, ensure_ascii=False, separators=(",", ":"))};\n')
    (ROOT / 'web' / 'js' / 't2s-data.js').write_text(js, encoding='utf-8')
    print(f'完成：{len(chars)} 個字、{len(phrases)} 個詞')


if __name__ == '__main__':
    main()
