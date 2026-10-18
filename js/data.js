/* ============================================================
 * data.js — Справочники и базы данных
 * Crypto Rigs: Master & Mining (Telegram Mini App)
 *
 * Только данные, без логики. Логика — в rules.js / workshop.js /
 * rewards.js / fps.js. Координация UI — в game.js.
 * ============================================================ */

(function (global) {
  'use strict';

  /* ------------------------------------------------------------
   * 1. Редкости
   * ---------------------------------------------------------- */
  const RARITY = Object.freeze({
    common:    { order: 0, label: 'Обычный',     color: '#9aa4b2', multiplier: 1.00 },
    uncommon:  { order: 1, label: 'Необычный',   color: '#3fb950', multiplier: 1.15 },
    rare:      { order: 2, label: 'Редкий',      color: '#58a6ff', multiplier: 1.35 },
    epic:      { order: 3, label: 'Эпический',   color: '#bc8cff', multiplier: 1.70 },
    legendary: { order: 4, label: 'Легендарный', color: '#f0b429', multiplier: 2.50 },
  });

  /* ------------------------------------------------------------
   * 2. Восемь слотов сборки ПК
   *    required — без этого комплектующего сборка не запускается
   * ---------------------------------------------------------- */
  const SLOT_TYPES = Object.freeze([
    { id: 'cpu',         label: 'Процессор (CPU)',      icon: '🧠', required: true },
    { id: 'gpu',         label: 'Видеокарта (GPU)',     icon: '🎮', required: false },
    { id: 'motherboard', label: 'Материнская плата',    icon: '🔲', required: true },
    { id: 'ram',         label: 'Оперативная память',   icon: '📊', required: true },
    { id: 'storage',     label: 'Накопитель (SSD/HDD)', icon: '💾', required: false },
    { id: 'cooling',     label: 'Охлаждение',           icon: '❄️', required: false },
    { id: 'psu',         label: 'Блок питания (PSU)',   icon: '🔌', required: true },
    { id: 'case',        label: 'Корпус / Рама',        icon: '🖥️', required: false },
  ]);

  /* ------------------------------------------------------------
   * 3. Комплектующие по слотам
   *    power    — энергопотребление, Вт (для PSU — capacity, Вт)
   *    hashrate — MH/s (вклад в майнинг)
   *    fps      — вклад в FPS-очки (бенчмарк-дуэли)
   *    cool     — очки охлаждения (стабильность в дуэлях)
   *    tier     — уровень детали для системы слияния (1..5)
   * ---------------------------------------------------------- */
  const PARTS = Object.freeze({
    cpu: [
      { id: 'cpu_i3_12100',  tier: 1, name: 'Intel Core i3-12100',    power: 60,  hashrate: 0.4, fps: 120,  cost: 4500,  rarity: 'common',    img: 'img/cpus/i3-12100.png' },
      { id: 'cpu_r5_5600',   tier: 2, name: 'AMD Ryzen 5 5600',       power: 65,  hashrate: 0.8, fps: 260,  cost: 9000,  rarity: 'uncommon',  img: 'img/cpus/ryzen-5-5600.png' },
      { id: 'cpu_r7_7700x',  tier: 3, name: 'AMD Ryzen 7 7700X',      power: 105, hashrate: 1.6, fps: 520,  cost: 21000, rarity: 'rare',      img: 'img/cpus/ryzen-7-7700x.png' },
      { id: 'cpu_i9_14900k', tier: 4, name: 'Intel Core i9-14900K',   power: 253, hashrate: 3.0, fps: 980,  cost: 55000, rarity: 'epic',      img: 'img/cpus/i9-14900k.png' },
      { id: 'cpu_tr_7970x',  tier: 5, name: 'Threadripper 7970X',     power: 350, hashrate: 6.0, fps: 1750, cost: 180000, rarity: 'legendary', img: 'img/cpus/threadripper-7970x.png' },
    ],
    gpu: [
      { id: 'gpu_gtx1660',  tier: 1, name: 'GTX 1660 Super', power: 125, hashrate: 31,  fps: 420,  cost: 14000,  rarity: 'common',    img: 'img/gpus/gtx-1660s.png' },
      { id: 'gpu_rtx3060',  tier: 2, name: 'RTX 3060 12GB',  power: 170, hashrate: 48,  fps: 850,  cost: 26000,  rarity: 'uncommon',  img: 'img/gpus/rtx-3060.png' },
      { id: 'gpu_rtx4070',  tier: 3, name: 'RTX 4070',       power: 200, hashrate: 85,  fps: 1600, cost: 62000,  rarity: 'rare',      img: 'img/gpus/rtx-4070.png' },
      { id: 'gpu_rx7900xtx',tier: 4, name: 'RX 7900 XTX',    power: 355, hashrate: 140, fps: 2600, cost: 95000,  rarity: 'epic',      img: 'img/gpus/rx-7900xtx.png' },
      { id: 'gpu_rtx4090',  tier: 5, name: 'RTX 4090',       power: 450, hashrate: 190, fps: 4200, cost: 210000, rarity: 'legendary', img: 'img/gpus/rtx-4090.png' },
    ],
    motherboard: [
      { id: 'mb_b660m',  tier: 1, name: 'MSI PRO B660M',       power: 40, hashrate: 0, fps: 40,  cost: 6000,  rarity: 'common',    img: 'img/motherboards/b660m.png' },
      { id: 'mb_b650',   tier: 2, name: 'Gigabyte B650 Aorus', power: 45, hashrate: 0, fps: 90,  cost: 12000, rarity: 'uncommon',  img: 'img/motherboards/b650.png' },
      { id: 'mb_x670e',  tier: 3, name: 'ASUS ROG X670E',      power: 60, hashrate: 0, fps: 180, cost: 32000, rarity: 'rare',      img: 'img/motherboards/x670e.png' },
      { id: 'mb_trx50',  tier: 4, name: 'ASUS Pro WS TRX50',   power: 80, hashrate: 0, fps: 320, cost: 85000, rarity: 'epic',      img: 'img/motherboards/trx50.png' },
    ],
    ram: [
      { id: 'ram_16_d4',   tier: 1, name: '16GB DDR4 3200',   power: 10, hashrate: 0.5, fps: 120, cost: 3000,  rarity: 'common',    img: 'img/ram/ddr4-16.png' },
      { id: 'ram_32_d5',   tier: 2, name: '32GB DDR5 6000',   power: 14, hashrate: 1.2, fps: 260, cost: 8000,  rarity: 'uncommon',  img: 'img/ram/ddr5-32.png' },
      { id: 'ram_64_d5',   tier: 3, name: '64GB DDR5 6400',   power: 20, hashrate: 2.5, fps: 480, cost: 19000, rarity: 'rare',      img: 'img/ram/ddr5-64.png' },
      { id: 'ram_128_ecc', tier: 4, name: '128GB ECC DDR5',   power: 30, hashrate: 5.0, fps: 760, cost: 60000, rarity: 'epic',      img: 'img/ram/ecc-128.png' },
    ],
    storage: [
      { id: 'ssd_256', tier: 1, name: 'SSD 256GB NVMe',    power: 5,  hashrate: 0, fps: 20,  cost: 1500,  rarity: 'common',    img: 'img/storage/ssd-256.png' },
      { id: 'ssd_1tb', tier: 2, name: 'SSD 1TB NVMe',      power: 6,  hashrate: 0, fps: 40,  cost: 4500,  rarity: 'uncommon',  img: 'img/storage/ssd-1tb.png' },
      { id: 'ssd_2tb', tier: 3, name: 'SSD 2TB Gen4',      power: 8,  hashrate: 0, fps: 70,  cost: 11000, rarity: 'rare',      img: 'img/storage/ssd-2tb.png' },
      { id: 'hdd_8tb', tier: 4, name: 'HDD 8TB Enterprise', power: 12, hashrate: 0, fps: 30, cost: 16000, rarity: 'epic',      img: 'img/storage/hdd-8tb.png' },
    ],
    cooling: [
      { id: 'cool_tower',  tier: 1, name: 'Башенный кулер',       power: 3,  hashrate: 0, cool: 30,  cost: 2000,  rarity: 'common',   img: 'img/cooling/tower.png' },
      { id: 'cool_aio240', tier: 2, name: 'СЖО 240мм AIO',        power: 8,  hashrate: 0, cool: 70,  cost: 6000,  rarity: 'uncommon', img: 'img/cooling/aio-240.png' },
      { id: 'cool_aio360', tier: 3, name: 'СЖО 360мм AIO Pro',    power: 12, hashrate: 0, cool: 130, cost: 12000, rarity: 'rare',     img: 'img/cooling/aio-360.png' },
      { id: 'cool_custom', tier: 4, name: 'Кастомный контур СЖО', power: 25, hashrate: 0, cool: 240, cost: 40000, rarity: 'epic',     img: 'img/cooling/custom-loop.png' },
    ],
    psu: [
      { id: 'psu_500',  tier: 1, name: 'БП 500W 80+ Bronze',   capacity: 500,  power: 0, hashrate: 0, fps: 0, cost: 3500,  rarity: 'common',   img: 'img/psu/500w.png' },
      { id: 'psu_750',  tier: 2, name: 'БП 750W 80+ Gold',     capacity: 750,  power: 0, hashrate: 0, fps: 0, cost: 7500,  rarity: 'uncommon', img: 'img/psu/750w.png' },
      { id: 'psu_1000', tier: 3, name: 'БП 1000W 80+ Platinum',capacity: 1000, power: 0, hashrate: 0, fps: 0, cost: 16000, rarity: 'rare',     img: 'img/psu/1000w.png' },
      { id: 'psu_1600', tier: 4, name: 'БП 1600W Titanium',    capacity: 1600, power: 0, hashrate: 0, fps: 0, cost: 35000, rarity: 'epic',     img: 'img/psu/1600w.png' },
    ],
    case: [
      { id: 'case_basic', tier: 1, name: 'Корпус AeroCool Basic', power: 0, hashrate: 0, fps: 10, slots: 1, cost: 1500,  rarity: 'common',   img: 'img/pc/starter.png' },
      { id: 'case_glass', tier: 2, name: 'NZXT H5 Flow RGB',      power: 0, hashrate: 0, fps: 30, slots: 1, cost: 4500,  rarity: 'uncommon', img: 'img/pc/mid-gaming.png' },
      { id: 'case_open',  tier: 3, name: 'Открытая рама 6 GPU',   power: 0, hashrate: 0, fps: 50, slots: 2, cost: 12000, rarity: 'rare',     img: 'img/pc/pro-miner.png' },
      { id: 'case_rack',  tier: 4, name: 'Стойка-корпус 8 GPU',   power: 0, hashrate: 0, fps: 90, slots: 3, cost: 30000, rarity: 'epic',     img: 'img/pc/beast-8x.png' },
    ],
  });

  /* ------------------------------------------------------------
   * 4. Готовые ASIC-майнеры
   * ---------------------------------------------------------- */
  const ASICS = Object.freeze([
    { id: 'asic_s19xp',  name: 'Antminer S19 XP',          power: 3010, hashrateTh: 141, cost: 95000,  rarity: 'rare',      img: 'img/asics/s19xp.png' },
    { id: 'asic_m60s',   name: 'MicroBT M60S',             power: 3450, hashrateTh: 176, cost: 145000, rarity: 'rare',      img: 'img/asics/m60s.png' },
    { id: 'asic_s21',    name: 'Antminer S21',             power: 3500, hashrateTh: 200, cost: 160000, rarity: 'epic',      img: 'img/asics/s21.png' },
    { id: 'asic_a1366',  name: 'Avalon A1366',             power: 3800, hashrateTh: 130, cost: 120000, rarity: 'epic',      img: 'img/asics/a1366.png' },
    { id: 'asic_omega',  name: 'ICARUS OMEGA (4090×6)',    power: 2700, hashrateTh: 0, hashrateMH: 1140, fps: 3600, cost: 260000, rarity: 'legendary', img: 'img/asics/omega.png' },
  ]);

  /* ------------------------------------------------------------
   * 5. Готовые ПК (превью — img/pc/)
   * ---------------------------------------------------------- */
  const PREBUILT_PCS = Object.freeze([
    { id: 'pc_starter', name: 'Стартовый риг',     hashrate: 32,   power: 250,  fps: 500,  price: 15000, rarity: 'common',    img: 'img/pc/starter.png' },
    { id: 'pc_mid',     name: 'Mid-Gaming ферма',  hashrate: 95,   power: 620,  fps: 1400, price: 55000, rarity: 'uncommon',  img: 'img/pc/mid-gaming.png' },
    { id: 'pc_pro',     name: 'Pro Miner Station', hashrate: 240,  power: 1100, fps: 2800, price: 150000, rarity: 'rare',      img: 'img/pc/pro-miner.png' },
    { id: 'pc_beast',   name: 'GPU Beast 8x',      hashrate: 620,  power: 2200, fps: 5200, price: 380000, rarity: 'epic',      img: 'img/pc/beast-8x.png' },
    { id: 'pc_quantum', name: 'Quantum Farm X',    hashrate: 1200, power: 3000, fps: 9000, price: 900000, rarity: 'legendary', img: 'img/pc/quantum-x.png' },
  ]);

  /* ------------------------------------------------------------
   * 6. Кейсы (типы кейсов + пулы дропа). Шансы = weight / сумма.
   * ---------------------------------------------------------- */
  const CASES = Object.freeze({
    case_start: {
      id: 'case_start', name: 'Стартовый кейс', icon: '📦', price: 1000, color: '#9aa4b2',
      pool: [
        { weight: 55, itemId: 'ram_16_d4' },
        { weight: 22, itemId: 'ssd_256' },
        { weight: 12, itemId: 'cpu_i3_12100' },
        { weight: 8,  itemId: 'gpu_gtx1660' },
        { weight: 3,  itemId: 'gpu_rtx3060' },
      ],
    },
    case_gamer: {
      id: 'case_gamer', name: 'Геймерский кейс', icon: '🎮', price: 5000, color: '#58a6ff',
      pool: [
        { weight: 40, itemId: 'cpu_r5_5600' },
        { weight: 26, itemId: 'gpu_rtx3060' },
        { weight: 16, itemId: 'mb_b650' },
        { weight: 10, itemId: 'ram_32_d5' },
        { weight: 6,  itemId: 'gpu_rtx4070' },
        { weight: 2,  itemId: 'cool_aio360' },
      ],
    },
    case_miner: {
      id: 'case_miner', name: 'Майнерский кейс', icon: '⛏️', price: 15000, color: '#3fb950',
      pool: [
        { weight: 34, itemId: 'gpu_rtx4070' },
        { weight: 24, itemId: 'psu_1000' },
        { weight: 18, itemId: 'ram_64_d5' },
        { weight: 12, itemId: 'case_open' },
        { weight: 8,  itemId: 'cpu_i9_14900k' },
        { weight: 4,  itemId: 'gpu_rx7900xtx' },
      ],
    },
    case_asic: {
      id: 'case_asic', name: 'ASIC-контейнер', icon: '🗄️', price: 60000, color: '#bc8cff',
      pool: [
        { weight: 45, itemId: 'psu_1600' },
        { weight: 25, itemId: 'case_rack' },
        { weight: 14, itemId: 'asic_s19xp' },
        { weight: 9,  itemId: 'asic_m60s' },
        { weight: 5,  itemId: 'asic_s21' },
        { weight: 2,  itemId: 'asic_a1366' },
      ],
    },
    case_legend: {
      id: 'case_legend', name: 'Легендарный кейс', icon: '👑', price: 250000, color: '#f0b429',
      pool: [
        { weight: 40, itemId: 'cpu_i9_14900k' },
        { weight: 26, itemId: 'gpu_rx7900xtx' },
        { weight: 14, itemId: 'pc_beast' },
        { weight: 10, itemId: 'gpu_rtx4090' },
        { weight: 6,  itemId: 'asic_omega' },
        { weight: 4,  itemId: 'cpu_tr_7970x' },
      ],
    },
    case_reward: {
      id: 'case_reward', name: 'Кейс наград (4ч)', icon: '🎁', price: 0, color: '#3fb950', freeEveryMs: 4 * 60 * 60 * 1000,
      pool: [
        { weight: 40, itemId: 'ram_16_d4' },
        { weight: 20, itemId: 'ssd_1tb' },
        { weight: 15, itemId: 'cpu_r5_5600' },
        { weight: 10, itemId: 'gpu_rtx3060' },
        { weight: 8,  itemId: 'mb_b650' },
        { weight: 5,  itemId: 'cool_aio240' },
        { weight: 2,  itemId: 'gpu_rtx4070' },
      ],
    },
  });

  /* ------------------------------------------------------------
   * 7. Уровни игрока
   * ---------------------------------------------------------- */
  const LEVELS = Object.freeze(
    Array.from({ length: 30 }, (_, i) => {
      const n = i + 1;
      return {
        level: n,
        xpNeed: Math.round(100 * Math.pow(n, 1.35)),
        clickBonus: n,                    // +₽ за клик за каждый уровень
        reward: n % 5 === 0 ? { type: 'case_key', caseId: 'case_gamer', amount: 1 } : null,
      };
    })
  );

  /* ------------------------------------------------------------
   * 8. Задания (квесты)
   * ---------------------------------------------------------- */
  const QUESTS = Object.freeze([
    { id: 'q_first_build', title: 'Первая сборка', desc: 'Соберите первый ПК в Мастерской', goal: 1,  metric: 'buildsAssembled', reward: { type: 'currency', amount: 5000 } },
    { id: 'q_cases_3',     title: 'Испытай удачу', desc: 'Откройте 3 кейса',                 goal: 3,  metric: 'casesOpened',     reward: { type: 'case_key', caseId: 'case_gamer', amount: 1 } },
    { id: 'q_merge_1',     title: 'Алхимик железа', desc: 'Слейте 3 одинаковые детали',     goal: 1,  metric: 'mergesDone',      reward: { type: 'currency', amount: 8000 } },
    { id: 'q_fps_3',       title: 'Бенчмаркер',     desc: 'Победите в 3 FPS-дуэлях',        goal: 3,  metric: 'duelsWon',        reward: { type: 'case_key', caseId: 'case_miner', amount: 1 } },
    { id: 'q_sell_coins',  title: 'HODL не для нас', desc: 'Продайте монеты 1 раз',          goal: 1,  metric: 'coinsSold',       reward: { type: 'currency', amount: 2500 } },
    { id: 'q_rack_1',      title: 'Расширяем ферму', desc: 'Купите майнинг-стойку',          goal: 1,  metric: 'racksBought',     reward: { type: 'case_key', caseId: 'case_asic', amount: 1 } },
  ]);

  /* ------------------------------------------------------------
   * 9. Противники для FPS-дуэлей
   * ---------------------------------------------------------- */
  const FPS_OPPONENTS = Object.freeze([
    { id: 'opp_office', name: 'Офисный ПК «Бухгалтер»',   tier: 1, fps: 350,   reward: 1500 },
    { id: 'opp_noob',   name: 'Новичок с б/у GTX',        tier: 1, fps: 900,   reward: 3500 },
    { id: 'opp_gamer',  name: 'Геймер Дима (RTX 3060)',   tier: 2, fps: 2200,  reward: 9000 },
    { id: 'opp_stream', name: 'Стримерша Kira',           tier: 3, fps: 4800,  reward: 22000 },
    { id: 'opp_crypto', name: 'Крипто-энтузиаст Макс',    tier: 4, fps: 8200,  reward: 55000 },
    { id: 'opp_whale',  name: 'Кит @whale_farm',          tier: 5, fps: 14000, reward: 150000 },
  ]);

  /* ------------------------------------------------------------
   * 10. Экономика / константы
   * ---------------------------------------------------------- */
  const ECONOMY = Object.freeze({
    START_BALANCE_RUB: 50000,             // стартовый рублёвый баланс
    START_COINS: 0,
    COIN_TICKER: 'CR',                    // игровая крипта (условный BTC-подобный токен)
    COIN_PRICE_RUB: 640000,               // 1 CR = ₽ (конвертация при продаже)
    MINING_CAP_HOURS: 4,                  // доход копится максимум 4 часа
    ELECTRICITY_RATE: 0.05,               // ₽ за Вт в час обслуживания
    HASH_TO_COIN: 0.000012,               // MH/s -> CR/час (масштаб)
    TH_TO_COIN: 0.00015,                  // TH/s -> CR/час (ASIC)
    POWER_LIMIT_WATT: 3000,               // лимит домашней сети
    FUSE_BURN_CHANCE: 0.12,               // риск сгорания детали при слиянии
    MERGE_COUNT: 3,                       // 3 детали -> 1 выше рангом
    DUEL_ENERGY_MAX: 10,                  // энергия для FPS-битв
    DUEL_ENERGY_REGEN_MS: 25 * 60 * 1000, // +1 энергии каждые 25 минут
    DUEL_COST_ENERGY: 2,                  // стоимость одной дуэли
    GARAGE_START_SLOTS: 5,
    GARAGE_MAX_SLOTS: 30,
    SLOT_PRICE_BASE: 5000,
    SLOT_PRICE_STEP: 2500,
    RACK_PRICE: 25000,
    RACK_SLOTS: 3,
    REWARD_CASE_INTERVAL_MS: 4 * 60 * 60 * 1000, // кейс наград каждые 4 часа
    TICK_INTERVAL_MS: 1000,
    SAVE_KEY: 'cryptorigs_save_v2',
  });

  /* ------------------------------------------------------------
   * Экспорт
   * ---------------------------------------------------------- */
  Object.assign(globalThis, {
    Data: {
      RARITY,
      SLOT_TYPES,
      PARTS,
      ASICS,
      PREBUILT_PCS,
      CASES,
      LEVELS,
      QUESTS,
      FPS_OPPONENTS,
      ECONOMY,
    },
  });
})(typeof window !== 'undefined' ? window : globalThis);
