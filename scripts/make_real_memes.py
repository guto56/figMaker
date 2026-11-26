"""Monta figurinhas com memes reais das fontes que o próprio site usa (Imgflip, KLIPY, MyInstants).

Uso: python3 scripts/make_real_memes.py <pasta_de_trabalho> <pasta_saida>
Lê scripts/real_memes.json. Tudo é baixado pela API pública do Zapfig (sem chaves aqui).
"""
import io
import json
import os
import subprocess
import sys
import time
import urllib.parse
import urllib.request

from PIL import Image, ImageDraw

WORK, OUT = sys.argv[1], sys.argv[2]
os.makedirs(os.path.join(WORK, 'src'), exist_ok=True)
os.makedirs(os.path.join(OUT, 'audio'), exist_ok=True)
SPEC = json.load(open(os.path.join(os.path.dirname(__file__), 'real_memes.json'), encoding='utf-8'))
H = 'https://zapfig.hrycsngb42.workers.dev'
UA = {'user-agent': 'zapfig-build', 'origin': H}


def get(url, binary=False):
    for attempt in range(6):
        try:
            r = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=90).read()
            time.sleep(1.1)  # respeita o limite de 60 buscas/min da própria API
            return r if binary else json.loads(r)
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(15)
                continue
            raise
    raise SystemExit('muitas tentativas: ' + url)


imgflip = None


def pick_media(it):
    global imgflip
    if it['src'] == 'imgflip':
        if imgflip is None:
            imgflip = get(f'{H}/api/media/memes')['items']
        for m in imgflip:
            if m['title'].lower() == it['q'].lower():
                return m
        raise SystemExit('não achei no Imgflip: ' + it['q'])
    d = get(f"{H}/api/media/klipy?type={it['src']}&q={urllib.parse.quote(it['q'])}")
    if not d['items']:
        raise SystemExit('KLIPY sem resultado: ' + it['q'])
    return d['items'][it.get('pick', 0)]


def ffmpeg(*args):
    r = subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', *args])
    return r.returncode == 0


def static_card(path_in, path_out, crop=None):
    """Imagem retangular → figurinha 512 com cantos arredondados e borda branca."""
    im = Image.open(path_in).convert('RGBA')
    if crop:
        W, H_ = im.size
        im = im.crop((int(crop[0] * W), int(crop[1] * H_), int(crop[2] * W), int(crop[3] * H_)))
    im.thumbnail((484, 484), Image.LANCZOS)
    w, h = im.size
    mask = Image.new('L', (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, w - 1, h - 1), radius=28, fill=255)
    im.putalpha(mask)
    border = Image.new('RGBA', (w + 16, h + 16), (0, 0, 0, 0))
    ImageDraw.Draw(border).rounded_rectangle((0, 0, w + 15, h + 15), radius=34, fill=(255, 255, 255, 255))
    border.alpha_composite(im, (8, 8))
    canvas = Image.new('RGBA', (512, 512), (0, 0, 0, 0))
    canvas.alpha_composite(border, ((512 - border.width) // 2, (512 - border.height) // 2))
    for q in (85, 75, 65, 55, 45, 35):
        buf = io.BytesIO()
        canvas.save(buf, 'WEBP', quality=q, method=6)
        if buf.tell() <= 98 * 1024:
            break
    open(path_out, 'wb').write(buf.getvalue())


def animated(path_in, path_out, fit, max_s=6):
    scale = ('scale=512:512:force_original_aspect_ratio=increase,crop=512:512' if fit == 'crop'
             else 'scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000')
    for fps, q in ((15, 70), (12, 55), (10, 45), (10, 35), (8, 28), (8, 20)):
        ok = ffmpeg('-t', str(max_s), '-i', path_in, '-vf', f'fps={fps},{scale}', '-an', '-c:v', 'libwebp', '-loop', '0',
                    '-quality', str(q), '-compression_level', '5', '-t', str(max_s), path_out)
        if ok and os.path.getsize(path_out) <= 490 * 1024:
            return True
    return ok


def audio_from(path_in, path_out, max_s=6):
    return ffmpeg('-t', str(max_s), '-i', path_in, '-vn', '-af', f'afade=t=out:st={max_s - 0.4}:d=0.4', '-ac', '1', '-ar', '48000',
                  '-c:a', 'libopus', '-b:a', '48k', path_out) and os.path.getsize(path_out) > 1500


def sound_for(query, path_out):
    d = get(f'{H}/api/sounds/myinstants?q={urllib.parse.quote(query)}')
    items = d['items']
    exact = [i for i in items if query.lower() in i['title'].lower()]
    for item in (exact or items)[:4]:
        raw = get(H + item['url'], binary=True)
        tmp = path_out + '.mp3'
        open(tmp, 'wb').write(raw)
        ok = audio_from(tmp, path_out)
        os.remove(tmp)
        if ok:
            return item['title']
    return None


ONLY = set(filter(None, os.environ.get('ONLY', '').split(',')))
report = json.load(open(os.path.join(WORK, 'report.json'))) if ONLY and os.path.exists(os.path.join(WORK, 'report.json')) else []
for it in SPEC:
    if ONLY and it['id'] not in ONLY:
        continue
    report = [r for r in report if r['id'] != it['id']]
    print('>>', it['id'])
    m = pick_media(it)
    raw = get(H + m['full'], binary=True)
    src = os.path.join(WORK, 'src', it['id'] + '.bin')
    open(src, 'wb').write(raw)
    out = os.path.join(OUT, it['id'] + '.webp')
    kind = 'static'
    sound_title = None
    if it['src'] == 'imgflip':
        static_card(src, out, it.get('crop'))
    elif it['src'] == 'clips':
        animated(src, out, 'crop', max_s=5)
        kind = 'animated'
        if audio_from(src, os.path.join(OUT, 'audio', it['id'] + '.ogg'), max_s=5):
            sound_title = '(som do clip)'
    else:
        # figurinha do KLIPY: GIF com fundo transparente; se tiver um quadro só, vira estática
        try:
            n = getattr(Image.open(src), 'n_frames', 1)
        except Exception:  # noqa: BLE001
            n = 2
        if n > 1:
            animated(src, out, 'fit')
            kind = 'animated'
        else:
            static_card(src, out)
    if it.get('sound'):
        sound_title = sound_for(it['sound'], os.path.join(OUT, 'audio', it['id'] + '.ogg')) or sound_title
    print(f"   {m['title'][:50]} | {kind} | {round(os.path.getsize(out) / 1024)} KB | som: {sound_title}")
    report.append({'id': it['id'], 'title': m['title'], 'kind': kind, 'kb': round(os.path.getsize(out) / 1024), 'sound': sound_title})
order = [x['id'] for x in SPEC]
report.sort(key=lambda r: order.index(r['id']))
json.dump(report, open(os.path.join(WORK, 'report.json'), 'w'), indent=1, ensure_ascii=False)
