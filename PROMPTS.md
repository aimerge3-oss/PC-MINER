# PROMPTS.md — Инструкции и промпты для генерации ассетов оборудования

Все изображения генерируются с помощью нейросетей, сохраняются в сырые папки (`img/..._src/`), после чего обрабатываются скриптом вырезания фона `python tools/prepare_photos.py` и попадают в рабочую директорию `img/.../` в формате `.webp`.

## Общие требования к визуальному стилю
- Ракурс: строго **сбоку (side profile)** или **под углом 3/4**, объект повернут вправо, виден целиком.
- Фон: чистый однотонный белый или светло-серый (нейтральный студийный свет).
- Освещение: мягкие студийные тени, подчеркивающие металлические текстуры радиаторов, текстолит плат и RGB-подсветку.
- Отсутствие посторонних надписей, водяных знаков и людей в кадре.

## Шаблоны промптов по категориям оборудования

### 1. Видеокарты (GPU) (`img/gpus/`)
```text
Photorealistic studio product photo of a high-end gaming graphics card with triple cooling fans and glowing RGB accent lines, isolated, centered, entire object visible, 3/4 view, soft studio lighting, plain white background, no text, square 1:1, high detail
