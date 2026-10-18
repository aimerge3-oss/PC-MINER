/* ============================================================
 * rewards.js — Логика наград
 * PC-Miner Telegram Mini App
 *
 * Содержит:
 *  - Ежедневный бонус с streak-серией (7-дневный цикл)
 *  - Систему кейсов (конфигурация + взвешенный дроп)
 *  - Коллекцию собранных устройств
 *  - Управление слотами гаража и майнинг-стойками
 *
 * Модуль работает с state-объектом игры и не трогает DOM.
 * ============================================================ */

(function (global) {
  'use strict';

  const R = () => global.Rules; // доступ к rules.js (загружается раньше)

  /* ------------------------------------------------------------
   * 1. Ежедневный бонус (streak)
   * ---------------------------------------------------------- */
  const DAILY_BONUS_TABLE = Object.freeze([
    { day: 1, reward: { type: 'currency', amount: 500 } },
    { day: 2, reward: { type: 'currency', amount: 1000 } },
    { day: 3, reward: { type: 'case_key', caseId: 'case_bronze', amount: 1 } },
    { day: 4, reward: { type: 'currency', amount: 2500 } },
    { day: 5, reward: { type: 'case_key', caseId: 'case_silver', amount: 1 } },
    { day: 6, reward: { type: 'currency', amount: 5000 } },
    { day: 7, reward: { type: 'case_key', caseId: 'case_gold', amount: 1 } }, // "красивый" день цикла
  ]);

  const DAY_MS = 24 * 60 * 60 * 1000;

  /** Можно ли забрать бонус сегодня? */
  function canClaimDaily(state) {
    const last = state.daily.lastClaimTs || 0;
    return Date.now() - last >= DAY_MS;
  }

  /** Рассчитывает streak: если пропуск > 1 дня — сброс на 1. */
  function claimDailyBonus(state) {
    if (!canClaimDaily(state)) {
      return { ok: false, reason: 'already_claimed' };
    }
    const last = state.daily.lastClaimTs || 0;
    const gapDays = last ? Math.floor((Date.now() - last) / DAY_MS) : Infinity;

    state.daily.streak = gapDays <= 1 ? Math.min(state.daily.streak + 1, 7) : 1;
    state.daily.lastClaimTs = Date.now();

    const cycleDay = ((state.daily.streak - 1) % 7);
    const entry = DAILY_BONUS_TABLE[cycleDay];
    const bonus = applyReward(state, entry.reward, state.daily.streak);

    return { ok: true, streak: state.daily.streak, day: cycleDay + 1, reward: bonus };
  }

  /* ------------------------------------------------------------
   * 2. Кейсы с наградами (взвешенный дроп)
   * ---------------------------------------------------------- */
  const CASES = Object.freeze({
    case_bronze: {
      id: 'case_bronze', name: 'Бронзовый кейс', icon: '🥉', price: 1000,
      pool: [
        { weight: 60, drop: { type: 'part', itemId: 'ram_16_d4' } },
        { weight: 25, drop: { type: 'part', itemId: 'ssd_256' } },
        { weight: 12, drop: { type: 'part', itemId: 'gpu_gtx1660' } },
        { weight: 3,  drop: { type: 'part', itemId: 'gpu_rtx3060' } },
      ],
    },
    case_silver: {
      id: 'case_silver', name: 'Серебряный кейс', icon: '🥈', price: 5000,
      pool: [
        { weight: 45, drop: { type: 'part', itemId: 'cpu_r5_5600' } },
        { weight: 30, drop: { type: 'part', itemId: 'gpu_rtx3060' } },
        { weight: 18, drop: { type: 'part', itemId: 'mb_b650' } },
        { weight: 6,  drop: { type: 'part', itemId: 'gpu_rtx4070' } },
        { weight: 1,  drop: { type: 'asic', itemId: 'asic_microminer_m60' } },
      ],
    },
    case_gold: {
      id: 'case_gold', name: 'Золотой кейс', icon: '🥇', price: 20000,
      pool: [
        { weight: 40, drop: { type: 'part', itemId: 'gpu_rtx4070' } },
        { weight: 25, drop: { type: 'part', itemId: 'cpu_i9_14900k' } },
        { weight: 20, drop: { type: 'pc', itemId: 'pc_mid' } },
        { weight: 12, drop: { type: 'asic', itemId: 'asic_antminer_s19' } },
        { weight: 3,  drop: { type: 'part', itemId: 'gpu_rtx4090' } },
      ],
    },
  });

  /** Взвешенный выбор награды из пула кейса. */
  function rollCase(caseId, rng = Math.random) {
    const cfg = CASES[caseId];
    if (!cfg) return null;
    const total = cfg.pool.reduce((s, e) => s + e.weight, 0);
    let roll = rng() * total;
    for (const entry of cfg.pool) {
      roll -= entry.weight;
      if (roll <= 0) return entry.drop;
    }
    return cfg.pool[cfg.pool.length - 1].drop;
  }

  /**
   * Открыть кейс: списывает валюту/ключ и кладёт предмет в коллекцию.
   * @returns {{ok:boolean, item?:object, reason?:string}}
   */
  function openCase(state, caseId) {
    const cfg = CASES[caseId];
    if (!cfg) return { ok: false, reason: 'unknown_case' };

    const keys = state.inventory.keys[caseId] || 0;
    if (keys > 0) {
      state.inventory.keys[caseId] -= 1; // сначала тратим ключи
    } else if (state.balance >= cfg.price) {
      state.balance -= cfg.price;
    } else {
      return { ok: false, reason: 'not_enough_funds' };
    }

    const drop = rollCase(caseId);
    const item = addToCollection(state, drop);
    return { ok: true, item, caseId };
  }

  /* ------------------------------------------------------------
   * 3. Универсальное применение награды
   * ---------------------------------------------------------- */
  function applyReward(state, reward, streakMultiplier = 1) {
    switch (reward.type) {
      case 'currency': {
        const amount = Math.round(reward.amount * (1 + (streakMultiplier - 1) * 0.1));
        state.balance += amount;
        return { ...reward, finalAmount: amount };
      }
      case 'crypto': {
        state.crypto += reward.amount;
        return reward;
      }
      case 'case_key': {
        state.inventory.keys[reward.caseId] = (state.inventory.keys[reward.caseId] || 0) + reward.amount;
        return reward;
      }
      case 'part':
      case 'asic':
      case 'pc':
        return addToCollection(state, reward);
      default:
        return reward;
    }
  }

  /* ------------------------------------------------------------
   * 4. Коллекция собранных устройств
   * ---------------------------------------------------------- */
  function addToCollection(state, drop) {
    const found = R().findItemById(drop.itemId);
    if (!found) return null;
    const instance = {
      uid: `${drop.itemId}_${Date.now()}_${Math.floor(Math.random() * 1e4)}`,
      id: drop.itemId,
      type: found.type,     // part | asic | pc
      name: found.item.name,
      rarity: found.item.rarity,
      img: found.item.img,
      acquiredAt: Date.now(),
      placedIn: null,       // rackId, если установлен в стойку
    };
    state.collection.push(instance);
    return instance;
  }

  /** Добавляет собранный ПК (из текущей сборки) в коллекцию. */
  function addAssembledPc(state, buildResult, buildName) {
    const instance = {
      uid: `custom_${Date.now()}_${Math.floor(Math.random() * 1e4)}`,
      id: 'custom_build',
      type: 'pc',
      name: buildName || 'Кастомная сборка',
      rarity: 'uncommon',
      hashrate: buildResult.hashrate,
      power: buildResult.power,
      img: 'img/pc/custom.png',
      acquiredAt: Date.now(),
      placedIn: null,
    };
    state.collection.push(instance);
    return instance;
  }

  function removeFromCollection(state, uid) {
    const idx = state.collection.findIndex((i) => i.uid === uid);
    if (idx === -1) return null;
    const [item] = state.collection.splice(idx, 1);
    // Если был в стойке — освобождаем ячейку
    state.racks.forEach((rack) => {
      rack.slots = rack.slots.map((s) => (s === uid ? null : s));
    });
    item.placedIn = null;
    return item;
  }

  /* ------------------------------------------------------------
   * 5. Гараж: слоты
   * ---------------------------------------------------------- */
  function garageCapacity(state) {
    return state.garage.slots; // максимум предметов в гараже
  }

  function garageIsFull(state) {
    return state.collection.filter((i) => !i.placedIn).length >= state.garage.slots;
  }

  function buyGarageSlot(state) {
    const rules = R();
    if (state.garage.slots >= rules.CONSTANTS.MAX_GARAGE_SLOTS) {
      return { ok: false, reason: 'max_slots' };
    }
    const price = rules.garageSlotPrice(state.garage.slots);
    if (state.balance < price) return { ok: false, reason: 'not_enough_funds', price };
    state.balance -= price;
    state.garage.slots += 1;
    return { ok: true, slots: state.garage.slots, price };
  }

  /* ------------------------------------------------------------
   * 6. Майнинг-стойки (размещение ASIC / ПК-ферм)
   * ---------------------------------------------------------- */
  function buyRack(state) {
    const price = R().CONSTANTS.RACK_PRICE;
    if (state.balance < price) return { ok: false, reason: 'not_enough_funds' };
    state.balance -= price;
    state.racks.push({
      id: `rack_${Date.now()}`,
      name: `Стойка #${state.racks.length + 1}`,
      slots: new Array(R().CONSTANTS.START_RACK_SLOTS).fill(null),
    });
    return { ok: true, rack: state.racks[state.racks.length - 1] };
  }

  /** Устанавливает устройство из коллекции в свободную ячейку стойки. */
  function placeInRack(state, itemUid, rackId, slotIndex) {
    const rack = state.racks.find((r) => r.id === rackId);
    const item = state.collection.find((i) => i.uid === itemUid);
    if (!rack || !item) return { ok: false, reason: 'not_found' };
    if (slotIndex < 0 || slotIndex >= rack.slots.length) return { ok: false, reason: 'bad_slot' };
    if (rack.slots[slotIndex]) return { ok: false, reason: 'slot_busy' };
    if (item.placedIn) return { ok: false, reason: 'already_placed' };

    rack.slots[slotIndex] = item.uid;
    item.placedIn = rackId;
    return { ok: true };
  }

  /** Суммарный хэшрейт всех установленных устройств (для дохода). */
  function totalHashrate(state) {
    let mh = 0, th = 0;
    state.racks.forEach((rack) => {
      rack.slots.forEach((uid) => {
        if (!uid) return;
        const item = state.collection.find((i) => i.uid === uid);
        if (!item) return;
        const src = R().findItemById(item.id) && R().findItemById(item.id).item;
        const data = item.hashrate != null ? item : src;
        mh += data.hashrate || 0;
        th += data.hashrateTh || 0;
      });
    });
    return { mh, th };
  }

  /** Доход стоек за один тик (секунду), ₽. */
  function tickIncome(state) {
    const rules = R();
    let income = 0;
    state.racks.forEach((rack) => {
      rack.slots.forEach((uid) => {
        if (!uid) return;
        const item = state.collection.find((i) => i.uid === uid);
        if (!item) return;
        const found = rules.findItemById(item.id);
        const data = found ? found.item : item;
        if (data.hashrateTh != null) income += rules.asicHourlyIncome(data) / 3600;
        else income += rules.pcHourlyIncome(data) / 3600;
      });
    });
    return income;
  }

  /* ------------------------------------------------------------
   * 7. Начальное состояние модуля наград (дефолты для state)
   * ---------------------------------------------------------- */
  function defaultRewardsState() {
    const rules = R();
    return {
      balance: rules.CONSTANTS.START_BALANCE,
      crypto: 0,
      level: 1,
      xp: 0,
      daily: { streak: 0, lastClaimTs: 0 },
      inventory: { keys: {} },           // caseId -> кол-во ключей
      collection: [],                    // собранные устройства
      garage: { slots: rules.CONSTANTS.START_GARAGE_SLOTS },
      racks: [],
    };
  }

  /* ------------------------------------------------------------
   * Экспорт (window.Rewards)
   * ---------------------------------------------------------- */
  global.Rewards = {
    DAILY_BONUS_TABLE,
    CASES,
    canClaimDaily,
    claimDailyBonus,
    rollCase,
    openCase,
    applyReward,
    addToCollection,
    addAssembledPc,
    removeFromCollection,
    garageCapacity,
    garageIsFull,
    buyGarageSlot,
    buyRack,
    placeInRack,
    totalHashrate,
    tickIncome,
    defaultRewardsState,
  };
})(typeof window !== 'undefined' ? window : globalThis);
