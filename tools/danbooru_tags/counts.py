import json, time, urllib.request, urllib.parse, os, sys
from fetch import get
parsed = json.load(open('parsed.json', encoding='utf-8'))
names = sorted({t for v in parsed.values() for _, t in v})
counts = json.load(open('counts.json', encoding='utf-8')) if os.path.exists('counts.json') else {}
todo = [n for n in names if n not in counts]
for i in range(0, len(todo), 80):
    chunk = todo[i:i + 80]
    q = urllib.parse.urlencode({'search[name_comma]': ','.join(chunk), 'only': 'name,post_count,category', 'limit': 1000})
    res = get('https://danbooru.donmai.us/tags.json?' + q)
    for n in chunk: counts[n] = None
    for r in res: counts[r['name']] = [r['post_count'], r['category']]
    if i % 800 == 0:
        json.dump(counts, open('counts.json', 'w'), ensure_ascii=False); print(i, len(todo), flush=True)
    time.sleep(.4)
json.dump(counts, open('counts.json', 'w'), ensure_ascii=False)
ok = [n for n, v in counts.items() if v and v[1] == 0]
print('general', len(ok), '>=1000', sum(1 for n in ok if counts[n][0] >= 1000), '>=300', sum(1 for n in ok if counts[n][0] >= 300), 'missing', sum(1 for v in counts.values() if not v))
