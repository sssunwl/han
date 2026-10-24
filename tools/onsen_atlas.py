"""
溫泉旅館的素材打包。

LimeZu Modern Interiors 的授權:可以用在自己的遊戲,但「不能散佈素材本身」,要標 credit。
han 是 public repo,所以原始素材包絕對不進 repo。這支腳本從本機的素材包裡
只裁出遊戲用到的那幾格,打包成 public/onsen/atlas.png + atlas.json。

用法(素材包換位置時改 LIMEZU 或設環境變數 LIMEZU):
  python3 tools/onsen_atlas.py            # 產生 atlas
  python3 tools/onsen_atlas.py --preview  # 另外輸出一張標了名字的預覽圖(不進 repo)
"""
import json, os, sys
from PIL import Image, ImageDraw

LIMEZU = os.environ.get('LIMEZU', '/Users/sws/Sun/Claude/AIoffice/limezu.itch.io/moderninteriors-win')
T = 32
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'public', 'onsen')

SHEETS = {
    'JP': '1_Interiors/32x32/Theme_Sorter_32x32/20_Japanese_interiors_32x32.png',
    'BA': '1_Interiors/32x32/Theme_Sorter_32x32/3_Bathroom_32x32.png',
    'GR': '1_Interiors/32x32/Theme_Sorter_32x32/16_Grocery_store_32x32.png',
    'FL': '1_Interiors/32x32/Room_Bulder_subfiles_32x32/Room_Builder_Floors_32x32.png',
    'LR': '1_Interiors/32x32/Theme_Sorter_32x32/2_LivingRoom_32x32.png',
    'MU': '1_Interiors/32x32/Theme_Sorter_32x32/6_Music_and_sport_32x32.png',
}

# 名字: (圖, x, y, w, h) —— 以 32px 格為單位;FL 地板用像素
SPRITES = {
    # 和室
    'tatami':      ('JP', 0, 2, 2, 2),
    'futon_top':   ('JP', 1, 16, 2, 1),
    'futon_blue':  ('JP', 1, 17, 2, 1),
    'futon_gold':  ('JP', 1, 18, 2, 1),
    'futon_gray':  ('JP', 1, 19, 2, 1),
    'futon_purple':('JP', 1, 20, 2, 1),
    'zabuton':     ('JP', 0, 4, 1, 1),
    'lowtable':    ('JP', 1, 4, 2, 2),
    'kotatsu':     ('JP', 0, 9, 2, 2),
    'teatable':    ('JP', 12, 5, 2, 2),
    'scroll1':     ('JP', 14, 0, 1, 2),
    'scroll2':     ('JP', 15, 0, 1, 2),
    'vase':        ('JP', 11, 3, 1, 2),
    'bonsai_s':    ('JP', 6, 7, 1, 2),
    'bonsai_l':    ('JP', 7, 8, 1, 3),
    'shoji_win':   ('JP', 9, 7, 3, 2),
    'irori':       ('JP', 12, 7, 2, 1),
    'heater':      ('JP', 13, 8, 1, 1),
    'tansu':       ('JP', 6, 12, 1, 3),
    'altar':       ('JP', 8, 12, 1, 3),
    'bench':       ('JP', 5, 3, 2, 2),
    'rock':        ('JP', 14, 17, 2, 2),
    'dining':      ('JP', 14, 19, 2, 3),
    'dining_g':    ('JP', 14, 25, 2, 3),
    'genkan':      ('JP', 10, 19, 2, 1),
    # 浴場
    'tub':         ('BA', 6, 12, 2, 3),
    'bucket':      ('BA', 8, 12, 1, 1),
    'bucket_blue': ('BA', 9, 12, 1, 1),
    'duck':        ('BA', 9, 10, 1, 1),
    'shower':      ('BA', 9, 18, 1, 2),
    'screen':      ('BA', 4, 0, 3, 3),
    'sink':        ('BA', 7, 6, 2, 2),
    # 土產店、櫃台、庭園
    'counter':     ('GR', 0, 58, 3, 2),
    'crates_a':    ('GR', 4, 60, 2, 3),
    'crates_b':    ('GR', 6, 60, 2, 3),
    'flowers':     ('GR', 12, 61, 2, 2),
    'garland':     ('GR', 13, 57, 3, 2),
    'bush':        ('GR', 4, 65, 1, 2),
    # 休憩室、卡拉OK、擺設(v2 新增)
    'sofa':        ('LR', 1, 28, 3, 2),
    'sofa_w':      ('LR', 4, 28, 3, 2),
    'bookshelf':   ('LR', 10, 24, 2, 2),
    'fireplace':   ('LR', 4, 24, 2, 2.15),
    'palm':        ('LR', 13.5, 22, 1, 2),
    'plant':       ('LR', 15, 22, 1, 2),
    'fishbowl':    ('LR', 1, 25, 1, 1),
    'pot':         ('LR', 0, 23, 1, 1),
    'speaker':     ('MU', 6, 0, 1, 3),
    'speaker_s':   ('MU', 7, 0, 1, 2),
    'mic':         ('MU', 7, 15, 1, 2),
    'mic2':        ('MU', 8, 15, 1, 2),
    'keyboard':    ('MU', 8, 17, 2, 1),
    'guitar':      ('MU', 10, 3, 1, 2),
    # 地板(像素座標,2×2 格可以重複鋪)
    'fl_wood':     ('FL', 0, 384, 64, 64),
    'fl_wood2':    ('FL', 128, 384, 64, 64),
    'fl_bath':     ('FL', 384, 960, 64, 64),
    'fl_stone':    ('FL', 384, 128, 64, 64),
    'fl_dining':   ('FL', 0, 448, 64, 64),
}

# 人物:只取「待機」與「走路」兩列(各 4 方向 × 6 格,每格 32×64)
CHARS = list(range(1, 21))          # 1~12 當客人,13 櫃台,14~20 員工(各職業用哪幾個見 data.js STAFF_ROLES)
CHAR_SHEET = '2_Characters/Character_Generator/0_Premade_Characters/32x32/Premade_Character_32x32_{:02d}.png'


def load(key, cache={}):
    if key not in cache:
        cache[key] = Image.open(os.path.join(LIMEZU, SHEETS[key])).convert('RGBA')
    return cache[key]


def main():
    pieces = []
    for name, (sheet, x, y, w, h) in SPRITES.items():
        box = (x, y, x + w, y + h) if sheet == 'FL' else tuple(int(v * T) for v in (x, y, x + w, y + h))
        pieces.append((name, load(sheet).crop(box)))
    for i in CHARS:
        im = Image.open(os.path.join(LIMEZU, CHAR_SHEET.format(i))).convert('RGBA')
        pieces.append((f'char{i}', im.crop((0, 64, 24 * 32, 192))))   # 上半待機、下半走路

    # 簡單的貨架式打包:由高到矮排,一排排放
    pieces.sort(key=lambda p: -p[1].height)
    W, x, y, row_h, rects = 1024, 0, 0, 0, {}
    for name, im in pieces:
        if x + im.width > W:
            x, y, row_h = 0, y + row_h, 0
        rects[name] = [x, y, im.width, im.height]
        x += im.width; row_h = max(row_h, im.height)
    H = y + row_h
    atlas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    for name, im in pieces:
        r = rects[name]; atlas.paste(im, (r[0], r[1]))
    os.makedirs(OUT, exist_ok=True)
    atlas.save(os.path.join(OUT, 'atlas.png'), optimize=True)
    with open(os.path.join(OUT, 'atlas.json'), 'w') as f:
        json.dump(rects, f, separators=(',', ':'))
    print(f'atlas {W}x{H}, {len(rects)} 塊')

    if '--preview' in sys.argv:
        pv = atlas.copy(); d = ImageDraw.Draw(pv)
        for name, (rx, ry, rw, rh) in rects.items():
            d.rectangle([rx, ry, rx + rw - 1, ry + rh - 1], outline=(255, 0, 0, 255))
            d.text((rx + 2, ry + 1), name, fill=(255, 0, 0, 255))
        bg = Image.new('RGBA', pv.size, (220, 220, 220, 255)); bg.alpha_composite(pv)
        out = sys.argv[sys.argv.index('--preview') + 1] if len(sys.argv) > sys.argv.index('--preview') + 1 else 'atlas_preview.png'
        bg.save(out); print('preview →', out)


if __name__ == '__main__':
    main()
