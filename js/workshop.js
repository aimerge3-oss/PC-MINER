/* ============================================================
 * workshop.js — Мастерская и Склад комплектующих
 * Crypto Rigs: Master & Mining (Telegram Mini App)
 *
 * globalThis.Workshop:
 *  - Склад деталей (state.warehouse.items, type === 'part');
 *  - Сборка ПК / ASIC-майнеров ТОЛЬКО из деталей на складе
 *    (заполнение 8 слотов текущей сборки);
 *  - Система слияния: 3 одинаковые детали -> 1 деталь рангом
 *    выше, с шансами и риском сгорания;
 *  - Разбор устройства на случайные детали.
 *
 * Модуль не трогает DOM; ошибки — Rules.GameError.
 * ============================================================ */

(function (global) {
  'use strict';

  const D = () => global.Data;
  const R = () => global.Rules;

  /* ------------------------------------------------------------
   * 1. Склад: доступные детали по слотам
   * ---------------------------------------------------------- */

  /** Все детали на складе (экземпляры). */
  function partInstances(state, slotId = null) {
    return state.warehouse.items.filter(
      (i) => i.type === 'part' && !i.locked && (!slotId || i.slot === slotId)
    );
  }

  /** Группировка «id -> количество» для UI склада. */
  function partsByModel(state) {
    const map = new Map();
    partInstances(state).forEach((inst) => {
      const g = map.get(inst.id) || { item: inst, count: 0 };
      g.count += 1;
      map.set(inst.id, g);
    });
    return Array.from(map.values()).sort((a, b) => {
      const s = a.item.slot.localeCompare(b.item.slot);
      return s !== 0 ? s : (D().RARITY[a.item.rarity].order - D().RARITY[b.item.rarity].order);
    });
  }

  function findInstance(state, uid) {
    return state.warehouse.items.find((i) => i.uid === uid) || null;
  }

  /* ------------------------------------------------------------
   * 2. Текущая сборка (проект в мастерской)
   *    state.project = { slots: { cpu: uid|null, ... }, kind: 'pc'|'asic' }
   * ---------------------------------------------------------- */
  function emptyProject() {
    const slots = {};
    D().SLOT_TYPES.forEach((s) => (slots[s.id] = null));
    return { kind: 'pc', slots };
  }

  /** Деталь доступна для установки? (не занята другим проектом/сборкой) */
  function isInstanceFree(state, uid) {
    if (state.project && Object.values(state.project.slots).includes(uid)) return true; // уже в проекте
    return !state.usedPartUids.includes(uid);
  }

  /** Установить деталь из склада в слот проекта. */
  function installPart(state, slotId, uid) {
    const inst = findInstance(state, uid);
    if (!inst || inst.type !== 'part') throw new R().GameError('not_found', 'Деталь не найдена на складе');
    if (inst.slot !== slotId) throw new R().GameError('wrong_slot', `«${inst.name}» не подходит в этот слот`);
    if (!isInstanceFree(state, uid)) throw new R().GameError('busy', 'Деталь уже используется в другой сборке');

    // Если в слоте была другая деталь — она просто возвращается на склад
    state.project.slots[slotId] = uid;
    return { ok: true, part: inst };
  }

  /** Снять деталь из слота проекта. */
  function uninstallPart(state, slotId) {
    state.project.slots[slotId] = null;
    return { ok: true };
  }

  /** Объект сборки { slotId: partDef } по экземплярам проекта. */
  function projectBuildObject(state) {
    const build = {};
    D().SLOT_TYPES.forEach((s) => {
      const uid = state.project.slots[s.id];
      const inst = uid ? findInstance(state, uid) : null;
      build[s.id] = inst ? R().findPart(s.id, inst.id) : null;
    });
    return build;
  }

  /** Предпросмотр характеристик текущего проекта. */
  function previewProject(state) {
    const build = projectBuildObject(state);
    return {
      build,
      power: R().calcBuildPower(build),
      hashrate: R().calcBuildHashrate(build),
      fps: R().calcBuildFps(build),
      psuCap: R().calcPsuCapacity(build),
      validation: R().validateBuild(build),
    };
  }

  /* ------------------------------------------------------------
   * 3. Завершение сборки: списывает детали, создаёт устройство
   * ---------------------------------------------------------- */
  function finishPcBuild(state) {
    const pv = previewProject(state);
    if (!pv.validation.valid) {
      throw new R().GameError('missing_parts', pv.validation.errors[0]);
    }
    // Проверка: все используемые детали реально есть на складе
    const uids = Object.values(state.project.slots).filter(Boolean);
    for (const uid of uids) {
      if (!findInstance(state, uid)) throw new R().GameError('not_found', 'Одна из деталей пропала со склада');
    }

    // Ёмкость гаража для устройств
    const devicesCount = state.devices.length + Object.keys(state.deviceRack).length;
    if (devicesCount >= state.garageSlots) {
      throw new R().GameError('garage_full', 'Гараж заполнен — купите дополнительный слот');
    }

    // Списываем детали
    uids.forEach((uid) => {
      const idx = state.warehouse.items.findIndex((i) => i.uid === uid);
      if (idx !== -1) state.warehouse.items.splice(idx, 1);
    });

    // Итоговые характеристики (учитывая множитель редкости самой лучшей детали как «класс» сборки)
    const best = pickBestRarity(pv.build);
    const stats = {
      hashrate: +(pv.hashrate * D().RARITY[best].multiplier).toFixed(2),
      hashrateTh: 0,
      power: pv.power,
      fps: Math.round(pv.fps * D().RARITY[best].multiplier),
    };

    const found = { type: 'pc', slot: null, item: { id: 'custom_build', name: `Кастомная сборка #${++state.buildCounter}`, rarity: best, img: 'img/pc/pro-miner.png', tier: null } };
    const device = R().addItemToWarehouse(state, found, stats);
    device.custom = true;
    state.devices.push(device.uid);

    state.project = emptyProject();
    R().addXp(state, 60);
    const quests = bumpWorkshop(state, 'buildsAssembled');
    return { device, stats, quests };
  }

  /** Сборка ASIC-майнера: special-маршрут — 4 одинаковые GPU + PSU + MB -> ASIC tier+1? 
   *  Упрощённое правило: ASIC собирается из корпуса-стойки + 3 видеокарт одного tier. */
  function canBuildAsic(state) {
    const gpus = partInstances(state, 'gpu');
    const byTier = {};
    gpus.forEach((g) => ((byTier[g.tier] = (byTier[g.tier] || 0) + 1)));
    return Object.entries(byTier).find(([, c]) => c >= 3) || null;
  }

  function finishAsicBuild(state) {
    const ready = canBuildAsic(state);
    if (!ready) throw new R().GameError('missing_parts', 'Для ASIC нужно 3 видеокарты одного уровня на складе');
    const tier = Number(ready[0]);
    const gpuUids = partInstances(state, 'gpu').filter((g) => g.tier === tier).slice(0, 3).map((g) => g.uid);
    const psu = partInstances(state, 'psu').sort((a, b) => b.tier - a.tier)[0];
    if (!psu) throw new R().GameError('missing_parts', 'Нужен блок питания для самодельного ASIC');

    const devicesCount = state.devices.length + Object.keys(state.deviceRack).length;
    if (devicesCount >= state.garageSlots) throw new R().GameError('garage_full', 'Гараж заполнен — купите слот');

    [...gpuUids, psu.uid].forEach((uid) => {
      const idx = state.warehouse.items.findIndex((i) => i.uid === uid);
      if (idx !== -1) state.warehouse.items.splice(idx, 1);
    });

    const asicIndex = Math.min(tier + 1, D().ASICS.length - 1);
    const asic = D().ASICS[asicIndex];
    const found = { type: 'asic', slot: null, item: asic };
    const device = R().addItemToWarehouse(state, found);
    device.name = `${asic.name} (самодельный)`;
    state.devices.push(device.uid);

    R().addXp(state, 90);
    const quests = bumpWorkshop(state, 'asicsBuilt');
    return { device, quests };
  }

  /* ------------------------------------------------------------
   * 4. Слияние деталей: 3 одинаковых -> 1 следующего уровня
   *    Шансы: успех 75%, сгорели все 3 — 12%, выжила одна — 13%.
   * ---------------------------------------------------------- */
  function mergeChanceInfo() {
    return {
      need: D().ECONOMY.MERGE_COUNT,
      success: 0.75,
      burnAll: 0.12,
      salvageOne: 0.13,
    };
  }

  function nextTierItem(slotId, tier) {
    const list = D().PARTS[slotId] || [];
    return list.find((p) => p.tier === tier + 1) || null;
  }

  /** Можно ли сливать данную модель детали? */
  function canMerge(state, itemId) {
    const count = partInstances(state).filter((i) => i.id === itemId).length;
    const inst = partInstances(state).find((i) => i.id === itemId);
    if (!inst) return { ok: false, reason: 'none' };
    const next = nextTierItem(inst.slot, inst.tier);
    if (!next) return { ok: false, reason: 'max_tier', count };
    if (count < D().ECONOMY.MERGE_COUNT) return { ok: false, reason: 'not_enough', count };
    return { ok: true, count, next };
  }

  /** Выполнить слияние. Возвращает результат броска удачи. */
  function mergeParts(state, itemId, rng = Math.random) {
    const check = canMerge(state, itemId);
    if (!check.ok) {
      const reasons = {
        none: 'Нет такой детали на складе',
        max_tier: 'Это уже максимальный уровень — сливать дальше некуда',
        not_enough: `Нужно ${D().ECONOMY.MERGE_COUNT} одинаковые детали (есть ${check.count})`,
      };
      throw new R().GameError(check.reason, reasons[check.reason]);
    }
    const inst = partInstances(state).find((i) => i.id === itemId);
    const picked = partInstances(state).filter((i) => i.id === itemId).slice(0, D().ECONOMY.MERGE_COUNT);

    // удаляем участвующие экземпляры
    picked.forEach((p) => {
      const idx = state.warehouse.items.findIndex((i) => i.uid === p.uid);
      if (idx !== -1) state.warehouse.items.splice(idx, 1);
    });

    const roll = rng();
    const info = mergeChanceInfo();
    let result;
    if (roll < info.success) {
      const found = { type: 'part', slot: inst.slot, item: check.next };
      const made = R().addItemToWarehouse(state, found);
      result = { outcome: 'success', item: made };
    } else if (roll < info.success + info.salvageOne) {
      const found = { type: 'part', slot: inst.slot, item: R().findPart(inst.slot, itemId) };
      const saved = R().addItemToWarehouse(state, found);
      result = { outcome: 'salvage', item: saved };
    } else {
      result = { outcome: 'burn' };
    }
    R().addXp(state, 20);
    const quests = bumpWorkshop(state, 'mergesDone');
    return { ...result, quests };
  }

  /* ------------------------------------------------------------
   * 5. Разбор устройства на детали (возврат материалов)
   * ---------------------------------------------------------- */
  function scrapDevice(state, uid, rng = Math.random) {
    const inst = findInstance(state, uid);
    if (!inst) throw new R().GameError('not_found', 'Устройство не найдено');
    if (inst.type === 'part') throw new R().GameError('wrong_type', 'Детали не разбираются — их можно слить');
    if (state.deviceRack[uid]) throw new R().GameError('in_rack', 'Сначала снимите устройство со стойки');

    const idx = state.warehouse.items.findIndex((i) => i.uid === uid);
    state.warehouse.items.splice(idx, 1);
    state.devices = state.devices.filter((u) => u !== uid);

    // Выдаём 2–4 случайные деталиcommon/uncommon
    const n = 2 + Math.floor(rng() * 3);
    const given = [];
    const slots = D().SLOT_TYPES.map((s) => s.id);
    for (let k = 0; k < n; k++) {
      const slot = slots[Math.floor(rng() * slots.length)];
      const pool = D().PARTS[slot].filter((p) => p.rarity === 'common' || p.rarity === 'uncommon');
      const pick = pool[Math.floor(rng() * pool.length)];
      given.push(R().addItemToWarehouse(state, { type: 'part', slot, item: pick }));
    }
    const quests = bumpWorkshop(state, 'devicesScrapped');
    return { parts: given, quests };
  }

  /* ------------------------------------------------------------
   * 6. Служебное: счётчики квестов Workshop
   * ---------------------------------------------------------- */
  function bumpWorkshop(state, metric) {
    state.quests.counters[metric] = (state.quests.counters[metric] || 0) + 1;
    return R().checkQuests(state);
  }

  /** Помечает детали занятыми в активных сборках (вызывается при загрузке save). */
  function recomputeUsedUids(state) {
    const used = [];
    // детали, встроенные в кастомные устройства, не хранятся отдельно —
    // занятость учитывается только через проект
    if (state.project) used.push(...Object.values(state.project.slots).filter(Boolean));
    state.usedPartUids = used;
    return used;
  }

  /* ------------------------------------------------------------
   * Экспорт
   * ---------------------------------------------------------- */
  global.Workshop = {
    emptyProject,
    partInstances,
    partsByModel,
    findInstance,
    isInstanceFree,
    installPart,
    uninstallPart,
    projectBuildObject,
    previewProject,
    finishPcBuild,
    canBuildAsic,
    finishAsicBuild,
    mergeChanceInfo,
    canMerge,
    mergeParts,
    scrapDevice,
    recomputeUsedUids,
  };

  /** Выбор «лучшей» редкости среди установленных деталей. */
  function pickBestRarity(build) {
    let best = 'common';
    D().SLOT_TYPES.forEach((s) => {
      const part = build[s.id];
      if (part && D().RARITY[part.rarity].order > D().RARITY[best].order) best = part.rarity;
    });
    return best;
  }
})(typeof window !== 'undefined' ? window : globalThis);
