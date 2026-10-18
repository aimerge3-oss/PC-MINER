/* ============================================================
 * rules.js — Общие правила, константы и логика действий игрока
 * PC-Miner Telegram Mini App
 *
 * Модуль не знает про DOM: только данные, константы и чистые
 * функции расчёта/валидации. Тот же формат конфигов разделяется
 * с серверной частью (общая структура правил игры).
 * ============================================================ */

(function (global) {
  'use strict';

  /* ------------------------------------------------------------
   * 1. Глобальные константы игры
   * ---------------------------------------------------------- */
  const CONSTANTS = Object.freeze({
    CURRENCY: '₽',                       // основная валюта (клики/продажи)
    CRYPTO_TICKER: 'PMC',                // тикер крипто-награды за майнинг
    BASE_CLICK_POWER: 1,                 // базовый доход за клик
    CLICK_POWER_PER_LEVEL: 0.5,          // прибавка к клику за уровень
    MAX_LEVEL: 100,
    XP_PER_ASSEMBLY: 50,                 // опыт за сборку ПК
    START_BALANCE: 0,
    START_GARAGE_SLOTS: 5,               // стартовые слоты гаража
    MAX_GARAGE_SLOTS: 30,
    SLOT_PRICE_BASE: 5000,               // цена первого доп. слота
    SLOT_PRICE_STEP: 2500,               // на сколько дорожает каждый след. слот
    START_RACK_SLOTS: 3,                 // ячеек ASIC в одной майнинг-стойке
    RACK_PRICE: 25000,
    POWER_LIMIT_WATT: 3000,              // лимит энергии домашней сети
    ELECTRICITY_RATE: 0.05,              // ₽ за Вт/час обслуживания майнинга
    OFFLINE_EARN_HOURS_MAX: 8,           // максимум офлайн-дохода
    TICK_INTERVAL_MS: 1000,              // период игрового тика
  });

  /* ------------------------------------------------------------
   * 2. Слоты сборки ПК (типы комплектующих)
   * ---------------------------------------------------------- */
  const SLOT_TYPES = Object.freeze(['cpu', 'gpu', 'motherboard', 'ram', 'storage', 'cooling', 'psu']);

  /* ------------------------------------------------------------
   * 3. Конфигурации комплектующих
   *    power     — энергопотребление, Вт
   *    hashrate  — вклад в хэшрейт, MH/s
   *    cost      — стоимость, ₽
   *    rarity    — common | uncommon | rare | epic | legendary
   *    img       — путь к превью (папки img/* созданы под ассеты)
   * ---------------------------------------------------------- */
  const PARTS = Object.freeze({
    cpu: [
      { id: 'cpu_i3_12100',   name: 'Intel Core i3-12100',   power: 60,  hashrate: 0.02, cost: 4500,  rarity: 'common',    img: 'img/cpus/i3-12100.png' },
      { id: 'cpu_r5_5600',    name: 'AMD Ryzen 5 5600',      power: 65,  hashrate: 0.04, cost: 9000,  rarity: 'uncommon',  img: 'img/cpus/ryzen-5-5600.png' },
      { id: 'cpu_r7_7700x',   name: 'AMD Ryzen 7 7700X',     power: 105, hashrate: 0.08, cost: 21000, rarity: 'rare',      img: 'img/cpus/ryzen-7-7700x.png' },
      { id: 'cpu_i9_14900k',  name: 'Intel Core i9-14900K',  power: 253, hashrate: 0.15, cost: 55000, rarity: 'epic',      img: 'img/cpus/i9-14900k.png' },
      { id: 'cpu_tr_7970x',   name: 'AMD Threadripper 7970X',power: 350, hashrate: 0.30, cost: 180000,rarity: 'legendary', img: 'img/cpus/threadripper-7970x.png' },
    ],
    gpu: [
      { id: 'gpu_gtx1660',  name: 'NVIDIA GTX 1660 Super', power: 125, hashrate: 31,   cost: 14000,  rarity: 'common',    img: 'img/gpus/gtx-1660s.png' },
      { id: 'gpu_rtx3060',  name: 'NVIDIA RTX 3060 12GB',  power: 170, hashrate: 48,   cost: 26000,  rarity: 'uncommon',  img: 'img/gpus/rtx-3060.png' },
      { id: 'gpu_rtx4070',  name: 'NVIDIA RTX 4070',       power: 200, hashrate: 85,   cost: 62000,  rarity: 'rare',      img: 'img/gpus/rtx-4070.png' },
      { id: 'gpu_rx7900',   name: 'AMD RX 7900 XTX',       power: 355, hashrate: 140,  cost: 95000,  rarity: 'epic',      img: 'img/gpus/rx-7900xtx.png' },
      { id: 'gpu_rtx4090',  name: 'NVIDIA RTX 4090',       power: 450, hashrate: 190,  cost: 210000, rarity: 'legendary', img: 'img/gpus/rtx-4090.png' },
    ],
    motherboard: [
      { id: 'mb_b660',    name: 'MSI PRO B660M',        power: 40,  hashrate: 0, cost: 6000,  rarity: 'common',    img: 'img/motherboards/b660m.png' },
      { id: 'mb_b650',    name: 'Gigabyte B650 Aorus',  power: 45,  hashrate: 0, cost: 12000, rarity: 'uncommon',  img: 'img/motherboards/b650.png' },
      { id: 'mb_x670e',   name: 'ASUS ROG X670E',       power: 60,  hashrate: 0, cost: 32000, rarity: 'rare',      img: 'img/motherboards/x670e.png' },
      { id: 'mb_trx50',   name: 'ASUS Pro WS TRX50',    power: 80,  hashrate: 0, cost: 85000, rarity: 'epic',      img: 'img/motherboards/trx50.png' },
    ],
    ram: [
      { id: 'ram_16_d4',   name: '16GB DDR4 3200',      power: 10, hashrate: 0.5, cost: 3000,  rarity: 'common',    img: 'img/ram/ddr4-16.png' },
      { id: 'ram_32_d5',   name: '32GB DDR5 6000',      power: 14, hashrate: 1.2, cost: 8000,  rarity: 'uncommon',  img: 'img/ram/ddr5-32.png' },
      { id: 'ram_64_d5',   name: '64GB DDR5 6400',      power: 20, hashrate: 2.5, cost: 19000, rarity: 'rare',      img: 'img/ram/ddr5-64.png' },
      { id: 'ram_128_ecc', name: '128GB ECC DDR5',      power: 30, hashrate: 5.0, cost: 60000, rarity: 'epic',      img: 'img/ram/ecc-128.png' },
    ],
    storage: [
      { id: 'ssd_256',  name: 'SSD 256GB NVMe',   power: 5,  hashrate: 0, cost: 1500,  rarity: 'common',   img: 'img/storage/ssd-256.png' },
      { id: 'ssd_1tb',  name: 'SSD 1TB NVMe',     power: 6,  hashrate: 0, cost: 4500,  rarity: 'uncommon', img: 'img/storage/ssd-1tb.png' },
      { id: 'ssd_2tb',  name: 'SSD 2TB Gen4',     power: 8,  hashrate: 0, cost: 11000, rarity: 'rare',     img: 'img/storage/ssd-2tb.png' },
      { id: 'hdd_8tb',  name: 'HDD 8TB Enterprise',power: 12, hashrate: 0, cost: 16000, rarity: 'epic',    img: 'img/storage/hdd-8tb.png' },
    ],
    cooling: [
      { id: 'cool_tower', name: 'Башенный кулер',        power: 3,  hashrate: 0, cost: 2000,  rarity: 'common',   img: 'img/cooling/tower.png' },
      { id: 'cool_aio240',name: 'ВО 240мм AIO',          power: 8,  hashrate: 0, cost: 6000,  rarity: 'uncommon', img: 'img/cooling/aio-240.png' },
      { id: 'cool_aio360',name: 'ВО 360мм AIO Pro',      power: 12, hashrate: 0, cost: 12000, rarity: 'rare',     img: 'img/cooling/aio-360.png' },
      { id: 'cool_custom',name: 'Кастомный контур СЖО',  power: 25, hashrate: 0, cost: 40000, rarity: 'epic',     img: 'img/cooling/custom-loop.png' },
    ],
    psu: [
      { id: 'psu_500',  name: 'БП 500W 80+ Bronze',  power: 0, hashrate: 0, cost: 3500,  capacity: 500,  rarity: 'common',   img: 'img/psu/500w.png' },
      { id: 'psu_750',  name: 'БП 750W 80+ Gold',    power: 0, hashrate: 0, cost: 7500,  capacity: 750,  rarity: 'uncommon', img: 'img/psu/750w.png' },
      { id: 'psu_1000', name: 'БП 1000W 80+ Platinum',power: 0, hashrate: 0, cost: 16000, capacity: 1000, rarity: 'rare',     img: 'img/psu/1000w.png' },
      { id: 'psu_1600', name: 'БП 1600W Titanium',   power: 0, hashrate: 0, cost: 35000, capacity: 1600, rarity: 'epic',     img: 'img/psu/1600w.png' },
    ],
  });

  /* ------------------------------------------------------------
   * 4. ASIC-майнеры (готовые устройства для стоек)
   * ---------------------------------------------------------- */
  const ASICS = Object.freeze([
    { id: 'asic_antminer_s19',   name: 'Antminer S19 XP',   power: 3010, hashrateTh: 141, cost: 95000,  rarity: 'rare',      img: 'img/asics/s19xp.png' },
    { id: 'asic_antminer_s21',   name: 'Antminer S21',      power: 3500, hashrateTh: 200, cost: 160000, rarity: 'epic',      img: 'img/asics/s21.png' },
    { id: 'asic_a13_hydro',      name: 'Avalon A1366',      power: 3800, hashrateTh: 130, cost: 120000, rarity: 'epic',      img: 'img/asics/a1366.png' },
    { id: 'asic_microminer_m60', name: 'MicroBT M60S',      power: 3450, hashrateTh: 176, cost: 145000, rarity: 'rare',      img: 'img/asics/m60s.png' },
    { id: 'asic_icarus_omega',   name: 'Icarus Omega (RTX4090x6)', power: 2700, hashrateTh: 0, hashrate: 1140, cost: 260000, rarity: 'legendary', img: 'img/asics/omega.png' },
  ]);

  /* ------------------------------------------------------------
   * 5. Готовые ПК (превью — img/pc/, со студийным фоном)
   * ---------------------------------------------------------- */
  const PREBUILT_PCS = Object.freeze([
    { id: 'pc_starter',   name: 'Стартовый риг',      hashrate: 32,  power: 250,  price: 15000,  rarity: 'common',    img: 'img/pc/starter.png' },
    { id: 'pc_mid',       name: 'Mid-Gaming ферма',   hashrate: 95,  power: 620,  price: 55000,  rarity: 'uncommon',  img: 'img/pc/mid-gaming.png' },
    { id: 'pc_pro',       name: 'Pro Miner Station',  hashrate: 240, power: 1100, price: 150000, rarity: 'rare',      img: 'img/pc/pro-miner.png' },
    { id: 'pc_beast',     name: 'GPU Beast 8x',       hashrate: 620, power: 2200, price: 380000, rarity: 'epic',      img: 'img/pc/beast-8x.png' },
    { id: 'pc_quantum',   name: 'Quantum Farm X',     hashrate: 1200, power: 3000,price: 900000, rarity: 'legendary', img: 'img/pc/quantum-x.png' },
  ]);

  /* ------------------------------------------------------------
   * 6. Редкости — множители цены/доходности
   * ---------------------------------------------------------- */
  const RARITY = Object.freeze({
    common:    { label: 'Обычный',     multiplier: 1.0,  color: 'var(--rarity-common)' },
    uncommon:  { label: 'Необычный',   multiplier: 1.15, color: 'var(--rarity-uncommon)' },
    rare:      { label: 'Редкий',      multiplier: 1.35, color: 'var(--rarity-rare)' },
    epic:      { label: 'Эпический',   multiplier: 1.7,  color: 'var(--rarity-epic)' },
    legendary: { label: 'Легендарный', multiplier: 2.5,  color: 'var(--rarity-legendary)' },
  });

  /* ------------------------------------------------------------
   * 7. Поиск предметов
   * ---------------------------------------------------------- */
  function findPart(type, id) {
    return (PARTS[type] || []).find((p) => p.id === id) || null;
  }

  function findAsic(id) {
    return ASICS.find((a) => a.id === id) || null;
  }

  function findPrebuiltPc(id) {
    return PREBUILT_PCS.find((p) => p.id === id) || null;
  }

  /** Ищет предмет по id среди всех конфигураций. Возвращает { type, item }. */
  function findItemById(id) {
    for (const type of SLOT_TYPES) {
      const item = findPart(type, id);
      if (item) return { type, item };
    }
    const asic = findAsic(id);
    if (asic) return { type: 'asic', item: asic };
    const pc = findPrebuiltPc(id);
    if (pc) return { type: 'pc', item: pc };
    return null;
  }

  /* ------------------------------------------------------------
   * 8. Расчёт параметров сборки (чистые функции)
   * ---------------------------------------------------------- */

  /** Суммарное энергопотребление сборки, Вт. */
  function calcBuildPower(build) {
    return SLOT_TYPES.reduce((sum, slot) => {
      const part = build[slot];
      return sum + (part ? part.power : 0);
    }, 0);
  }

  /** Суммарный хэшрейт сборки, MH/s. */
  function calcBuildHashrate(build) {
    return SLOT_TYPES.reduce((sum, slot) => {
      const part = build[slot];
      return sum + (part ? part.hashrate : 0);
    }, 0);
  }

  /** Полная стоимость компонентов сборки, ₽ (с множителем редкости). */
  function calcBuildCost(build) {
    return SLOT_TYPES.reduce((sum, slot) => {
      const part = build[slot];
      if (!part) return sum;
      const mult = (RARITY[part.rarity] || RARITY.common).multiplier;
      return sum + Math.round(part.cost * mult);
    }, 0);
  }

  /** Мощность БП в сборке (0, если БП не выбран). */
  function calcPsuCapacity(build) {
    return build.psu ? build.psu.capacity || 0 : 0;
  }

  /* ------------------------------------------------------------
   * 9. Валидация сборки перед "Собрать ПК"
   *    Правила: все обязательные слоты заполнены; БП тянет
   *    потребление (запас 20%); общее потребление <= лимита сети.
   * ---------------------------------------------------------- */
  const REQUIRED_SLOTS = ['cpu', 'gpu', 'motherboard', 'ram', 'psu'];

  function validateBuild(build) {
    const errors = [];

    REQUIRED_SLOTS.forEach((slot) => {
      if (!build[slot]) errors.push(`Слот «${slot}» пуст`);
    });

    const power = calcBuildPower(build);
    const psuCap = calcPsuCapacity(build);

    if (build.psu && power > psuCap * 0.8) {
      errors.push(`БП ${psuCap}Вт не вытягивает ${power}Вт (нужен запас 20%)`);
    }
    if (power > CONSTANTS.POWER_LIMIT_WATT) {
      errors.push(`Превышен лимит сети ${CONSTANTS.POWER_LIMIT_WATT}Вт`);
    }
    // Совместимость сокета: условное правило — CPU и MB одной "платформы"
    if (build.cpu && build.motherboard && !isSocketCompatible(build.cpu, build.motherboard)) {
      errors.push('Не совместимы процессор и материнская плата');
    }

    return { valid: errors.length === 0, errors, power, hashrate: calcBuildHashrate(build), cost: calcBuildCost(build) };
  }

  /** Упрощённая проверка совместимости по префиксу id (демо-правило). */
  function isSocketCompatible(cpu, mb) {
    const intelCpu = cpu.id.startsWith('cpu_i');
    const amdCpu = !intelCpu;
    const intelMb = mb.id.includes('b660') || mb.id.includes('trx50');
    return intelCpu === intelMb || mb.id.includes('x670') === amdCpu || true; // skeleton: всегда ок
  }

  /* ------------------------------------------------------------
   * 10. Экономика майнинга
   * ---------------------------------------------------------- */

  /** Доход ASIC за час, ₽ (TH/s * сложность-константа - электричество). */
  function asicHourlyIncome(asic, networkDifficulty = 0.02) {
    const gross = (asic.hashrateTh || 0) * networkDifficulty * 1000;
    const electricity = asic.power * CONSTANTS.ELECTRICITY_RATE;
    return Math.max(0, gross - electricity);
  }

  /** Доход ПК-фермы за час, ₽. */
  function pcHourlyIncome(pcOrBuild, networkMultiplier = 0.9) {
    const hashrate = pcOrBuild.hashrate || calcBuildHashrate(pcOrBuild);
    const power = pcOrBuild.power || calcBuildPower(pcOrBuild);
    const gross = hashrate * networkMultiplier;
    const electricity = power * CONSTANTS.ELECTRICITY_RATE;
    return Math.max(0, gross - electricity);
  }

  /** Сила клика по уровню игрока. */
  function clickPowerByLevel(level) {
    return Math.round(CONSTANTS.BASE_CLICK_POWER + (level - 1) * CONSTANTS.CLICK_POWER_PER_LEVEL);
  }

  /** Цена следующего слота гаража. */
  function garageSlotPrice(currentSlots) {
    return CONSTANTS.SLOT_PRICE_BASE + (currentSlots - CONSTANTS.START_GARAGE_SLOTS) * CONSTANTS.SLOT_PRICE_STEP;
  }

  /* ------------------------------------------------------------
   * Экспорт в глобальную область (window.Rules)
   * ---------------------------------------------------------- */
  global.Rules = {
    CONSTANTS,
    SLOT_TYPES,
    REQUIRED_SLOTS,
    PARTS,
    ASICS,
    PREBUILT_PCS,
    RARITY,
    findPart,
    findAsic,
    findPrebuiltPc,
    findItemById,
    calcBuildPower,
    calcBuildHashrate,
    calcBuildCost,
    calcPsuCapacity,
    validateBuild,
    asicHourlyIncome,
    pcHourlyIncome,
    clickPowerByLevel,
    garageSlotPrice,
  };
})(typeof window !== 'undefined' ? window : globalThis);
