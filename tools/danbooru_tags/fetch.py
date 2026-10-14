import json, time, urllib.request, urllib.parse, os, sys
UA = {'User-Agent': 'NightjarGacha/1.0 (personal tag library builder)'}
def get(url):
    for i in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r: return json.load(r)
        except Exception as e:
            print('retry', url, e, file=sys.stderr); time.sleep(2 + i * 3)
    raise SystemExit('fail ' + url)
if __name__ != "__main__": pass
GROUPS = ['Character count','Jobs','Legendary creatures','Hair color','Hair styles','Eyes tags','Face tags','Ears tags','Skin color','Wings','Posture','Gestures','Hands',
 'Attire','Headwear','Handwear','Legwear','Sleeves','Neck and neckwear','Accessories','Eyewear','Makeup','Fashion style',
 'Backgrounds','Locations','Lighting','Colors','Image composition','Focus tags','Visual aesthetic','Patterns','Theme','Holidays and celebrations',
 'Food tags','Flowers','Holding tags','Water','Fire','Technology','Dances','Verbs and Gerunds','Symbols','Artistic license','Body parts','Feet','Shoulders','Cats','Dogs','Birds']
EXTRA = ['List of animals','List of weapons','Plant','Tree','List of armor','Weather']
if __name__ == '__main__':
  os.makedirs('wiki', exist_ok=True)
  for g in GROUPS + EXTRA:
    title = ('tag_group:' + g if g in GROUPS else g).lower().replace(' ', '_')
    fn = 'wiki/' + title.replace(':', '__') + '.json'
    if os.path.exists(fn): continue
    d = get('https://danbooru.donmai.us/wiki_pages/' + urllib.parse.quote(title) + '.json')
    json.dump(d, open(fn, 'w', encoding='utf-8'), ensure_ascii=False)
    print(title, len(d.get('body', '')))
    time.sleep(.6)
