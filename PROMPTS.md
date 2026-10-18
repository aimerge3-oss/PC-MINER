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
2. ASIC-майнеры (img/asics/)
Plaintext
Photorealistic studio product photo of a professional cryptocurrency ASIC miner rig with dual heavy-duty industrial cooling fans and brushed aluminum enclosure, isolated, centered, entire object visible, front 3/4 view, soft studio lighting, plain white background, no text, square 1:1, high detail
3. Процессоры (CPU) (img/cpus/)
Plaintext
Photorealistic studio product photo of a modern computer processor CPU with gold contact pads and metallic integrated heat spreader lid, isolated, centered, entire object visible, macro top-down 3/4 view, soft studio lighting, plain white background, no text, square 1:1, high detail
4. Материнские платы (img/motherboards/)
Plaintext
Photorealistic studio product photo of an advanced enthusiast computer motherboard with black PCB, large VRM heatsinks and PCIe slots, isolated, centered, entire object visible, flat top-down view, soft studio lighting, plain white background, no text, square 1:1, high detail
5. Блоки питания (PSU) (img/psu/)
Plaintext
Photorealistic studio product photo of a modular high-wattage computer power supply unit with fan grille and braided power cables nearby, isolated, centered, entire object visible, 3/4 view, soft studio lighting, plain white background, no text, square 1:1, high detail
6. Системы охлаждения (Cooling) (img/cooling/)
Plaintext
Photorealistic studio product photo of a dual-tower CPU air cooler with dual ARGB fans and copper heat pipes, isolated, centered, entire object visible, 3/4 view, soft studio lighting, plain white background, no text, square 1:1, high detail
7. Оперативная память (RAM) (img/ram/)
Plaintext
Photorealistic studio product photo of a dual channel kit of high-performance gaming RAM sticks with metallic heat spreaders and RGB light bars, isolated, centered, entire object visible, 3/4 view, soft studio lighting, plain white background, no text, square 1:1, high detail
8. Накопители (Storage / SSD) (img/storage/)
Plaintext
Photorealistic studio product photo of an M.2 NVMe solid state drive SSD with a black and copper heatsink radiator, isolated, centered, entire object visible, 3/4 view, soft studio lighting, plain white background, no text, square 1:1, high detail
9. Готовые ПК и майнинг-фермы (img/pc/)
Plaintext
Photorealistic studio photo of a custom gaming and mining PC tower case with transparent tempered glass side panel showcasing glowing hardware inside, exact side profile view, facing right, entire PC visible, centered, neutral soft studio lighting, plain white background, no text, high detail, wide 2.4:1 composition

---

### 5. `README.md` (Описание проекта для репозитория)

```markdown
# CRYPTO RIGS: Master & Mining

Telegram Mini App — увлекательный симулятор сборки компьютеров, настройки ASIC-майнеров и управления собственной майнинг-фермой. 
Подробный дизайн-документ и экономические правила описаны в файле [GDD.md](GDD.md).

## Структура проекта
```text
index.html             — главная HTML-разметка Telegram Mini App
css/style.css          — таблица стилей с динамической поддержкой тем Telegram
js/game.js             — основная логика интерфейса, шторки, вкладки и обработчики
js/rules.js            — общие правила, формулы расчета хэшрейта, цен и действий
js/rewards.js          — система ежедневных бонусов, кейсов наград и коллекций
js/workshop.js         — мастерская, склад комплектующих, слияние деталей (3 к 1)
img/pc/                — превью готовых ПК и сборок со студийным фоном
img/asics/             — изображения ASIC-майнеров
img/gpus/              — видеокарты
img/cpus/              — процессоры
img/motherboards/      — материнские платы
img/cooling/           — системы охлаждения
img/ram/               — оперативная память
img/storage/           — накопители (SSD/HDD)
img/psu/               — блоки питания
tools/prepare_photos.py — скрипт автоматической обработки и удаления фона ассетов
Локальный запуск на компьютере
Для тестирования клиентской части локально выполните команду в корневом каталоге проекта:

Bash
python -m http.server 5173
Затем откройте в браузере адрес: http://localhost:5173.
Для сброса сохраненного локального прогресса выполните в консоли браузера: localStorage.clear().

Развертывание в Telegram
Загрузите файлы проекта на любой статический веб-хостинг с поддержкой HTTPS (например, GitHub Pages, Vercel или Netlify).

Зарегистрируйте нового бота через официального @BotFather с помощью команды /newbot.

Настройте Mini App через команду /newapp (или в настройках бота), указав прямую HTTPS-ссылку на ваш хостинг.

Откройте созданного бота в клиенте Telegram и нажмите кнопку запуска приложения.

Управление версиями кэша
При каждом релизе или обновлении скриптов не забывайте увеличивать параметр версии ?v=N у файлов стилей и скриптов в тегах подключения в index.html. Это гарантирует, что пользователи не столкнутся со старыми версиями из кэша Telegram.
