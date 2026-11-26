"""Gera as figurinhas de meme do Zapfig.

Uso: python3 scripts/make_memes.py <pasta_de_trabalho> <pasta_saida>
- lê scripts/memes.json
- imagens: Cloudflare Workers AI (flux-2-klein-4b), via CLOUDFLARE_API_TOKEN
- recorta o fundo, põe contorno branco e o texto no estilo meme (fonte Anton)
- animações simples (pulsar, tremer, zoom) em WebP animado
- sons: efeitos de meme do MyInstants (via a API do Zapfig), convertidos para OGG Opus
"""
import base64
import io
import json
import math
import os
import subprocess
import sys
import time
import urllib.parse
import urllib.request

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(__file__))
from cutout import cutout  # noqa: E402

WORK, OUT = sys.argv[1], sys.argv[2]
os.makedirs(WORK, exist_ok=True)
os.makedirs(os.path.join(OUT, 'audio'), exist_ok=True)
SPEC = json.load(open(os.path.join(os.path.dirname(__file__), 'memes.json'), encoding='utf-8'))
TOKEN = os.environ['CLOUDFLARE_API_TOKEN']
ACCOUNT = '762fe93850d238b22cac17ead40753c7'
MODEL = '@cf/black-forest-labs/flux-2-klein-4b'
ZAPFIG = 'https://zapfig.site'
FONT = os.path.join(WORK, 'Anton.ttf')
STYLE = ('die-cut vinyl sticker, thick clean white border around the character, bold cartoon illustration, '
         'flat vibrant colors, simple shapes, expressive face, centered, single character, '
         'isolated on a plain flat solid medium gray (#808080) background, no text, no letters')


def generate(prompt, path):
    if os.path.exists(path):
        return
    boundary = '----zapfig' + str(time.time()).replace('.', '')
    parts = []
    for k, v in (('prompt', f'{prompt}, {STYLE}'), ('width', '1024'), ('height', '1024')):
        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n')
    body = (''.join(parts) + f'--{boundary}--\r\n').encode()
    req = urllib.request.Request(
        f'https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/ai/run/{MODEL}', data=body, method='POST',
        headers={'Authorization': f'Bearer {TOKEN}', 'Content-Type': f'multipart/form-data; boundary={boundary}'})
    for attempt in range(4):
        try:
            d = json.load(urllib.request.urlopen(req, timeout=120))
            open(path, 'wb').write(base64.b64decode(d['result']['image']))
            return
        except Exception as e:  # noqa: BLE001
            print('  tentativa', attempt + 1, 'falhou:', e)
            time.sleep(4)
    raise SystemExit('não consegui gerar ' + path)


def draw_text(img, top, bottom):
    d = ImageDraw.Draw(img)
    W = img.width
    for text, pos in ((top, 'top'), (bottom, 'bottom')):
        if not text:
            continue
        size = 92
        while size > 30:
            f = ImageFont.truetype(FONT, size)
            if d.textlength(text, font=f) <= W - 40:
                break
            size -= 4
        bbox = d.textbbox((0, 0), text, font=f, stroke_width=max(5, size // 9))
        h = bbox[3] - bbox[1]
        y = 14 if pos == 'top' else W - h - 22
        x = (W - d.textlength(text, font=f)) / 2
        d.text((x, y - bbox[1]), text, font=f, fill='white', stroke_width=max(5, size // 9), stroke_fill='black')
    return img


def compose(src, it):
    base = cutout(src, outline=9)  # 512x512 RGBA
    # deixa espaço para o texto encolhendo a arte
    n_lines = (1 if it['top'] else 0) + (1 if it['bottom'] else 0)
    if n_lines:
        k = 0.80 if n_lines == 1 else 0.70
        art = base.resize((int(512 * k), int(512 * k)), Image.LANCZOS)
        canvas = Image.new('RGBA', (512, 512), (0, 0, 0, 0))
        y = (512 - art.height) // 2 + (-26 if it['bottom'] and not it['top'] else 0) + (14 if it['top'] and not it['bottom'] else 0)
        canvas.alpha_composite(art, ((512 - art.width) // 2, max(0, y)))
        base = canvas
    return draw_text(base, it['top'], it['bottom'])


def save_static(img, path):
    for q in (88, 80, 72, 64, 56, 48, 40):
        buf = io.BytesIO()
        img.save(buf, 'WEBP', quality=q, method=6)
        if buf.tell() <= 98 * 1024:
            break
    open(path, 'wb').write(buf.getvalue())


def frames_for(img, kind):
    out = []
    n = 16
    for i in range(n):
        t = i / n
        s, ang, dx = 1.0, 0.0, 0
        if kind == 'pulse':
            s = 1 + 0.07 * math.sin(2 * math.pi * t)
        elif kind == 'shake':
            ang = 6 * math.sin(4 * math.pi * t)
            dx = int(8 * math.sin(6 * math.pi * t))
        else:  # zoom: entra crescendo e assenta
            s = 0.72 + 0.36 * min(1.0, t * 3) - 0.08 * max(0.0, min(1.0, (t - 0.33) * 3))
        fr = img.rotate(ang, resample=Image.BICUBIC) if ang else img
        w = max(1, int(512 * s))
        fr = fr.resize((w, w), Image.LANCZOS)
        big = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
        big.alpha_composite(fr, ((1024 - w) // 2 + dx, (1024 - w) // 2))
        out.append(big.crop((256, 256, 768, 768)))
    return out


def save_animated(img, kind, path):
    frames = frames_for(img, kind)
    for q in (80, 70, 60, 50, 40):
        buf = io.BytesIO()
        frames[0].save(buf, 'WEBP', save_all=True, append_images=frames[1:], duration=70, loop=0, quality=q, method=4)
        if buf.tell() <= 480 * 1024:
            break
    open(path, 'wb').write(buf.getvalue())


def get_json(url):
    return json.load(urllib.request.urlopen(urllib.request.Request(url, headers={'user-agent': 'zapfig-build'}), timeout=60))


def fetch_sound(query, path):
    if os.path.exists(path):
        return True
    try:
        d = get_json(f'{ZAPFIG}/api/sounds/myinstants?q={urllib.parse.quote(query)}')
    except Exception as e:  # noqa: BLE001
        print('  busca de som falhou:', e)
        return False
    for item in d.get('items', [])[:4]:
        try:
            raw = urllib.request.urlopen(urllib.request.Request(ZAPFIG + item['url'], headers={'user-agent': 'zapfig-build'}), timeout=60).read()
        except Exception:  # noqa: BLE001
            continue
        mp3 = path + '.src'
        open(mp3, 'wb').write(raw)
        r = subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', mp3, '-t', '6', '-af', 'afade=t=out:st=5.6:d=0.4',
                            '-ac', '1', '-ar', '48000', '-c:a', 'libopus', '-b:a', '48k', path])
        os.remove(mp3)
        if r.returncode == 0 and os.path.getsize(path) > 1000:
            print(f'  som: "{item["title"]}"')
            return True
    return False


report = []
for it in SPEC:
    print('>>', it['id'])
    src = os.path.join(WORK, it['id'] + '.jpg')
    generate(it['prompt'], src)
    img = compose(src, it)
    webp = os.path.join(OUT, it['id'] + '.webp')
    if it['anim']:
        save_animated(img, it['anim'], webp)
    else:
        save_static(img, webp)
    has_sound = False
    if it['sound']:
        has_sound = fetch_sound(it['sound'], os.path.join(OUT, 'audio', it['id'] + '.ogg'))
    report.append({'id': it['id'], 'kb': round(os.path.getsize(webp) / 1024), 'animated': bool(it['anim']), 'sound': has_sound})
json.dump(report, open(os.path.join(WORK, 'report.json'), 'w'), indent=1)
print(json.dumps(report, ensure_ascii=False))
