import json, re
P = json.load(open('parsed.json', encoding='utf-8')); C = json.load(open('counts.json'))
MIN = 150
# (page, section regex or None) -> category id ; first match wins, order matters
RULES = [
 ('character_count', r'^(Girls|Boys|Others|Counting People|When to use solo|Counting Sexes)', 'count'),
 ('legendary_creatures', None, 'race'),
 ('cats', r'^Cat girls', 'race'), ('dogs', r'^Dog girls', 'race'),
 ('jobs', r'^(?!Sexual)', 'job'),
 ('skin_color', r'^(|Natural colors|Unnatural colors|Alternate materials)$', 'skin'),
 ('wings', r'^(|Number of wings|Size|Types|Insect Wings|Elemental wings|Artificial Wings|Colors \(Solid\)|Color Variations|Misc)', 'wings'),
 ('ears_tags', r'^(Animal ears|Other ears|Misc)', 'ears'),
 ('hair_styles', r'^Length and volume', 'hairlen'),
 ('hair_styles', r'^(Hair texture)', 'hairtex'),
 ('hair_styles', r'^(Front of the head|Top of the head|Back of the head)', 'bangs'),
 ('hair_styles', None, 'hairstyle'),
 ('hair_color', None, 'haircolor'),
 ('eyes_tags', r'^(Individual colors|Multiple colors of the iris)', 'eyecolor'),
 ('eyes_tags', r'^(Gazes)', 'gaze'),
 ('eyes_tags', r'^(Emotions and expressions|One or two eyes closed)', 'expr'),
 ('eyes_tags', r'^(Form of|Colors of the pupils|Sclera|Around the eyes|Animal or inhuman|Stylistic eyes|Number of eyes|Misc)', 'eyestyle'),
 ('face_tags', r'^(Emotions|Smile|Smug|Surprised|Main|Misc|Looking)', 'expr'),
 ('face_tags', r'^(Emotes|Drawing styles|Meme faces)', 'emote'),
 ('symbols', r'^Symbols of emotions', 'emote'),
 ('makeup', r'^(|Types of Makeup|Colors)$', 'makeup'),
 ('attire', r'^Shirts', 'top'), ('attire', r'^Pants', 'bottom'), ('attire', r'^Uniforms', 'uniform'),
 ('attire', r'^Traditional', 'traditional'), ('attire', r'^Swimsuits', 'swim'), ('attire', r'^Shoes', 'shoes'),
 ('attire', r'^Legs and Feet', 'legwear'), ('attire', r'^(Patterns|Prints)', 'print'), ('attire', r'^Headwear', 'headwear'),
 ('attire', r'^(Head and Face|Neck and Shoulders|Limbs|Torso and Misc|Other)', 'clothmisc'),
 ('legwear', r'^(?!See also)', 'legwear'),
 ('sleeves', r'^(Length|Type|Sleeveless|Trim|Clothing with abnormal|Patterns|Miscellaneous)', 'sleeves'),
 ('handwear', r'^(Gloves|Asymmetrical|Other handwear|Glove (Materials|trims|prints|colors))', 'gloves'),
 ('handwear', r'^(Rings|Hand Accessories|Hand markings)', 'jewelry'),
 ('headwear', r'^(?!(Not headwear|Actions))', 'headwear'),
 ('accessories', r'^Head', 'headwear'),
 ('neck_and_neckwear', r'^(?!(Anatomy|Actions|Neckwear actions))', 'neckwear'),
 ('accessories', r'^Neck', 'neckwear'),
 ('accessories', None, 'jewelry'),
 ('eyewear', r'^(Main|Frame colors|Lens colors|Types|Sunglasses|Accessories)', 'eyewear'),
 ('fashion_style', r'^(?!See also)', 'fashion'),
 ('list_of_armor', r'^(?!(See also|Personalities))', 'armor'),
 ('posture', r'^(Posture of at least|Hugging|Carrying)', 'duo'),
 ('hands', r'^Hands on another', 'duo'),
 ('posture', r'^(Basic arm|More specific arm|Hand position|Hands touching)', 'arms'),
 ('hands', r'^(Hands on self - (Shoulders|Upper)|Hands somewhere)', 'arms'),
 ('posture', None, 'pose'),
 ('gestures', None, 'gesture'),
 ('dances', None, 'action'),
 ('verbs_and_gerunds', None, 'action'),
 ('holding_tags', r'^(Weapons|Melee|Ranged|Thrown|Ammunition)', 'holdweapon'),
 ('holding_tags', r'^(?!(Sexual|Smoking|See Also|Another Person|Body Part|Own Body))', 'holding'),
 ('image_composition', r'^(View Angle|Perspective)', 'angle'),
 ('image_composition', r'^(Framing the body)', 'framing'),
 ('image_composition', r'^(Composition)', 'composition'),
 ('image_composition', r'^(Format)', 'format'),
 ('image_composition', r'Pattern', 'pattern'),
 ('image_composition', r'^(Styles|Techniques|Traditional media)', 'artstyle'),
 ('image_composition', r'^(Subject matter)', 'subject'),
 ('focus_tags', r'^(Objects|Other|Gender|)$', 'composition'),
 ('visual_aesthetic', None, 'artstyle'),
 ('patterns', r'^(?!See)', 'pattern'),
 ('backgrounds', None, 'bg'),
 ('locations', r'^Indoors', 'indoor'),
 ('locations', r'^Natural', 'nature'), ('plant', r'^Locations', 'nature'), ('tree', r'^Habitats', 'nature'),
 ('locations', r'^(Man-made|Buildings|Places of worship|Other)', 'building'),
 ('water', None, 'weather'), ('weather', None, 'weather'),
 ('fire', r'^(?!Weapons)', 'fire'),
 ('holidays_and_celebrations', None, 'holiday'),
 ('lighting', None, 'light'),
 ('colors', r'^(?!See also)', 'color'),
 ('list_of_weapons', r'^(Melee|Ranged \(non|Miscellaneous weapons|Design traits)', 'weapon'),
 ('list_of_weapons', r'^(Artillery|Bomb|Cannon|Grenade|Launchers|Rocket|Antique|Revolver|Semi|Other$|Heavy|Light machine|Medium|Anti|Assault|Bolt|Sniper|Shotgun|Conventional|Submachine|energy)', 'gun'),
 ('technology', None, 'tech'),
 ('food_tags', r'^(Fruit|Vegetable)', 'fruit'),
 ('food_tags', r'^(Sweets|Other Snacks|Dairy)', 'sweets'),
 ('food_tags', r'^(Meat|Breads|Condiments|Meal Items)', 'meal'),
 ('food_tags', r'^(Drink$|Drink / Condiment|Utensils)', 'drink'),
 ('flowers', None, 'flower'),
 ('plant', r'^(|Types|Parts|Other)$', 'plant'), ('tree', r'^(|Parts|Types|Other)$', 'plant'),
 ('list_of_animals', None, 'animal'), ('birds', r'^(Real birds|Mythological)', 'animal'),
 ('cats', r'^(Main|Colors|Markings|Feline relatives|Cats do)', 'animal'), ('dogs', r'^(Main|Tagged Breeds|Similar|Misc)', 'animal'),
 ('symbols', r'^(Two-dimensional|Three-dimensional|Musical|Playing Card|Cross|Misc symbols|Solar|Text)', 'symbol'),
]
BAD = set('''nipple nipples breast breasts pussy penis sex nude naked ass butt panties underwear bra lingerie crotch groin cameltoe
areola areolae erection testicles orgasm ahegao bondage bdsm fellatio masturbation condom bulge cleavage pantyshot upskirt lactation
rape torture guro gore loli shota toddler pubic_hair genitals fetish strap_slip nsfw cunnilingus paizuri futanari yaoi yuri
insertion bukkake creampie dildo vibrator handjob footjob titjob molestation thong g-string topless bottomless censored uncensored
undressing exhibitionism spread_legs nipple_slip wardrobe_malfunction armpits saliva drool blood injury corpse death suicide hanging
decapitation severed_head amputee dismemberment vomit pee peeing urine smoking cigarette cigar vape holding_cigarette
gun_to_head bikini_pull covering_breasts covering_crotch flat_chest huge_breasts large_breasts small_breasts medium_breasts
navel_piercing nipple_piercing licking erect_nipples ass_visible_through_thighs thigh_gap skindentation'''.split())
BADSUB = re.compile(r'(nipple|breast|pussy|penis|sex|nude|naked|_cum$|^cum_|panties|underwear|lingerie|crotch|bondage|bdsm|orgasm|erection|cleavage|pantyshot|upskirt|\bloli|shota|censor|_bra$|^bra$|^bra_|thong|topless|bottomless|see-through|_lift$|_pull$|undress|grop|_ass$|^ass_|butt|areola|testicle|vagin|anus|anal_|pubic|blood|gore|guro|corpse|lewd|fetish|bondage|slave|leash|gag$|_gag)')
cats = {}
seen = set()
for page_key, items in P.items():
    page = page_key.replace('tag_group__', '')
    for sec, t in items:
        v = C.get(t)
        if not v or v[1] != 0 or v[0] < MIN or t in seen: continue
        if t in BAD or BADSUB.search(t): continue
        for pg, rx, cid in RULES:
            if pg == page and (rx is None or re.match(rx, sec)):
                cats.setdefault(cid, []).append((t, v[0])); seen.add(t); break
for k in cats: cats[k].sort(key=lambda x: -x[1])
json.dump(cats, open('cats.json', 'w', encoding='utf-8'), ensure_ascii=False)
print(sum(len(v) for v in cats.values()))
print({k: len(v) for k, v in cats.items()})
