import json, re, glob, os
out = {}
for fn in sorted(glob.glob('wiki/*.json')):
    page = os.path.basename(fn)[:-5]
    body = json.load(open(fn, encoding='utf-8')).get('body', '')
    sec = ''; items = []
    for line in body.splitlines():
        m = re.match(r'h[3-6](?:#[\w-]+)?\.\s*(.+)', line.strip())
        if m: sec = re.sub(r'\[\[([^\]|]+)(?:\|[^\]]*)?\]\]', r'\1', m.group(1)).strip(); continue
        for lk in re.findall(r'\[\[([^\]]+)\]\]', line):
            name = lk.split('|')[0].strip().lower()
            if re.match(r'(tag ?group|list of|howto|help|about|tag groups?$)', name) or ':' in name and not name.startswith(':'):
                continue
            name = name.replace(' ', '_')
            items.append((sec, name))
    out[page] = items
json.dump(out, open('parsed.json', 'w', encoding='utf-8'), ensure_ascii=False)
allt = {t for v in out.values() for _, t in v}
print(len(allt), {k: len(v) for k, v in out.items()})
