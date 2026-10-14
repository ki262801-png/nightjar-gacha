# Danbooru 詞庫產生工具

依序執行（會連 danbooru.donmai.us 的公開 API，只讀不寫）：

1. `python fetch.py`：下載 Danbooru 的 tag group 維基頁到 wiki/
2. `python parse.py`：把維基頁拆成（段落, TAG）清單 → parsed.json
3. `python counts.py`：查每個 TAG 的使用次數與類別 → counts.json
4. `python classify.py`：依規則分到本站的詞庫分類，去掉成人 / 獵奇 TAG，使用次數 < 150 的不收 → cats.json
5. `python extra.py`：補幾個天氣、天空、構圖的常用 TAG
6. `python build.py`：套上 zh*.txt 的中文名（值是 - 的代表不收），輸出 tags_final.json

把 tags_final.json 複製到 web/data/tags.json 就完成。combos.txt 是「顏色＋名詞」的組合 TAG（離線翻譯用），已嵌在 web/js/promptlib.js。
