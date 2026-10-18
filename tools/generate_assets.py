#!/usr/bin/env python3
"""
PC-Miner TMA — генератор студийных превью-ассетов по PROMPTS.md.
Процедурная графика на Pillow: радиальный студийный фон, мягкая тень,
rim-light, объекты в стиле product-shot (512x512 PNG).

Запуск:  python3 tools/generate_assets.py
Списки файлов синхронизированы с img: путями в js/rules.js.
"""
import math
import os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SIZE = 512

# Редкость -> цвет акцента (см. PROMPTS.md)
ACCENT = {
    "common": (154, 164, 178),
    "uncommon": (63, 185, 80),
    "rare": (88, 166, 255),
    "epic": (188, 140, 255),
    "legendary": (240, 180, 41),
}

def font(sz, bold=False):
    names = ["DejaVuSans-Bold.ttf"] if bold else ["DejaVuSans.ttf", "DejaVuSans-Bold.ttf"]
    for n in names:
        try:
            return ImageFont.truetype(n, sz)
        except OSError:
            continue
    return ImageFont.load_default()

def studio_bg(tint=(30, 34, 42)):
    """Радиальный градиент тёплого студийного фона + «стол» снизу."""
    base = Image.new("RGB", (SIZE, SIZE))
    px = base.load()
    cx, cy = SIZE // 2, int(SIZE * 0.42)
    maxd = math.hypot(cx, cy)
    inner = tuple(min(255, c + 58) for c in tint)
    outer = tuple(max(0, c - 18) for c in tint)
    for y in range(SIZE):
        for x in range(0, SIZE, 4):
            d = math.hypot(x - cx, y - cy) / maxd
            k = d ** 1.4
            col = tuple(int(inner[i] + (outer[i] - inner[i]) * k) for i in range(3))
            for xx in range(x, min(x + 4, SIZE)):
                px[xx, y] = col
    overlay = Image.new("L", (SIZE, SIZE), 0)
    od = ImageDraw.Draw(overlay)
    od.rectangle((0, int(SIZE * 0.72), SIZE, SIZE), fill=40)
    overlay = overlay.filter(ImageFilter.GaussianBlur(60))
    dark = Image.new("RGB", (SIZE, SIZE), (10, 12, 16))
    base = Image.composite(dark, base, overlay)
    return base.convert("RGBA")

def rounded(draw, box, r, **kw):
    draw.rounded_rectangle(box, radius=r, **kw)

def shadow(canvas, box, blur=18, alpha=90):
    """Мягкая овальная тень под объектом."""
    layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    x0, y0, x1, y1 = box
    d.ellipse((x0 + 18, (y0 + y1) / 2 + (y1 - y0) * 0.36, x1 - 18, y1 + 34),
              fill=(0, 0, 0, alpha))
    layer = layer.filter(ImageFilter.GaussianBlur(blur))
    canvas.alpha_composite(layer)

def rim(img, color, strength=2):
    """Светлая кромка сверху/слева — эффект студийного света."""
    from PIL import ImageChops
    edges = img.convert("L").point(lambda v: 255 if v > 8 else 0)
    lifted = edges.transform(img.size, Image.AFFINE, (1, 0, -strength, 0, 1, -strength))
    diff = ImageChops.difference(edges, lifted)
    glow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    glow.putalpha(diff.point(lambda v: min(255, v * 2)))
    tint = Image.new("RGBA", img.size, (*color, 200))
    glow = Image.composite(tint, glow, glow.split()[3])
    img.alpha_composite(glow)
    return img

def save(img, folder, name):
    outdir = os.path.join(ROOT, "img", folder)
    os.makedirs(outdir, exist_ok=True)
    path = os.path.join(outdir, name + ".png")
    img.convert("RGB").save(path, "PNG")
    return path

def text_c(d, xy, txt, sz=22, fill=(230, 235, 240), bold=False, anchor="mm"):
    d.text(xy, txt, font=font(sz, bold), fill=fill, anchor=anchor)

# ---------------------------------------------------------------- CPU
def draw_cpu(name, model, rarity):
    acc = ACCENT[rarity]
    img = studio_bg((34, 30, 26))
    d = ImageDraw.Draw(img)
    bx0, by0, bx1, by1 = 140, 150, 372, 382
    shadow(img, (bx0, by0, bx1, by1))
    gold = tuple(min(255, 120 + c // 2) for c in acc)
    rounded(d, (bx0, by0, bx1, by1), 14, fill=(52, 56, 62), outline=(80, 84, 92), width=3)
    rounded(d, (bx0 + 22, by0 + 22, bx1 - 22, by1 - 22), 10,
            fill=(gold[0], gold[1], gold[2]), outline=(20, 22, 26), width=2)
    d.polygon([(bx0 + 22, by0 + 60), (bx1 - 22, by0 + 22), (bx1 - 22, by0 + 46),
               (bx0 + 22, by0 + 90)], fill=tuple(min(255, c + 60) for c in gold))
    parts = model.split()
    text_c(d, (SIZE // 2, by0 + 92), parts[0].upper(), 30, (24, 26, 30), True)
    text_c(d, (SIZE // 2, by0 + 128), " ".join(parts[1:]), 24, (24, 26, 30), True)
    text_c(d, (SIZE // 2, by0 + 168), "OEM TRAY · 5nm", 16, (40, 42, 48))
    for i in range(12):
        x = bx0 + 14 + i * ((bx1 - bx0 - 28) / 11)
        d.ellipse((x - 3, by1 - 10, x + 3, by1 - 4), fill=(30, 32, 36))
        d.ellipse((x - 3, by0 + 4, x + 3, by0 + 10), fill=(30, 32, 36))
    rim(img, (255, 250, 235))
    return save(img, "cpus", name)

# ---------------------------------------------------------------- GPU
def draw_gpu(name, model, rarity, fans=2):
    acc = ACCENT[rarity]
    img = studio_bg((26, 28, 36))
    d = ImageDraw.Draw(img)
    gx0, gy0, gx1, gy1 = 70, 170, 442, 330
    shadow(img, (gx0, gy0, gx1, gy1))
    rounded(d, (gx0 + 6, gy0 - 16, gx1 + 6, gy1 - 14), 10, fill=(38, 42, 50))
    rounded(d, (gx0, gy0, gx1, gy1), 12, fill=(24, 27, 33), outline=acc, width=3)
    rounded(d, (gx0 + 4, gy0 + 4, gx1 - 4, gy0 + 16), 6,
            fill=tuple(min(255, c + 40) for c in acc))
    fw = (gx1 - gx0 - 30) / fans
    for i in range(fans):
        cx = gx0 + 15 + fw * (i + 0.5)
        cy = (gy0 + gy1) / 2 + 8
        r = fw * 0.42
        d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(14, 16, 20),
                  outline=(70, 74, 82), width=3)
        for a in range(0, 360, 60):
            rad = math.radians(a + i * 17)
            d.line((cx, cy, cx + math.cos(rad) * r * 0.86, cy + math.sin(rad) * r * 0.86),
                   fill=(48, 52, 60), width=6)
        d.ellipse((cx - 9, cy - 9, cx + 9, cy + 9), fill=acc)
    d.rectangle((gx0 + 30, gy1, gx0 + 200, gy1 + 12), fill=(190, 160, 70))
    d.rectangle((gx1 - 70, gy0 - 6, gx1 - 10, gy0 + 8), fill=(18, 18, 22))
    text_c(d, (gx0 + 24, gy0 + 34), model, 20, (235, 240, 246), True, anchor="lm")
    for k in range(3):
        d.rectangle((gx0 - 2, gy0 + 30 + k * 26, gx0 + 10, gy0 + 48 + k * 26), fill=(120, 126, 134))
    rim(img, acc)
    return save(img, "gpus", name)

# ---------------------------------------------------------------- Motherboard
def draw_mb(name, model, rarity):
    acc = ACCENT[rarity]
    img = studio_bg((24, 30, 28))
    d = ImageDraw.Draw(img)
    x0, y0, x1, y1 = 110, 90, 402, 420
    shadow(img, (x0, y0, x1, y1))
    rounded(d, (x0, y0, x1, y1), 8, fill=(20, 42, 34) if rarity == "common" else (16, 18, 24),
            outline=(60, 66, 72), width=3)
    sx0, sy0, sx1, sy1 = x0 + 60, y0 + 60, x0 + 150, y0 + 150
    d.rectangle((sx0, sy0, sx1, sy1), fill=(90, 94, 100), outline=(30, 32, 36), width=4)
    d.rectangle((sx0 + 12, sy0 + 12, sx1 - 12, sy1 - 12), fill=(40, 42, 48))
    text_c(d, ((sx0 + sx1) / 2, (sy0 + sy1) / 2), "SOCKET", 14, (170, 175, 182))
    for i in range(4):
        dx = x0 + 180 + i * 26
        d.rectangle((dx, y0 + 40, dx + 14, y0 + 210), fill=(28, 30, 36), outline=acc, width=2)
    rounded(d, (x0 + 14, y0 + 14, x0 + 170, y0 + 44), 4, fill=(70, 74, 82))
    for i in range(9):
        d.line((x0 + 22 + i * 16, y0 + 16, x0 + 22 + i * 16, y0 + 42), fill=(44, 48, 54), width=4)
    for i in range(2):
        rounded(d, (x0 + 30, y0 + 240 + i * 52, x0 + 170, y0 + 262 + i * 52), 4,
                fill=(58, 62, 70), outline=acc, width=2)
    d.rectangle((x0 + 40, y0 + 180, x0 + 220, y0 + 194), fill=(36, 38, 44), outline=(150, 150, 150), width=2)
    d.rectangle((x0 + 40, y0 + 300, x0 + 190, y0 + 312), fill=(36, 38, 44), outline=(120, 120, 120), width=2)
    rounded(d, (x1 - 90, y1 - 120, x1 - 30, y1 - 60), 6, fill=(34, 36, 42), outline=acc, width=2)
    text_c(d, (x1 - 60, y1 - 90), "Z", 22, acc, True)
    for cx, cy in [(x0 + 16, y0 + 16), (x1 - 16, y0 + 16), (x0 + 16, y1 - 16),
                   (x1 - 16, y1 - 16), (x1 - 16, (y0 + y1) / 2)]:
        d.ellipse((cx - 6, cy - 6, cx + 6, cy + 6), fill=(12, 12, 14), outline=(90, 94, 100), width=2)
    text_c(d, ((x0 + x1) / 2, y1 - 22), model, 18, (205, 212, 220), True)
    rim(img, (220, 230, 240))
    return save(img, "motherboards", name)

# ---------------------------------------------------------------- RAM
def draw_ram(name, label, rarity):
    acc = ACCENT[rarity]
    img = studio_bg((28, 26, 34))
    d = ImageDraw.Draw(img)
    shadow(img, (120, 120, 392, 400))
    for off in (0, 92):
        x0, y0, x1, y1 = 120 + off, 120, 210 + off, 400
        rounded(d, (x0, y0 - 18, x1, y0), 6, fill=tuple(min(255, c + 30) for c in acc))
        rounded(d, (x0, y0, x1, y1), 8, fill=(52, 58, 68), outline=(90, 96, 106), width=2)
        for i in range(7):
            yy = y0 + 24 + i * 34
            d.line((x0 + 8, yy, x1 - 8, yy), fill=(36, 40, 48), width=8)
        for i in range(6):
            xx = x0 + 8 + i * ((x1 - x0 - 16) / 5)
            d.polygon([(xx - 5, y0), (xx, y0 - 12), (xx + 5, y0)], fill=(64, 70, 80))
        text_c(d, ((x0 + x1) / 2, y0 + 130), label, 18, (235, 240, 246), True)
        d.rectangle((x0 + 6, y1, x1 - 6, y1 + 12), fill=(196, 166, 80))
        d.rectangle((x0 + (x1 - x0) * 0.42, y1, x0 + (x1 - x0) * 0.5, y1 + 12), fill=(28, 26, 34))
    rim(img, acc)
    return save(img, "ram", name)

# ---------------------------------------------------------------- Storage
def draw_ssd(name, label, gen):
    acc = ACCENT[name_rarity[name]]
    img = studio_bg((26, 26, 32))
    d = ImageDraw.Draw(img)
    x0, y0, x1, y1 = 90, 210, 422, 300
    shadow(img, (x0, y0, x1, y1))
    rounded(d, (x0, y0, x1, y1), 6, fill=(30, 33, 40), outline=(70, 74, 82), width=2)
    rounded(d, (x0 + 10, y0 + 8, x1 - 40, y1 - 8), 4, fill=(228, 232, 238))
    text_c(d, (x0 + 24, (y0 + y1) / 2 - 12), label, 24, (24, 26, 30), True, anchor="lm")
    text_c(d, (x0 + 24, (y0 + y1) / 2 + 18), f"NVMe M.2 2280 · PCIe Gen{gen}",
           15, (60, 64, 70), anchor="lm")
    d.rectangle((x0 + 10, y0 + 8, x0 + 18, y1 - 8), fill=acc)
    d.rectangle((x1 - 34, y0 + 14, x1 - 6, y1 - 14), fill=(198, 168, 84))
    for i in range(6):
        d.rectangle((x1 - 32 + i * 5, y0 + 16, x1 - 29 + i * 5, y1 - 16), fill=(120, 96, 40))
    d.polygon([(x1 - 20, y1 - 14), (x1 - 12, y1 - 14), (x1 - 16, y1 - 4)], fill=(30, 33, 40))
    for i in range(3):
        d.rectangle((x0 + 120 + i * 44, y0 + 20, x0 + 156 + i * 44, y0 + 44), fill=(18, 20, 24))
    rim(img, (230, 235, 240))
    return save(img, "storage", name)

def draw_hdd(name, label, rarity):
    acc = ACCENT[rarity]
    img = studio_bg((30, 28, 26))
    d = ImageDraw.Draw(img)
    x0, y0, x1, y1 = 120, 150, 392, 380
    shadow(img, (x0, y0, x1, y1))
    rounded(d, (x0, y0, x1, y1), 8, fill=(74, 80, 88), outline=(36, 38, 44), width=3)
    d.polygon([(x0 + 8, y0 + 8), (x1 - 8, y0 + 8), (x1 - 30, y0 + 60), (x0 + 30, y0 + 60)],
              fill=(104, 110, 120))
    rounded(d, (x0 + 26, y0 + 90, x1 - 26, y1 - 30), 6, fill=(226, 228, 232))
    text_c(d, ((x0 + x1) / 2, y0 + 120), label, 30, (26, 28, 32), True)
    text_c(d, ((x0 + x1) / 2, y0 + 152), "ENTERPRISE · 7200 RPM · SATA", 14, (70, 74, 80))
    d.rectangle((x0 + 26, y0 + 90, x0 + 36, y1 - 30), fill=acc)
    for cx, cy in [(x0 + 16, y0 + 16), (x1 - 16, y0 + 16), (x0 + 16, y1 - 16), (x1 - 16, y1 - 16)]:
        d.ellipse((cx - 7, cy - 7, cx + 7, cy + 7), fill=(52, 56, 62), outline=(30, 32, 36), width=2)
        d.line((cx - 4, cy, cx + 4, cy), fill=(28, 30, 34), width=2)
    d.rectangle((x1 - 110, y1 - 16, x1 - 50, y1), fill=(24, 26, 30))
    d.rectangle((x1 - 46, y1 - 16, x1 - 16, y1), fill=(24, 26, 30))
    rim(img, (240, 244, 250))
    return save(img, "storage", name)

# ---------------------------------------------------------------- Cooling
def draw_tower(name, rarity):
    acc = ACCENT[rarity]
    img = studio_bg((26, 28, 34))
    d = ImageDraw.Draw(img)
    shadow(img, (140, 100, 372, 420))
    x0, y0, x1, y1 = 170, 110, 342, 360
    rounded(d, (x0, y0, x1, y1), 6, fill=(150, 156, 166), outline=(70, 74, 82), width=2)
    for i in range(16):
        yy = y0 + 6 + i * 15
        d.line((x0 + 4, yy, x1 - 4, yy), fill=(108, 114, 124), width=6)
    for i in range(4):
        xx = x0 - 12 - i * 10
        d.line((xx + 30, y1, xx + 30, y0 + 30 + i * 8), fill=(198, 140, 70), width=7)
    cx, cy, r = (x0 + x1) / 2, (y0 + y1) / 2, 74
    rounded(d, (cx - r - 8, cy - r - 8, cx + r + 8, cy + r + 8), 10, fill=(22, 24, 30), outline=acc, width=3)
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(14, 16, 20), outline=(80, 84, 92), width=3)
    for a in range(0, 360, 45):
        rad = math.radians(a)
        d.line((cx, cy, cx + math.cos(rad) * r * 0.88, cy + math.sin(rad) * r * 0.88),
               fill=(56, 60, 70), width=8)
    d.ellipse((cx - 12, cy - 12, cx + 12, cy + 12), fill=acc)
    d.rectangle((x0 + 10, y1, x1 - 10, y1 + 26), fill=(60, 64, 72))
    rim(img, (235, 238, 244))
    return save(img, "cooling", name)

def draw_aio(name, size_mm, rarity):
    acc = ACCENT[rarity]
    img = studio_bg((24, 26, 34))
    d = ImageDraw.Draw(img)
    shadow(img, (90, 140, 420, 380))
    rx0, ry0, rx1, ry1 = 90, 170, 330, 330
    rounded(d, (rx0, ry0, rx1, ry1), 8, fill=(36, 40, 48), outline=(84, 90, 100), width=3)
    nf = 2 if size_mm == 240 else 3
    fw = (ry1 - ry0 - 24) / nf
    for i in range(nf):
        cy = ry0 + 12 + fw * (i + 0.5)
        d.ellipse((rx0 + 12, cy - fw * 0.42, rx1 - 12, cy + fw * 0.42), outline=(70, 76, 86), width=4)
        for a in range(0, 360, 60):
            rad = math.radians(a + 13 * i)
            ccx, ccy, rr = (rx0 + rx1) / 2, cy, fw * 0.4
            d.line((ccx + math.cos(rad) * 10, ccy + math.sin(rad) * rr * 0.35,
                    ccx + math.cos(rad) * rr, ccy + math.sin(rad) * rr), fill=(52, 56, 66), width=5)
    px0, py0, px1, py1 = 340, 180, 420, 260
    rounded(d, (px0, py0, px1, py1), 14, fill=(20, 22, 28), outline=acc, width=4)
    d.ellipse((px0 + 14, py0 + 14, px1 - 14, py1 - 14), fill=(30, 34, 42), outline=(90, 96, 106), width=2)
    text_c(d, ((px0 + px1) / 2, (py0 + py1) / 2), str(size_mm), 26, acc, True)
    for i in range(2):
        yy = py0 + 60 + i * 18
        d.line((px0, yy, rx1, yy - 40), fill=(44, 48, 56), width=10)
        d.line((px0, yy, rx1, yy - 40), fill=(70, 76, 88), width=4)
    rim(img, acc)
    return save(img, "cooling", name)

def draw_custom_loop(name, rarity):
    acc = ACCENT[rarity]
    img = studio_bg((22, 24, 34))
    d = ImageDraw.Draw(img)
    shadow(img, (110, 120, 400, 400))
    rounded(d, (150, 250, 260, 360), 12, fill=(24, 28, 36), outline=acc, width=3)
    d.ellipse((170, 270, 240, 340), fill=(34, 40, 52), outline=tuple(min(255, c + 40) for c in acc), width=3)
    text_c(d, (205, 305), "CPU", 18, acc, True)
    rounded(d, (110, 120, 400, 190), 8, fill=(40, 44, 54), outline=(90, 96, 106), width=3)
    for i in range(18):
        xx = 118 + i * 15
        d.line((xx, 124, xx, 186), fill=(66, 72, 84), width=6)
    d.ellipse((300, 210, 380, 290), fill=(28, 32, 42), outline=acc, width=4)
    text_c(d, (340, 250), "D5", 20, (220, 226, 236), True)
    for box in [(230, 200, 320, 280), (150, 185, 260, 255), (250, 280, 345, 350)]:
        d.arc(box, start=200, end=340, fill=(120, 200, 255), width=10)
        d.arc(box, start=200, end=340, fill=(200, 240, 255), width=4)
    rim(img, (150, 210, 255))
    return save(img, "cooling", name)

# ---------------------------------------------------------------- PSU
def draw_psu(name, watts, cert, rarity):
    acc = ACCENT[rarity]
    img = studio_bg((28, 28, 30))
    d = ImageDraw.Draw(img)
    x0, y0, x1, y1 = 120, 170, 392, 350
    shadow(img, (x0, y0, x1, y1))
    rounded(d, (x0, y0, x1, y1), 10, fill=(20, 22, 26), outline=(64, 68, 76), width=3)
    cx, cy = x0 + 86, (y0 + y1) / 2
    r = 66
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(12, 13, 16), outline=(70, 74, 82), width=4)
    for a in range(0, 360, 30):
        d.arc((cx - r + 8, cy - r + 8, cx + r - 8, cy + r - 8), a, a + 18, fill=(48, 52, 60), width=6)
    d.ellipse((cx - 12, cy - 12, cx + 12, cy + 12), fill=(80, 84, 92))
    rounded(d, (x0 + 176, y0 + 24, x1 - 18, y1 - 24), 8, fill=(26, 28, 34), outline=acc, width=3)
    text_c(d, ((x0 + 176 + x1 - 18) / 2, y0 + 62), f"{watts}W", 40, (240, 244, 250), True)
    text_c(d, ((x0 + 176 + x1 - 18) / 2, y0 + 100), cert, 20, acc, True)
    for i in range(6):
        d.rectangle((x0 + 20 + i * 42, y1 - 14, x0 + 52 + i * 42, y1), fill=(40, 44, 52))
    d.rectangle((x1 - 30, y1 - 40, x1 - 6, y1 - 18), fill=(36, 40, 48))
    rim(img, (230, 234, 240))
    return save(img, "psu", name)

# ---------------------------------------------------------------- ASIC
def draw_asic(name, model, rarity, gpu_style=False):
    acc = ACCENT[rarity]
    img = studio_bg((30, 30, 34))
    d = ImageDraw.Draw(img)
    x0, y0, x1, y1 = 70, 160, 442, 350
    shadow(img, (x0, y0, x1, y1))
    metal = (44, 48, 60) if gpu_style else (120, 126, 136)
    rounded(d, (x0, y0, x1, y1), 10, fill=metal, outline=(24, 26, 30), width=4)
    for i in range(14):
        xx = x0 + 90 + i * 19
        d.line((xx, y0 + 16, xx, y1 - 16), fill=(30, 32, 38), width=9)
    for vx in (x0 + 42, x1 - 42):
        cy = (y0 + y1) / 2
        d.ellipse((vx - 34, cy - 34, vx + 34, cy + 34), fill=(16, 18, 22),
                  outline=acc if gpu_style else (200, 206, 214), width=4)
        for a in range(0, 360, 72):
            rad = math.radians(a)
            d.line((vx, cy, vx + math.cos(rad) * 30, cy + math.sin(rad) * 30), fill=(60, 64, 74), width=5)
    if gpu_style:
        for i in range(6):
            yy = y0 + 6 + i * 30
            d.rectangle((x0 + 70, yy, x1 - 70, yy + 12), fill=(20, 22, 28), outline=acc, width=1)
    rounded(d, (x0 + 96, y1 - 44, x1 - 96, y1 - 8), 6, fill=(18, 20, 24), outline=acc, width=2)
    text_c(d, (SIZE // 2, y1 - 26), model, 18, (235, 240, 246), True)
    d.rectangle((x0 + 60, y0 - 12, x0 + 120, y0), fill=(90, 94, 102))
    d.rectangle((x1 - 120, y0 - 12, x1 - 60, y0), fill=(90, 94, 102))
    rim(img, (245, 248, 252))
    return save(img, "asics", name)

# ---------------------------------------------------------------- PC / rigs
def draw_pc(name, title, rarity, tier):
    """tier 0..4: закрытый кейс -> стекло -> станция -> риг -> ферма."""
    acc = ACCENT[rarity]
    img = studio_bg((26, 24, 34))
    d = ImageDraw.Draw(img)
    shadow(img, (120, 90, 400, 430))
    x0, y0, x1, y1 = 140, 90, 380, 420
    if tier <= 1:
        rounded(d, (x0, y0, x1, y1), 12, fill=(18, 20, 26), outline=(70, 76, 86), width=4)
        rounded(d, (x0 + 14, y0 + 14, x1 - 14, y1 - 14), 8, fill=(30, 40, 58))
        d.rectangle((x0 + 30, y0 + 40, x1 - 60, y1 - 90), fill=(22, 40, 34))
        rounded(d, (x0 + 40, y0 + 150, x1 - 40, y0 + 190), 6, fill=(26, 28, 36), outline=acc, width=2)
        d.ellipse((x0 + 60, y0 + 156, x0 + 84, y0 + 184), outline=(90, 96, 108), width=3)
        nv = 2 + tier
        for i in range(nv):
            cx = x1 - 44
            cy = y0 + 50 + i * 70
            d.ellipse((cx - 24, cy - 24, cx + 24, cy + 24), fill=(14, 16, 22), outline=acc, width=4)
            d.ellipse((cx - 10, cy - 10, cx + 10, cy + 10), fill=tuple(min(255, c + 50) for c in acc))
        d.line((x0 + 14, y1 - 18, x1 - 14, y1 - 18), fill=acc, width=5)
        text_c(d, ((x0 + x1) / 2, y1 + 22), title, 20, (225, 232, 240), True)
    elif tier == 2:
        rounded(d, (x0 - 10, y0, x1 + 10, y1), 12, fill=(20, 22, 28), outline=(80, 86, 96), width=4)
        d.line((x0 - 10, (y0 + y1) / 2, x1 + 10, (y0 + y1) / 2), fill=(60, 66, 76), width=4)
        for sec in range(2):
            yy = y0 + 20 + sec * 165
            for i in range(3):
                rounded(d, (x0 + 16 + i * 74, yy, x0 + 16 + i * 74 + 60, yy + 120), 6,
                        fill=(26, 30, 40), outline=acc, width=2)
                d.ellipse((x0 + 30 + i * 74, yy + 20, x0 + 62 + i * 74, yy + 52), outline=(100, 108, 120), width=3)
        text_c(d, ((x0 + x1) / 2, y1 + 22), title, 20, (225, 232, 240), True)
    else:
        frame_c = (110, 116, 128) if tier == 3 else tuple(min(255, c + 20) for c in acc)
        d.rectangle((x0 - 20, y0, x0 - 8, y1), fill=frame_c)
        d.rectangle((x1 + 8, y0, x1 + 20, y1), fill=frame_c)
        shelves = 2 if tier == 3 else 3
        for s in range(shelves + 1):
            yy = y0 + s * ((y1 - y0) / shelves)
            d.rectangle((x0 - 20, yy - 4, x1 + 20, yy + 4), fill=frame_c)
        for s in range(shelves):
            yy = y0 + s * ((y1 - y0) / shelves)
            n = 4 if tier == 3 else 5
            for i in range(n):
                gx = x0 + 6 + i * ((x1 - x0 - 12) / n)
                rounded(d, (gx, yy + 14, gx + 34, yy + (y1 - y0) / shelves - 10), 5,
                        fill=(24, 26, 34), outline=acc, width=2)
                d.ellipse((gx + 6, yy + 22, gx + 28, yy + 44), outline=(96, 102, 114), width=3)
        if tier == 4:
            rounded(d, (x0 - 24, y0 - 4, x1 + 24, y1 + 4), 14, outline=acc, width=3)
            rounded(d, (x0 + 90, y1 - 60, x0 + 150, y1 - 14), 6, fill=(18, 22, 30), outline=acc, width=2)
            text_c(d, (x0 + 120, y1 - 37), "QX", 20, tuple(min(255, c + 60) for c in acc), True)
        text_c(d, ((x0 + x1) / 2, y1 + 24), title, 20, (225, 232, 240), True)
    rim(img, acc)
    return save(img, "pc", name)

# ---------------------------------------------------------------- main
name_rarity = {}

def main():
    cpus = [("i3-12100", "Intel Core i3-12100", "common"),
            ("ryzen-5-5600", "AMD Ryzen 5 5600", "uncommon"),
            ("ryzen-7-7700x", "AMD Ryzen 7 7700X", "rare"),
            ("i9-14900k", "Intel Core i9-14900K", "epic"),
            ("threadripper-7970x", "Threadripper 7970X", "legendary")]
    gpus = [("gtx-1660s", "GTX 1660 SUPER", "common", 2),
            ("rtx-3060", "RTX 3060 12GB", "uncommon", 2),
            ("rtx-4070", "RTX 4070", "rare", 2),
            ("rx-7900xtx", "RX 7900 XTX", "epic", 3),
            ("rtx-4090", "RTX 4090", "legendary", 3)]
    mbs = [("b660m", "MSI PRO B660M", "common"), ("b650", "B650 AORUS", "uncommon"),
           ("x670e", "ROG X670E", "rare"), ("trx50", "Pro WS TRX50", "epic")]
    rams = [("ddr4-16", "16GB DDR4", "common"), ("ddr5-32", "32GB DDR5", "uncommon"),
            ("ddr5-64", "64GB DDR5", "rare"), ("ecc-128", "128GB ECC", "epic")]
    ssds = [("ssd-256", "256 GB", 3), ("ssd-1tb", "1 TB", 4), ("ssd-2tb", "2 TB", 4)]
    for n, r in [("ssd-256", "common"), ("ssd-1tb", "uncommon"), ("ssd-2tb", "rare"),
                 ("hdd-8tb", "epic")]:
        name_rarity[n] = r
    cool_aios = [("aio-240", 240, "uncommon"), ("aio-360", 360, "rare")]
    psus = [("500w", 500, "80+ BRONZE", "common"), ("750w", 750, "80+ GOLD", "uncommon"),
            ("1000w", 1000, "80+ PLATINUM", "rare"), ("1600w", 1600, "80+ TITANIUM", "epic")]
    asics = [("s19xp", "Antminer S19 XP", "rare", False), ("s21", "Antminer S21", "epic", False),
             ("a1366", "Avalon A1366", "epic", False), ("m60s", "MicroBT M60S", "rare", False),
             ("omega", "ICARUS OMEGA 4090x6", "legendary", True)]
    pcs = [("starter", "Стартовый риг", "common", 0), ("mid-gaming", "Mid-Gaming ферма", "uncommon", 1),
           ("pro-miner", "Pro Miner Station", "rare", 2), ("beast-8x", "GPU Beast 8x", "epic", 3),
           ("quantum-x", "Quantum Farm X", "legendary", 4)]

    made = []
    for n, m, r in cpus: made.append(draw_cpu(n, m, r))
    for n, m, r, f in gpus: made.append(draw_gpu(n, m, r, f))
    for n, m, r in mbs: made.append(draw_mb(n, m, r))
    for n, l, r in rams: made.append(draw_ram(n, l, r))
    for n, l, g in ssds: made.append(draw_ssd(n, l, g))
    made.append(draw_hdd("hdd-8tb", "8 TB", "epic"))
    made.append(draw_tower("tower", "common"))
    for n, s, r in cool_aios: made.append(draw_aio(n, s, r))
    made.append(draw_custom_loop("custom-loop", "epic"))
    for n, w, c, r in psus: made.append(draw_psu(n, w, c, r))
    for n, m, r, g in asics: made.append(draw_asic(n, m, r, g))
    for n, t, r, tr in pcs: made.append(draw_pc(n, t, r, tr))

    print(f"Generated {len(made)} assets:")
    for p in made:
        print(" ", os.path.relpath(p, ROOT))

if __name__ == "__main__":
    main()
