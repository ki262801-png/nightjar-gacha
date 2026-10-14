import json, urllib.parse, time
from fetch import get
EXTRA = {
 'weather': 'rain snow snowing cloudy_sky blue_sky overcast fog mist lightning rainbow wind falling_petals falling_leaves autumn_leaves cherry_blossoms aurora storm thunderstorm sunbeam light_rays heavy_rain drizzle snowflakes hail sandstorm tornado cloud cumulonimbus_cloud',
 'sky': 'sky night_sky starry_sky sunset sunrise twilight dusk dawn day night evening gradient_sky orange_sky purple_sky red_sky moon full_moon crescent_moon sun shooting_star milky_way constellation planet nebula space outer_space earth_(planet) star_(sky) moonlight blood_moon eclipse solar_eclipse',
 'season': 'spring_(season) summer autumn winter',
 'count': '1girl 2girls 3girls 4girls multiple_girls 1boy 2boys multiple_boys solo solo_focus 1other no_humans',
 'composition': 'portrait upper_body cowboy_shot full_body close-up face wide_shot very_wide_shot lower_body feet_out_of_frame head_out_of_frame dutch_angle from_above from_below from_side from_behind straight-on pov looking_at_viewer looking_away looking_back looking_up looking_down profile three_quarter_view depth_of_field blurry_background bokeh foreshortening fisheye panorama symmetry rule_of_thirds centered silhouette reflection',
}
names = sorted({t for v in EXTRA.values() for t in v.split()})
found = {}
for i in range(0, len(names), 80):
    q = urllib.parse.urlencode({'search[name_comma]': ','.join(names[i:i + 80]), 'only': 'name,post_count,category', 'limit': 1000})
    for r in get('https://danbooru.donmai.us/tags.json?' + q): found[r['name']] = r['post_count']
    time.sleep(.4)
cats = json.load(open('cats.json', encoding='utf-8'))
have = {t for v in cats.values() for t, _ in v}
target = {'sky': 'weather', 'season': 'weather'}
added = 0
for k, v in EXTRA.items():
    for t in v.split():
        if t in found and found[t] >= 150 and t not in have:
            cats.setdefault(target.get(k, k), []).append((t, found[t])); have.add(t); added += 1
        elif t not in found: print('missing', t)
for k in cats: cats[k].sort(key=lambda x: -x[1])
json.dump(cats, open('cats.json', 'w', encoding='utf-8'), ensure_ascii=False)
print('added', added, 'total', sum(len(v) for v in cats.values()))
