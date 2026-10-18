/* ============================================================
 * rules.js — Общая игровая логика и правила
 * Crypto Rigs: Master & Mining (Telegram Mini App)
 *
 * globalThis.Rules:
 *  - чистые формулы (хэшрейт, энергопотребление, доход CR/₽);
 *  - Rules.GameError — типизированные ошибки игрока;
 *  - Rules.actions — все действия игрока (чистые функции над state);
 *  - Rules.run(name, ...args) — единая точка вызова с обработкой ошибок.
 *
 * Модуль НЕ трогает DOM. Данные берутся из data.js (globalThis.Data).
 * ============================================================ */

(function (global) {
  'use strict';

  const D = () => global.Data;
  const E = () => global.Data.ECONOMY;

  /* ------------------------------------------------------------
   * 1. Типизированная ошибка игры
   * ---------------------------------------------------------- */
  class GameError extends Error {
    constructor(code, message, meta = {}) {
      super(message);
      this.name = 'GameError';
      this.code = code;   // 'not_enough_funds' | 'missing_parts' | ...
      this.meta = meta;
    }
  }

  /* ------------------------------------------------------------
   * 2. Поиск предметов
   * ---------------------------------------------------------- */
  function findPart(type, id) {
    return (D().PARTS[type] || []).find((p) => p.id === id) || null;
  }

  function findAsic(id) {
    return D().ASICS.find((a) => a.id === id) || null;
  }

  function findPrebuiltPc(id) {
    return D().PREBUILT_PCS.find((p) => p.id === id) || null;
  }

  /** Ищет любой предмет по id -> { type: 'part'|'asic'|'pc', slot?, item }. */
  function findItemById(id) {
    for (const slot of D().SLOT_TYPES) {
      const item = findPart(slot.id, id);
      if (item) return { type: 'part', slot: slot.id, item };
    }
    const asic = findAsic(id);
    if (asic) return { type: 'asic', item: asic };
    const pc = findPrebuiltPc(id);
    if (pc) return { type: 'pc', item: pc };
    return null;
  }

  /* ------------------------------------------------------------
   * 3. Формулы сборки (build = { cpu: partObj|null, gpu: ..., ... })
   * ---------------------------------------------------------- */

  /** Суммарное энергопотребление активных устройств фермы, Вт. */
  function calcBuildPower(build) {
    return D().SLOT_TYPES.reduce((sum, s) => sum + (build[s.id] ? build[s.id].power : 0), 0);
  }

  /** Хэшрейт ПК-сборки, MH/s. */
  function calcBuildHashrate(build) {
    return D().SLOT_TYPES.reduce((sum, s) => sum + (build[s.id] ? build[s.id].hashrate : 0), 0);
  }

  /** FPS-очки сборки (для дуэлей): GPU весит больше всех. */
  function calcBuildFps(build) {
    let fps = 0;
    if (build.cpu) fps += build.cpu.fps * 0.7;
    if (build.gpu) fps += build.gpu.fps * 1.6;
    if (build.ram) fps += build.ram.fps;
    if (build.motherboard) fps += build.motherboard.fps;
    if (build.storage) fps += build.storage.fps;
    if (build.case) fps += build.case.fps;
    // Охлаждение даёт бонус стабильности: до +50% к очкам
    const cool = build.cooling ? build.cooling.cool : 0;
    return Math.round(fps * (1 + Math.min(0.5, cool / 30 * 0.05)));
  }

  /** Полная стоимость комплектующих сборки, ₽. */
  function calcBuildCost(build) {
    return D().SLOT_TYPES.reduce((sum, s) => {
      const part = build[s.id];
      if (!part) return sum;
      const mult = D().RARITY[part.rarity].multiplier;
      return sum + Math.round(part.cost * mult);
    }, 0);
  }

  /** Мощность БП в сборке, Вт. */
  function calcPsuCapacity(build) {
    return build.psu ? build.psu.capacity : 0;
  }

  /** Валидация: обязательные слоты (CPU, MB, RAM, PSU), запас БП 20%, лимит сети. */
  function validateBuild(build) {
    const errors = [];
    const required = D().SLOT_TYPES.filter((s) => s.required);
    required.forEach((s) => {
      if (!build[s.id]) errors.push(`Не установлен обязательный компонент: ${s.label}`);
    });
    const power = calcBuildPower(build);
    const psuCap = calcPsuCapacity(build);
    if (build.psu && power > psuCap * 0.8) {
      errors.push(`БП на ${psuCap}Вт не вытягивает ${power}Вт (нужен запас 20%)`);
    }
    if (power > E().POWER_LIMIT_WATT) {
      errors.push(`Превышен лимит домашней сети ${E().POWER_LIMIT_WATT}Вт`);
    }
    return { valid: errors.length === 0, errors, power, hashrate: calcBuildHashrate(build), fps: calcBuildFps(build) };
  }

  /* ------------------------------------------------------------
   * 4. Экономика криптовалюты
   * ---------------------------------------------------------- */

   /** Все устройства, приносящие доход (в гараже и в стойках). */
  function activeDevices(state) {
    const devices = [];
    const byUid = new Map(state.warehouse.items.map((i) => [i.uid, i]));
    state.devices.forEach((uid) => {
      const inst = byUid.get(uid);
      if (inst) devices.push(inst.stats || inst);
    });
    state.racks.forEach((rack) => {
      rack.slots.forEach((uid) => {
        if (!uid) return;
        const inst = byUid.get(uid);
        if (inst) devices.push(inst.stats || inst);
      });
    });
    return devices;
  }

  /** Совокупный хэшрейт парка устройств игрока: { mh, th }. */
  function totalHashrate(state) {
    let mh = 0, th = 0;
    activeDevices(state).forEach((dev) => {
      mh += dev.hashrate || 0;
      th += dev.hashrateTh || 0;
    });
    return { mh, th };
  }

  /** Доход крипты (CR) за час по всему парку. */
  function coinRatePerHour(state) {
    const { mh, th } = totalHashrate(state);
    return mh * E().HASH_TO_COIN + th * E().TH_TO_COIN;
  }

  /** Сколько CR уже накоплено (копится максимум 4 часа). */
  function pendingCoins(state, now = Date.now()) {
    const rate = coinRatePerHour(state);
    if (rate <= 0) return 0;
    const elapsedH = Math.min(E().MINING_CAP_HOURS, (now - state.mining.lastAccrualTs) / 3600000);
    return Math.max(0, state.mining.accruedCoins + rate * elapsedH);
  }

  /** Доля использованного «окна» майнинга 0..1 (для прогресс-бара). */
  function miningWindowUsed(state, now = Date.now()) {
    const elapsedH = (now - state.mining.lastAccrualTs) / 3600000;
    return Math.min(1, elapsedH / E().MINING_CAP_HOURS);
  }

  /** Конвертация монет в рубли (комиссия биржи 2%). */
  function coinsToRub(coins) {
    return Math.floor(coins * E().COIN_PRICE_RUB * 0.98);
  }

  /** Обслуживание электричеством за час, ₽. */
  function electricityPerHour(state) {
    let watts = 0;
    activeDevices(state).forEach((d) => (watts += d.power || 0));
    return watts * E().ELECTRICITY_RATE;
  }

  /* ------------------------------------------------------------
   * 5. Уровни и XP
   * ---------------------------------------------------------- */
  function levelInfo(level) {
    return D().LEVELS[Math.min(level, D().LEVELS.length) - 1];
  }

  function clickPower(state) {
    return 50 + levelInfo(state.level).clickBonus * 10 + state.devices.length * 15;
  }

  function addXp(state, amount) {
    state.xp += amount;
    const gained = [];
    while (state.level < D().LEVELS.length) {
      const need = levelInfo(state.level).xpNeed; // xpNeed — сколько нужно для повышения с текущего уровня
      if (state.xp < need) break;
      state.xp -= need;
      state.level += 1;
      gained.push(state.level);
      const rw = levelInfo(state.level).reward; // награда за достигнутый уровень
      if (rw) applyRewardToState(state, rw);
    }
    return gained;
  }

  /* ------------------------------------------------------------
   * 6. Универсальное применение награды к state
   * ---------------------------------------------------------- */
  function applyRewardToState(state, reward) {
    switch (reward.type) {
      case 'currency':
        state.balance += reward.amount;
        break;
      case 'crypto':
        state.mining.accruedCoins += reward.amount;
        break;
      case 'case_key':
        state.inventory.keys[reward.caseId] = (state.inventory.keys[reward.caseId] || 0) + reward.amount;
        break;
      case 'part':
      case 'asic':
      case 'pc': {
        const found = findItemById(reward.itemId);
        if (found) addItemToWarehouse(state, found);
        break;
      }
    }
    return reward;
  }

  /** Создаёт экземпляр предмета и кладёт на склад; помечает в коллекции. */
  function addItemToWarehouse(state, found, extraStats = null) {
    const item = found.item;
    const instance = {
      uid: `${item.id}_${Date.now()}_${Math.floor(Math.random() * 1e5)}`,
      id: item.id,
      type: found.type,          // part | asic | pc
      slot: found.slot || null,  // для деталей — какой слот сборки
      name: item.name,
      rarity: item.rarity,
      tier: item.tier || null,
      img: item.img,
      stats: extraStats || (found.type !== 'part'
        ? { hashrate: item.hashrate || 0, hashrateTh: item.hashrateTh || 0, power: item.power || 0, fps: item.fps || 0 }
        : null),
      acquiredAt: Date.now(),
    };
    state.warehouse.items.push(instance);
    state.collectionSeen[item.id] = true; // попадание в коллекцию (индикатор [✓])
    return instance;
  }

  /* ------------------------------------------------------------
   * 7. Задания (квесты)
   * ---------------------------------------------------------- */
  function checkQuests(state) {
    const completed = [];
    D().QUESTS.forEach((q) => {
      if (state.quests.done[q.id]) return;
      const progress = state.quests.counters[q.metric] || 0;
      if (progress >= q.goal) {
        state.quests.done[q.id] = true;
        applyRewardToState(state, q.reward);
        completed.push(q);
      }
    });
    return completed;
  }

  /* ------------------------------------------------------------
   * 8. Взвешенный дроп кейса
   * ---------------------------------------------------------- */
  function rollCaseDrop(caseId, rng = Math.random) {
    const cfg = D().CASES[caseId];
    if (!cfg) throw new GameError('unknown_case', 'Неизвестный кейс');
    const total = cfg.pool.reduce((s, e) => s + e.weight, 0);
    let roll = rng() * total;
    for (const entry of cfg.pool) {
      roll -= entry.weight;
      if (roll <= 0) return entry;
    }
    return cfg.pool[cfg.pool.length - 1];
  }

  /** Проценты дропа для окна «Что внутри». */
  function caseDropTable(caseId) {
    const cfg = D().CASES[caseId];
    if (!cfg) throw new GameError('unknown_case', 'Неизвестный кейс');
    const total = cfg.pool.reduce((s, e) => s + e.weight, 0);
    return cfg.pool.map((e) => {
      const found = findItemById(e.itemId);
      return {
        itemId: e.itemId,
        percent: +((e.weight / total) * 100).toFixed(2),
        item: found ? found.item : { name: e.itemId, rarity: 'common', img: '' },
      };
    });
  }

  /* ------------------------------------------------------------
   * 9. Действия игрока (Rules.actions)
   *    Каждое действие — чистая функция (state, ...args).
   *    Ошибки выбрасываются как GameError.
   * ---------------------------------------------------------- */
  function bump(state, metric, n = 1) {
    state.quests.counters[metric] = (state.quests.counters[metric] || 0) + n;
    return checkQuests(state);
  }

  const actions = {
    /** Пассивный «тап» по ферме — небольшой ₽-бонус. */
    collectTap(state) {
      const gain = clickPower(state);
      state.balance += gain;
      return { gain };
    },

    /** Забрать намайненную крипту (максимум 4 часа накопления). */
    claimMining(state, now = Date.now()) {
      const coins = pendingCoins(state, now);
      if (coins <= 0) throw new GameError('nothing_mined', 'Пока нечего забирать — ферма ещё майнит ⛏️');
      state.coins += coins;
      state.mining.accruedCoins = 0;
      // Окно майнинга продолжается с текущего момента (без «съедания» остатка)
      state.mining.lastAccrualTs = now;
      const quests = bump(state, 'coinsClaimed');
      return { coins: +coins.toFixed(6), quests };
    },

    /** Продать монеты за рубли. */
    sellCoins(state) {
      if (state.coins <= 0) throw new GameError('no_coins', 'У вас нет монет для продажи');
      const rub = coinsToRub(state.coins);
      const elec = Math.min(rub, electricityPerHour(state)); // электричество гасится из выручки
      state.balance += rub - elec;
      state.coins = 0;
      const quests = bump(state, 'coinsSold');
      return { rub, electricityPaid: Math.round(elec), quests };
    },

    /** Открыть кейс (ключ приоритетнее покупки). */
    openCase(state, caseId) {
      const cfg = D().CASES[caseId];
      if (!cfg) throw new GameError('unknown_case', 'Неизвестный кейс');
      const keys = state.inventory.keys[caseId] || 0;
      let usedKey = false;
      if (keys > 0) {
        state.inventory.keys[caseId] -= 1;
        usedKey = true;
      } else {
        if (cfg.price <= 0) throw new GameError('no_free_case', 'Этот кейс открывается бесплатно по таймеру');
        if (state.balance < cfg.price) throw new GameError('not_enough_funds', `Не хватает ₽${fmtMoney(cfg.price - state.balance)}`);
        state.balance -= cfg.price;
      }
      const drop = rollCaseDrop(caseId);
      const found = findItemById(drop.itemId);
      if (!found) throw new GameError('data_error', 'Предмет из пула кейса не найден в базе');
      const instance = addItemToWarehouse(state, found);
      const quests = bump(state, 'casesOpened');
      return { item: instance, usedKey, quests };
    },

    /** Бесплатный кейс наград раз в 4 часа. */
    claimRewardCase(state, now = Date.now()) {
      if (now < state.rewardCase.nextTs) {
        const leftMs = state.rewardCase.nextTs - now;
        throw new GameError('cooldown', `Кейс наград будет доступен через ${formatDuration(leftMs)}`, { leftMs });
      }
      state.rewardCase.nextTs = now + E().REWARD_CASE_INTERVAL_MS;
      const drop = rollCaseDrop('case_reward');
      const found = findItemById(drop.itemId);
      const instance = addItemToWarehouse(state, found);
      const quests = bump(state, 'casesOpened');
      return { item: instance, quests };
    },

    /** Ежедневный бонус (streak до 7 дней). */
    claimDaily(state, now = Date.now()) {
      const DAY = 86400000;
      if (now - state.daily.lastClaimTs < DAY) {
        throw new GameError('already_claimed', 'Бонус уже получен сегодня');
      }
      const gap = state.daily.lastClaimTs ? now - state.daily.lastClaimTs : Infinity;
      state.daily.streak = gap <= 2 * DAY ? Math.min(state.daily.streak + 1, 7) : 1;
      state.daily.lastClaimTs = now;
      const day = state.daily.streak;
      const amount = Math.round(1000 * Math.pow(1.6, day - 1));
      state.balance += amount;
      if (day === 7) {
        state.inventory.keys.case_gamer = (state.inventory.keys.case_gamer || 0) + 1;
        state.daily.streak = 0; // цикл начнётся заново
      }
      return { day, amount, keyOnDay7: day === 7 };
    },

    /** Покупка дополнительного слота гаража. */
    buyDeviceSlot(state) {
      if (state.garageSlots >= E().GARAGE_MAX_SLOTS) throw new GameError('max_slots', 'Достигнут максимум слотов');
      const price = E().SLOT_PRICE_BASE + (state.garageSlots - E().GARAGE_START_SLOTS) * E().SLOT_PRICE_STEP;
      if (state.balance < price) throw new GameError('not_enough_funds', `Не хватает ₽${fmtMoney(price - state.balance)}`);
      state.balance -= price;
      state.garageSlots += 1;
      return { slots: state.garageSlots, price };
    },

    /** Покупка майнинг-стойки (3 ячейки под ASIC/ПК). */
    buyRack(state) {
      const price = E().RACK_PRICE;
      if (state.balance < price) throw new GameError('not_enough_funds', `Не хватает ₽${fmtMoney(price - state.balance)}`);
      state.balance -= price;
      const rack = { id: `rack_${Date.now()}`, name: `Стойка #${state.racks.length + 1}`, slots: new Array(E().RACK_SLOTS).fill(null) };
      state.racks.push(rack);
      const quests = bump(state, 'racksBought');
      return { rack, quests };
    },

    /** Установить устройство (ASIC/готовый ПК) в ячейку стойки. */
    placeInRack(state, uid, rackId, slotIndex) {
      const rack = state.racks.find((r) => r.id === rackId);
      if (!rack) throw new GameError('not_found', 'Стойка не найдена');
      const inst = state.warehouse.items.find((i) => i.uid === uid);
      if (!inst) throw new GameError('not_found', 'Устройство не найдено на складе');
      if (inst.type === 'part') throw new GameError('wrong_type', 'В стойку ставятся только готовые ПК и ASIC');
      if (state.deviceRack[uid]) throw new GameError('already_placed', 'Устройство уже в стойке');
      if (slotIndex < 0 || slotIndex >= rack.slots.length) throw new GameError('bad_slot', 'Некорректная ячейка');
      if (rack.slots[slotIndex]) throw new GameError('slot_busy', 'Ячейка занята');
      rack.slots[slotIndex] = uid;
      state.deviceRack[uid] = rackId;
      state.devices = state.devices.filter((u) => u !== uid);
      return { rack: rack.name };
    },

    /** Снять устройство со стойки обратно в гараж (нужен свободный слот гаража). */
    removeFromRack(state, uid) {
      const rackId = state.deviceRack[uid];
      if (!rackId) throw new GameError('not_placed', 'Устройство не в стойке');
      if (state.devices.length >= state.garageSlots) {
        throw new GameError('garage_full', 'Гараж заполнен — освободите слот или купите новый');
      }
      const rack = state.racks.find((r) => r.id === rackId);
      if (rack) rack.slots = rack.slots.map((s) => (s === uid ? null : s));
      delete state.deviceRack[uid];
      if (!state.devices.includes(uid)) state.devices.push(uid);
      return { ok: true };
    },
  };

  /* ------------------------------------------------------------
   * 10. Единая точка входа: Rules.run('claimMining', state)
   * ---------------------------------------------------------- */
  function run(actionName, state, ...args) {
    const fn = actions[actionName];
    if (!fn) throw new GameError('unknown_action', `Действие «${actionName}» не существует`);
    if (!state) throw new GameError('no_state', 'Состояние игры не загружено');
    try {
      return fn(state, ...args);
    } catch (err) {
      if (err instanceof GameError) throw err;
      throw new GameError('internal', 'Внутренняя ошибка: ' + err.message);
    }
  }

  /* ------------------------------------------------------------
   * 11. Утилиты форматирования
   * ---------------------------------------------------------- */
  function formatDuration(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}ч ${m}м`;
    if (m > 0) return `${m}м ${sec}с`;
    return `${sec}с`;
  }

  function fmtMoney(n) {
    return Math.floor(n).toLocaleString('ru-RU');
  }

  /* ------------------------------------------------------------
   * Экспорт
   * ---------------------------------------------------------- */
  global.Rules = {
    GameError,
    findPart,
    findAsic,
    findPrebuiltPc,
    findItemById,
    calcBuildPower,
    calcBuildHashrate,
    calcBuildFps,
    calcBuildCost,
    calcPsuCapacity,
    validateBuild,
    activeDevices,
    totalHashrate,
    coinRatePerHour,
    pendingCoins,
    miningWindowUsed,
    coinsToRub,
    electricityPerHour,
    levelInfo,
    clickPower,
    addXp,
    applyRewardToState,
    addItemToWarehouse,
    checkQuests,
    rollCaseDrop,
    caseDropTable,
    formatDuration,
    fmtMoney,
    actions,
    run,
  };
})(typeof window !== 'undefined' ? window : globalThis);
