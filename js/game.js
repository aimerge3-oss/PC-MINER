/* ============================================================
 * game.js — Инициализация и координация игры
 * PC-Miner Telegram Mini App
 *
 * Связывает: index.html (DOM) + rules.js (Rules) + rewards.js (Rewards).
 * Здесь: Telegram SDK init, состояние, навигация, кликер, сборка,
 * кейсы, гараж/стойки, ежедневный бонус, игровой цикл, сохранение.
 * ============================================================ */

(function (global) {
  'use strict';

  /* ------------------------------------------------------------
   * 0. Ссылки на модули и Telegram
   * ---------------------------------------------------------- */
  const Rules = global.Rules;
  const Rewards = global.Rewards;

  const tg = global.Telegram && global.Telegram.WebApp ? global.Telegram.WebApp : null;
  const isTMA = !!tg && typeof tg.ready === 'function';

  const SAVE_KEY = 'pcminer_save_v1';

  /* ------------------------------------------------------------
   * 1. DOM-хелперы
   * ---------------------------------------------------------- */
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  function fmtMoney(n) {
    return Math.floor(n).toLocaleString('ru-RU');
  }

  /* ------------------------------------------------------------
   * 2. Состояние игры
   * ---------------------------------------------------------- */
  let state = null;

  /** Пустая текущая сборка по всем слотам. */
  function emptyBuild() {
    return Rules.SLOT_TYPES.reduce((b, slot) => ((b[slot] = null), b), {});
  }

  function defaultState() {
    return Object.assign(Rewards.defaultRewardsState(), {
      build: emptyBuild(),
      lastVisitTs: Date.now(),
    });
  }

  function saveState() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    } catch (e) { /* storage может быть недоступен в TMA */ }
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      return Object.assign(defaultState(), parsed, {
        daily: Object.assign({ streak: 0, lastClaimTs: 0 }, parsed.daily),
        garage: Object.assign({ slots: Rules.CONSTANTS.START_GARAGE_SLOTS }, parsed.garage),
      });
    } catch (e) {
      return defaultState();
    }
  }

  /* ------------------------------------------------------------
   * 3. Telegram WebApp initialization
   * ---------------------------------------------------------- */
  function initTelegram() {
    if (!isTMA) {
      console.info('[game] Работа вне Telegram — демо-режим в браузере.');
      return;
    }
    tg.ready();
    tg.expand();
    try { tg.setHeaderColor('#16161d'); tg.setBackgroundColor('#0f0f14'); } catch (e) {}

    // Тема может смениться динамически — CSS-переменные обновятся сами,
    // но можно перерисовать зависимости от цвета:
    tg.onEvent('themeChanged', () => renderAll());

    // Haptic feedback helper
    if ('HapticFeedback' in tg) {
      // используется в haptic()
    }

    const user = tg.initDataUnsafe && tg.initDataUnsafe.user;
    if (user) {
      $('#user-name').textContent = user.first_name || 'Игрок';
    }
  }

  function haptic(style = 'light') {
    if (isTMA && tg.HapticFeedback) {
      if (style === 'success' || style === 'error' || style === 'warning') {
        tg.HapticFeedback.notificationOccurred(style);
      } else {
        tg.HapticFeedback.impactOccurred(style);
      }
    }
  }

  /* ------------------------------------------------------------
   * 4. Toast-уведомления
   * ---------------------------------------------------------- */
  function toast(text, ms = 1600) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = text;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), ms);
  }

  /* ------------------------------------------------------------
   * 5. Навигация между экранами
   * ---------------------------------------------------------- */
  function switchScreen(name) {
    $$('.screen').forEach((s) => s.classList.toggle('screen--active', s.dataset.screen === name));
    $$('.nav-item').forEach((n) => n.classList.toggle('nav-item--active', n.dataset.target === name));
    haptic('light');
  }

  function bindNavigation() {
    $$('.nav-item').forEach((btn) => {
      btn.addEventListener('click', () => switchScreen(btn.dataset.target));
    });
    $$('.garage-tabs .tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        $$('.garage-tabs .tab').forEach((t) => t.classList.remove('tab--active'));
        tab.classList.add('tab--active');
        currentGarageTab = tab.dataset.tab;
        renderCollection();
      });
    });
  }

  /* ------------------------------------------------------------
   * 6. Кликер
   * ---------------------------------------------------------- */
  function onMainClick(evt) {
    const power = Rules.clickPowerByLevel(state.level);
    state.balance += power;

    // всплывающее "+N"
    const zone = $('#clicker-zone');
    const plus = document.createElement('span');
    plus.className = 'float-plus';
    plus.textContent = `+${power}`;
    const rect = zone.getBoundingClientRect();
    plus.style.left = `${(evt.clientX || rect.left + rect.width / 2) - rect.left}px`;
    plus.style.top = `${(evt.clientY || rect.top) - rect.top}px`;
    zone.style.position = 'relative';
    zone.appendChild(plus);
    setTimeout(() => plus.remove(), 800);

    haptic('light');
    renderHeader();
  }

  /* ------------------------------------------------------------
   * 7. Сборка ПК (упрощённый выбор компонентов из Rules.PARTS)
   *    Клик по слоту циклически меняет доступный компонент.
   * ---------------------------------------------------------- */
  function bindBuildSlots() {
    $$('.part-slot').forEach((li) => {
      li.addEventListener('click', () => {
        const slot = li.dataset.slot;
        const list = Rules.PARTS[slot] || [];
        if (!list.length) return;
        const cur = state.build[slot];
        const idx = cur ? list.findIndex((p) => p.id === cur.id) : -1;
        state.build[slot] = list[(idx + 1) % list.length];
        haptic('light');
        renderBuild();
        saveState();
      });
    });

    $('#btn-assemble').addEventListener('click', () => {
      const result = Rules.validateBuild(state.build);
      if (!result.valid) {
        toast(result.errors[0]);
        haptic('error');
        return;
      }
      if (state.balance < result.cost) {
        toast(`Не хватает ₽${fmtMoney(result.cost - state.balance)} на комплектующие`);
        haptic('error');
        return;
      }
      if (Rewards.garageIsFull(state)) {
        toast('Гараж заполнен — купите слот');
        haptic('warning');
        return;
      }
      state.balance -= result.cost;
      state.xp += Rules.CONSTANTS.XP_PER_ASSEMBLY;
      checkLevelUp();
      Rewards.addAssembledPc(state, result, `Сборка #${state.collection.length + 1}`);
      state.build = emptyBuild();
      haptic('success');
      toast('ПК собран и помещён в гараж! 🎉');
      renderAll();
      saveState();
    });
  }

  function checkLevelUp() {
    const need = state.level * 100;
    while (state.xp >= need && state.level < Rules.CONSTANTS.MAX_LEVEL) {
      state.xp -= need;
      state.level += 1;
      toast(`Новый уровень: ${state.level} ⬆️`);
    }
  }

  /* ------------------------------------------------------------
   * 8. Кейсы
   * ---------------------------------------------------------- */
  function renderCases() {
    const grid = $('#cases-grid');
    grid.innerHTML = '';
    Object.values(Rewards.CASES).forEach((c) => {
      const keys = state.inventory.keys[c.id] || 0;
      const card = document.createElement('div');
      card.className = 'case-card';
      card.innerHTML = `
        <div class="case-card-img">${c.icon}</div>
        <div class="case-card-name">${c.name}</div>
        <div class="case-card-price">₽${fmtMoney(c.price)} ${keys ? `· 🔑×${keys}` : ''}</div>
        <button class="btn btn--small" data-case="${c.id}">Открыть</button>`;
      grid.appendChild(card);
    });
    grid.onclick = (e) => {
      const btn = e.target.closest('[data-case]');
      if (!btn) return;
      openCaseFlow(btn.dataset.case);
    };
  }

  function openCaseFlow(caseId) {
    const res = Rewards.openCase(state, caseId);
    if (!res.ok) {
      toast(res.reason === 'not_enough_funds' ? 'Недостаточно средств или ключей' : 'Ошибка кейса');
      haptic('error');
      return;
    }
    haptic(res.item && res.item.rarity === 'legendary' ? 'success' : 'medium');
    showCaseResult(res.item);
    renderAll();
    saveState();
  }

  function showCaseResult(item) {
    const wrap = $('#case-result');
    const card = $('#case-result-card');
    if (!item) { wrap.classList.add('hidden'); return; }
    card.dataset.rarity = item.rarity || 'common';
    $('#case-result-name').textContent = item.name;
    $('#case-result-rarity').textContent = (Rules.RARITY[item.rarity] || {}).label || '';
    const img = $('#case-result-img');
    img.src = item.img;
    img.onerror = () => { img.alt = '🖼'; };
    wrap.classList.remove('hidden');
  }

  /* ------------------------------------------------------------
   * 9. Гараж / Коллекция / Стойки
   * ---------------------------------------------------------- */
  let currentGarageTab = 'pcs';

  function collectionForTab() {
    switch (currentGarageTab) {
      case 'pcs': return state.collection.filter((i) => i.type === 'pc');
      case 'asics': return state.collection.filter((i) => i.type === 'asic');
      default: return state.collection.filter((i) => i.type === 'part');
    }
  }

  function renderCollection() {
    const grid = $('#collection-grid');
    grid.innerHTML = '';
    const items = collectionForTab();
    items.forEach((item) => {
      const cell = document.createElement('div');
      cell.className = 'collection-cell';
      cell.innerHTML = `<img src="${item.img}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'📦'}))">
        <span class="item-name">${item.name}</span><span>${item.placedIn ? '⚡ в стойке' : 'в гараже'}</span>`;
      grid.appendChild(cell);
    });
    // пустые ячейки до ёмкости гаража
    const free = Math.max(0, state.garage.slots - items.filter((i) => !i.placedIn).length);
    for (let i = 0; i < Math.min(free, 8); i++) {
      const empty = document.createElement('div');
      empty.className = 'collection-cell collection-cell--empty';
      grid.appendChild(empty);
    }
    $('#garage-used').textContent = state.collection.filter((i) => !i.placedIn).length;
    $('#garage-total').textContent = state.garage.slots;
  }

  function renderRacks() {
    const list = $('#racks-list');
    list.innerHTML = '';
    if (!state.racks.length) {
      list.innerHTML = `<div class="rack-row"><span>Стойки не построены</span>
        <button class="btn btn--small" id="btn-buy-rack">Купить за ₽${fmtMoney(Rules.CONSTANTS.RACK_PRICE)}</button></div>`;
      const b = $('#btn-buy-rack');
      if (b) b.addEventListener('click', buyRackFlow);
      return;
    }
    state.racks.forEach((rack) => {
      const filled = rack.slots.filter(Boolean).length;
      const row = document.createElement('div');
      row.className = 'rack-row';
      row.innerHTML = `<span>${rack.name}</span><span>${filled}/${rack.slots.length} устройств</span>`;
      list.appendChild(row);
    });
    const addBtn = document.createElement('button');
    addBtn.className = 'btn btn--small';
    addBtn.textContent = `+ Новая стойка (₽${fmtMoney(Rules.CONSTANTS.RACK_PRICE)})`;
    addBtn.addEventListener('click', buyRackFlow);
    list.appendChild(addBtn);
  }

  function buyRackFlow() {
    const res = Rewards.buyRack(state);
    if (!res.ok) { toast('Недостаточно средств'); haptic('error'); return; }
    haptic('success');
    toast('Майнинг-стойка построена ⚡');
    renderAll();
    saveState();
  }

  /* ------------------------------------------------------------
   * 10. Ежедневный бонус
   * ---------------------------------------------------------- */
  function renderDailyBonus() {
    $('#login-streak').textContent = state.daily.streak;
    const days = $('#bonus-days');
    days.innerHTML = '';
    Rewards.DAILY_BONUS_TABLE.forEach((entry) => {
      const div = document.createElement('div');
      div.className = 'bonus-day';
      if (entry.day <= state.daily.streak) div.classList.add('bonus-day--claimed');
      if (entry.day === (state.daily.streak % 7) + 1) div.classList.add('bonus-day--today');
      const icon = entry.reward.type === 'case_key' ? '🔑' : '💰';
      div.innerHTML = `<span>День ${entry.day}</span><span class="day-reward">${icon}</span>`;
      days.appendChild(div);
    });
    const btn = $('#btn-daily-bonus');
    btn.disabled = !Rewards.canClaimDaily(state);
  }

  function bindDailyBonus() {
    $('#btn-daily-bonus').addEventListener('click', () => {
      const res = Rewards.claimDailyBonus(state);
      if (!res.ok) { toast('Бонус уже получен сегодня'); return; }
      haptic('success');
      toast(`Бонус день ${res.day}: забрано! Серия ${res.streak} 🔥`);
      renderAll();
      saveState();
    });
  }

  /* ------------------------------------------------------------
   * 11. Рендер шапки и сборки
   * ---------------------------------------------------------- */
  function renderHeader() {
    $('#balance-value').textContent = fmtMoney(state.balance);
    $('#crypto-value').textContent = state.crypto.toFixed(6);
    $('#user-level').textContent = `Уровень ${state.level}`;
    $('#click-power').textContent = Rules.clickPowerByLevel(state.level);
  }

  function renderBuild() {
    Rules.SLOT_TYPES.forEach((slot) => {
      const el = $(`#slot-${slot}`);
      const li = el.closest('.part-slot');
      const part = state.build[slot];
      el.textContent = part ? part.name : '—';
      li.classList.toggle('part-slot--filled', !!part);
    });
    $('#summary-power').textContent = `${Rules.calcBuildPower(state.build)} Вт`;
    $('#summary-hashrate').textContent = `${Rules.calcBuildHashrate(state.build).toFixed(1)} MH/s`;
    $('#summary-cost').textContent = `₽${fmtMoney(Rules.calcBuildCost(state.build))}`;
  }

  function renderAll() {
    renderHeader();
    renderBuild();
    renderCases();
    renderCollection();
    renderRacks();
    renderDailyBonus();
  }

  /* ------------------------------------------------------------
   * 12. Игровой цикл (тик каждую секунду)
   * ---------------------------------------------------------- */
  function startGameLoop() {
    setInterval(() => {
      const income = Rewards.tickIncome(state);
      if (income > 0) {
        state.balance += income;
        state.crypto += income / 10000; // демо-конвертация в крипто
        renderHeader();
      }
    }, Rules.CONSTANTS.TICK_INTERVAL_MS);

    // Автосохранение каждые 15 секунд
    setInterval(saveState, 15000);
  }

  /* ------------------------------------------------------------
   * 13. Инициализация приложения
   * ---------------------------------------------------------- */
  function init() {
    state = loadState();

    initTelegram();
    bindNavigation();
    bindBuildSlots();

    $('#clicker-btn').addEventListener('click', onMainClick);
    $('#btn-close-case-result').addEventListener('click', () => $('#case-result').classList.add('hidden'));
    $('#btn-buy-slot').addEventListener('click', () => {
      const res = Rewards.buyGarageSlot(state);
      if (!res.ok) {
        toast(res.reason === 'max_slots' ? 'Максимум слотов' : 'Недостаточно средств');
        haptic('error');
        return;
      }
      haptic('success');
      toast(`Куплен слот гаража (${res.slots})`);
      renderAll();
      saveState();
    });

    bindDailyBonus();

    renderAll();
    startGameLoop();

    if (isTMA) tg.show();
    console.info('[game] PC-Miner skeleton initialized:', { Rules: !!Rules, Rewards: !!Rewards });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* Экспорт для отладки в консоли */
  global.Game = {
    get state() { return state; },
    reset: () => { localStorage.removeItem(SAVE_KEY); location.reload(); },
    switchScreen,
    toast,
  };
})(typeof window !== 'undefined' ? window : globalThis);
