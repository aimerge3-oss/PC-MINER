/* ============================================================
 * rewards.js — Система наград
 * Crypto Rigs: Master & Mining (Telegram Mini App)
 *
 * globalThis.Rewards:
 *  - Ежедневный бонус (streak 7 дней);
 *  - Кейс наград каждые 4 часа;
 *  - Коллекция оборудования (все модели + статус [✓]);
 *  - Покупка дополнительных слотов гаража и майнинг-стоек;
 *  - Проверка и выдача наград заданий (квестов).
 *
 * Модуль не трогает DOM. Ошибки — Rules.GameError.
 * ============================================================ */

(function (global) {
  'use strict';

  const D = () => global.Data;
  const R = () => global.Rules;

  const DAY_MS = 24 * 60 * 60 * 1000;

  /* ------------------------------------------------------------
   * 1. Ежедневный бонус (streak 7 дней)
   * ---------------------------------------------------------- */
  function dailyBonusForDay(day) {
    return {
      day,
      amount: Math.round(1000 * Math.pow(1.6, day - 1)),
      isFinal: day === 7, // на 7-й день — ключ от Геймерского кейса
    };
  }

  function dailyBonusTable() {
    return Array.from({ length: 7 }, (_, i) => dailyBonusForDay(i + 1));
  }

  /** Можно ли забрать ежедневный бонус сейчас? */
  function canClaimDaily(state, now = Date.now()) {
    return now - state.daily.lastClaimTs >= DAY_MS;
  }

  /** Сколько осталось до следующего бонуса, мс. */
  function dailyCooldownLeft(state, now = Date.now()) {
    return Math.max(0, DAY_MS - (now - state.daily.lastClaimTs));
  }

  /** Забрать ежедневный бонус (делегация в Rules.actions.claimDaily). */
  function claimDaily(state, now = Date.now()) {
    return R().run('claimDaily', state, now);
  }

  /* ------------------------------------------------------------
   * 2. Кейс наград каждые 4 часа
   * ---------------------------------------------------------- */
  function rewardCaseState(state, now = Date.now()) {
    const leftMs = Math.max(0, state.rewardCase.nextTs - now);
    return {
      ready: leftMs <= 0,
      leftMs,
      label: R().formatDuration(leftMs),
      intervalMs: D().ECONOMY.REWARD_CASE_INTERVAL_MS,
    };
  }

  /** Открыть бесплатный кейс наград. */
  function claimRewardCase(state, now = Date.now()) {
    return R().run('claimRewardCase', state, now);
  }

  /* ------------------------------------------------------------
   * 3. Коллекция оборудования
   *    Все возможные модели предметов; [✓] если хоть раз выпал/собран.
   * ---------------------------------------------------------- */
  function allCollectionModels() {
    const models = [];
    D().SLOT_TYPES.forEach((s) => {
      D().PARTS[s.id].forEach((p) => models.push({ slot: s.id, slotLabel: s.label, item: p, kind: 'part' }));
    });
    D().ASICS.forEach((a) => models.push({ slot: null, slotLabel: 'ASIC', item: a, kind: 'asic' }));
    D().PREBUILT_PCS.forEach((p) => models.push({ slot: null, slotLabel: 'Готовые ПК', item: p, kind: 'pc' }));
    return models;
  }

  /** Статус коллекции: [{item, kind, owned:boolean, count}]. */
  function collectionStatus(state) {
    return allCollectionModels().map((m) => ({
      ...m,
      owned: !!state.collectionSeen[m.item.id],
      count: state.warehouse.items.filter((i) => i.id === m.item.id).length,
    }));
  }

  function collectionProgress(state) {
    const status = collectionStatus(state);
    const owned = status.filter((s) => s.owned).length;
    return { owned, total: status.length, percent: Math.round((owned / status.length) * 100) };
  }

  /* ------------------------------------------------------------
   * 4. Слоты и стойки (цена/покупка — через Rules.run)
   * ---------------------------------------------------------- */
  function nextSlotPrice(state) {
    const E = D().ECONOMY;
    if (state.garageSlots >= E.GARAGE_MAX_SLOTS) return null;
    return E.SLOT_PRICE_BASE + (state.garageSlots - E.GARAGE_START_SLOTS) * E.SLOT_PRICE_STEP;
  }

  function buyDeviceSlot(state) {
    return R().run('buyDeviceSlot', state);
  }

  function buyRack(state) {
    return R().run('buyRack', state);
  }

  /* ------------------------------------------------------------
   * 5. Задания (квесты): прогресс и награды
   * ---------------------------------------------------------- */
  function questsProgress(state) {
    return D().QUESTS.map((q) => ({
      quest: q,
      done: !!state.quests.done[q.id],
      progress: Math.min(q.goal, state.quests.counters[q.metric] || 0),
    }));
  }

  /* ------------------------------------------------------------
   * 6. Стартовый набор (первый запуск)
   * ---------------------------------------------------------- */
  /** Выдаётся один раз: Стартовый ПК + 50 000 ₽ (см. ECONOMY). */
  function grantStarterKit(state) {
    const E = D().ECONOMY;
    state.balance = E.START_BALANCE_RUB;
    state.coins = E.START_COINS;

    // Стартовый ПК как готовое устройство
    const starter = D().PREBUILT_PCS[0];
    const device = R().addItemToWarehouse(state, { type: 'pc', slot: null, item: starter });
    state.devices.push(device.uid);

    // Немного деталей для первой сборки/слияния
    ['ram_16_d4', 'ssd_256', 'cool_tower'].forEach((id) => {
      const found = R().findItemById(id);
      if (found) R().addItemToWarehouse(state, found);
    });

    state.starterKitGiven = true;
    return { balance: E.START_BALANCE_RUB, device };
  }

  /* ------------------------------------------------------------
   * Экспорт
   * ---------------------------------------------------------- */
  global.Rewards = {
    DAY_MS,
    dailyBonusForDay,
    dailyBonusTable,
    canClaimDaily,
    dailyCooldownLeft,
    claimDaily,
    rewardCaseState,
    claimRewardCase,
    allCollectionModels,
    collectionStatus,
    collectionProgress,
    nextSlotPrice,
    buyDeviceSlot,
    buyRack,
    questsProgress,
    grantStarterKit,
  };
})(typeof window !== 'undefined' ? window : globalThis);
