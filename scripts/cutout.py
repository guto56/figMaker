import sys
from collections import deque
from PIL import Image, ImageFilter
def cutout(src, size=512, tol=30, outline=10, pad=18):
    _refcache.clear()
    im = Image.open(src).convert('RGB').resize((size*2, size*2), Image.LANCZOS)
    W, H = im.size; px = im.load()
    a = Image.new('L', im.size, 255); ap = a.load()
    seen = bytearray(W*H); q = deque()
    for x in range(W):
        q.append((x,0)); q.append((x,H-1))
    for y in range(H):
        q.append((0,y)); q.append((W-1,y))
    while q:
        x,y = q.popleft(); i=y*W+x
        if seen[i]: continue
        seen[i]=1
        r,g,b = px[x,y]; cr,cg,cb = ref(px,x,y,W,H)
        if abs(r-cr)+abs(g-cg)+abs(b-cb) > tol*3: continue
        ap[x,y]=0
        for nx,ny in ((x+1,y),(x-1,y),(x,y+1),(x,y-1)):
            if 0<=nx<W and 0<=ny<H and not seen[ny*W+nx]: q.append((nx,ny))
    a = a.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1))
    rgba = im.convert('RGBA'); rgba.putalpha(a)
    bbox = a.point(lambda v: 255 if v>128 else 0).getbbox()
    rgba = rgba.crop(bbox)
    inner = size*2 - 2*(pad*2+outline*2)
    rgba.thumbnail((inner, inner), Image.LANCZOS)
    canvas = Image.new('RGBA', (size*2,size*2), (0,0,0,0))
    ox=(size*2-rgba.width)//2; oy=(size*2-rgba.height)//2
    canvas.paste(rgba,(ox,oy),rgba)
    if outline:
        al = canvas.getchannel('A').point(lambda v: 255 if v>60 else 0)
        k = outline*4+1
        dil = al.filter(ImageFilter.MaxFilter(k if k%2 else k+1)).filter(ImageFilter.GaussianBlur(1.2))
        white = Image.new('RGBA', canvas.size, (255,255,255,255)); white.putalpha(dil)
        white.alpha_composite(canvas); canvas = white
    return canvas.resize((size,size), Image.LANCZOS)
_refcache = {}
def ref(px,x,y,W,H):
    # cor de referência: a média dos 4 cantos
    if 'c' not in _refcache:
        cs=[px[2,2],px[W-3,2],px[2,H-3],px[W-3,H-3]]
        _refcache['c']=tuple(sum(c[i] for c in cs)//4 for i in range(3))
    return _refcache['c']
if __name__ == '__main__':
    src, dst = sys.argv[1], sys.argv[2]
    outline = int(sys.argv[3]) if len(sys.argv)>3 else 10
    img = cutout(src, outline=outline)
    if dst.endswith('.webp'):
        img.save(dst, 'WEBP', quality=82, method=6)
    else:
        img.save(dst)
