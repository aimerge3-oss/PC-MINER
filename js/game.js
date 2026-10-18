/* ============================================================
 * game.js — Главный координатор Crypto Rigs: Master & Mining
 * Telegram Mini App (чистый JS, без сборщиков)
 *
 * Ответственности:
 *  - инициализация Telegram WebApp (theme, HapticFeedback, BackButton);
 *  - состояние игры + сохранение в localStorage;
 *  - переключение вкладок и обработка всех кликов;
 *  - интерфейс кейсов: рулетка, множители ×1/×3/×5/×10, «Что внутри»;
 *  - модалки (bottom sheet), тосты, подтверждения data-confirm.
 *
 * Вся бизнес-логика — в Rules / Workshop / Rewards / Fps.
 * ============================================================ */

(function (global) {
  'use strict';

  const tg = global.Telegram && global.Telegram.WebApp ? global.Telegram.WebApp : null;

  /* ------------------------------------------------------------
   * 1. Состояние
   * ---------------------------------------------------------- */
  let state = null;
  let saveTimer = null;
  let tickTimer = null;
  let currentMult = 1;
  let rouletteBusy = false;

  function defaultState() {
    const E = Data.ECONOMY;
    return {
      version: 2,
      createdAt: Date.now(),
      balance: 0,
      coins: 0,
      level: 1,
      xp: 0,
      buildCounter: 0,
      starterKitGiven: false,
      garageSlots: E.GARAGE_START_SLOTS,
      devices: [],            // uid устройств вне стоек (подключены к сети)
      racks: [],              // { id, name, slots:[uid|null] }
      deviceRack: {},         // uid -> rackId
      warehouse: { items: [] },// экземпляры: детали(part) + устройства(pc/asic)
      usedPartUids: [],
      project: null,          // создаётся Workshop.emptyProject()
      collectionSeen: {},     // itemId -> true (для [✓])
      inventory: { keys: {} },
      daily: { lastClaimTs: 0, streak: 0 },
      rewardCase: { nextTs: 0 },
      energy: { points: Data.ECONOMY.DUEL_ENERGY_MAX, updatedAt: Date.now() },
      mining: { accruedCoins: 0, lastAccrualTs: Date.now() },
      quests: { counters: {}, done: {} },
      duelsPlayed: 0,
      duelsWon: 0,
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(Data.ECONOMY.SAVE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== 2) return null;
      return Object.assign(defaultState(), parsed);
    } catch (e) {
      console.warn('Save corrupted, starting fresh', e);
      return null;
    }
  }

  function saveState() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(Data.ECONOMY.SAVE_KEY, JSON.stringify(state));
      } catch (e) { /* quota */ }
    }, 400);
  }

  /* ------------------------------------------------------------
   * 2. Утилиты DOM / Telegram
   * ---------------------------------------------------------- */
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  function haptic(type) {
    if (tg && tg.HapticFeedback) {
      if (type === 'error') tg.HapticFeedback.notificationOccurred('error');
      else if (type === 'success') tg.HapticFeedback.notificationOccurred('success');
      else if (type === 'impact') tg.HapticFeedback.impactOccurred('medium');
      else tg.HapticFeedback.selectionChanged();
    }
  }

  function toast(msg, kind = '') {
    const stack = $('#toast-stack');
    const el = document.createElement('div');
    el.className = 'toast' + (kind ? ` toast--${kind}` : '');
    el.textContent = msg;
    stack.appendChild(el);
    setTimeout(() => el.remove(), 2600);
  }

  /** Единый обработчик ошибок GameError -> тост + вибрация. */
  function handleError(err) {
    if (err && err.name === 'GameError') {
      toast(err.message, 'error');
      haptic('error');
    } else {
      console.error(err);
      toast('Непредвиденная ошибка', 'error');
      haptic('error');
    }
  }

  /** Вызов действия с обработкой ошибок и автосохранением. */
  function act(fn) {
    try {
      const res = fn();
      handleQuestsToast(res && res.quests);
      afterChange();
      return res;
    } catch (err) {
      handleError(err);
      return null;
    }
  }

  function handleQuestsToast(quests) {
    if (quests && quests.length) {
      quests.forEach((q) => toast(`🎯 Задание выполнено: ${q.title}!`, 'success'));
      haptic('success');
    }
  }

  function afterChange() {
    saveState();
    renderAll();
  }

  /* ------------------------------------------------------------
   * 3. Модальная bottom sheet
   * ---------------------------------------------------------- */
  function openSheet(title, html) {
    $('#sheet-title').textContent = title;
    $('#sheet-body').innerHTML = html;
    $('#modal-overlay').classList.remove('hidden');
  }

  function closeSheet() {
    $('#modal-overlay').classList.add('hidden');
  }

  /* ------------------------------------------------------------
   * 4. Рендер: шапка и Ферма
   * ---------------------------------------------------------- */
  function renderHeader() {
    const now = Date.now();
    $('#balance-value').textContent = Rules.fmtMoney(state.balance);
    $('#coins-value').textContent = state.coins.toFixed(6);
    $('#energy-value').textContent = Fps.currentEnergy(state, now);
    const lvl = Rules.levelInfo(state.level);
    $('#user-level').textContent = `Уровень ${state.level} · ${Math.floor(state.xp)} / ${lvl.xpNeed} XP`;
    if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
      $('#user-name').textContent = tg.initDataUnsafe.user.first_name || 'Игрок';
    }
  }

  function emojiForItem(inst) {
    if (inst.type === 'asic') return '🗄️';
    if (inst.type === 'pc') return '🖥️';
    const slot = Data.SLOT_TYPES.find((s) => s.id === inst.slot);
    return slot ? slot.icon : '🔩';
  }

  function itemThumb(inst, cls) {
    // img из Data может отсутствовать — fallback на эмодзи
    return `<span class="card-emoji">${emojiForItem(inst)}</span>`;
  }

  function rarityTag(rarity) {
    return `<span class="rarity-tag rarity-tag--${rarity}">${Data.RARITY[rarity].label}</span>`;
  }

  function renderFarm() {
    const now = Date.now();
    const hr = Rules.totalHashrate(state);
    const rate = Rules.coinRatePerHour(state);
    const pending = Rules.pendingCoins(state, now);

    $('#farm-hashrate').textContent = `${hr.mh.toFixed(1)} MH/s`;
    $('#farm-th').textContent = `${hr.th.toFixed(0)} TH/s`;
    $('#farm-rate').textContent = `${rate.toFixed(6)} CR/ч`;
    $('#pending-coins').textContent = `${pending.toFixed(6)} CR`;
    $('#tap-power').textContent = `+${Rules.fmtMoney(Rules.clickPower(state))} ₽`;

    const used = Rules.miningWindowUsed(state, now);
    $('#mining-bar').style.width = `${(used * 100).toFixed(1)}%`;
    const elapsedH = Math.min(4, (now - state.mining.lastAccrualTs) / 3600000);
    $('#mining-window-hint').textContent = `Окно майнинга: ${elapsedH.toFixed(1)} / 4 ч`;

    // Устройства в гараже (не в стойках)
    const placed = new Set(Object.keys(state.deviceRack));
    const devices = state.warehouse.items.filter((i) => i.type !== 'part' && !placed.has(i.uid));
    $('#devices-capacity').textContent = `${devices.length} / ${state.garageSlots}`;
    $('#devices-grid').innerHTML = devices.length
      ? devices.map(deviceCardHtml).join('')
      : '<p class="racks-empty">Нет устройств — соберите ПК в Мастерской или откройте кейс.</p>';

    // Свободные устройства на складе (для переноса в стойку) + свободные слоты гаража
    const spare = state.warehouse.items.filter((i) => i.type !== 'part' && !state.devices.includes(i.uid) && !placed.has(i.uid));
    if (spare.length) {
      $('#devices-grid').innerHTML += `<p class="racks-empty">На складе без питания: ${spare.map((s) => s.name).join(', ')}</p>`;
    }

    // Стойки
    $('#racks-list').innerHTML = state.racks.length
      ? state.racks.map(rackHtml).join('')
      : '<p class="racks-empty">Стойки не куплены. Стойка = 3 ячейки под ASIC/ПК.</p>';
  }

  function deviceCardHtml(inst) {
    const s = inst.stats || {};
    return `
      <div class="device-card" data-rarity="${inst.rarity}" data-device-uid="${inst.uid}">
        ${itemThumb(inst)}
        <span class="item-name">${inst.name}</span>
        ${rarityTag(inst.rarity)}
        <span class="item-stat">${s.hashrateTh ? s.hashrateTh + ' TH/s' : (s.hashrate || 0) + ' MH/s'} · ${(s.power || 0)} Вт</span>
        <button class="btn btn--small" data-scrap="${inst.uid}">Разобрать</button>
      </div>`;
  }

  function rackHtml(rack) {
    const byUid = new Map(state.warehouse.items.map((i) => [i.uid, i]));
    const cells = rack.slots.map((uid, idx) => {
      if (uid && byUid.has(uid)) {
        const inst = byUid.get(uid);
        return `<div class="rack-slot rack-slot--filled" data-unrack="${uid}" title="Нажмите, чтобы снять">
                  <span>${emojiForItem(inst)}</span><span>${inst.name}</span>
                </div>`;
      }
      return `<div class="rack-slot" data-empty-rack="${rack.id}" data-slot-index="${idx}">＋ пусто</div>`;
    }).join('');
    return `<div class="rack-row"><div class="rack-name">${rack.name}</div><div class="rack-slots">${cells}</div></div>`;
  }

  /* ------------------------------------------------------------
   * 5. Рендер: Кейсы
   * ---------------------------------------------------------- */
  function renderCases() {
    const rc = Rewards.rewardCaseState(state);
    const banner = $('#reward-case-banner');
    banner.classList.toggle('is-ready', rc.ready);
    $('#reward-case-timer').textContent = rc.ready ? 'готов к открытию!' : `следующий через ${rc.label}`;
    $('#btn-reward-case').disabled = !rc.ready;

    const sellable = Object.entries(Data.CASES).filter(([id]) => id !== 'case_reward');
    $('#cases-grid').innerHTML = sellable.map(([id, c]) => {
      const keys = state.inventory.keys[id] || 0;
      return `
        <div class="case-card" style="border-color:${c.color}55">
          ${keys > 0 ? `<span class="case-keys">🔑 ${keys}</span>` : ''}
          <div class="case-card-img">${c.icon}</div>
          <div class="case-card-name">${c.name}</div>
          <div class="case-card-price">${Rules.fmtMoney(c.price)} ₽</div>
          <div class="case-card-actions">
            <button class="btn btn--small" data-case-info="${id}">Что внутри</button>
            <button class="btn btn--small btn--primary" data-case-open="${id}">${keys > 0 ? 'Ключ 🔑' : 'Открыть'}</button>
          </div>
        </div>`;
    }).join('');
  }

  /** Модалка «Что внутри»: шансы дропа + [✓] из коллекции. */
  function showCaseContents(caseId) {
    const cfg = Data.CASES[caseId];
    const rows = Rules.caseDropTable(caseId).map((row) => {
      const owned = !!state.collectionSeen[row.itemId];
      const label = row.item.hashrateTh ? `${row.item.hashrateTh} TH/s` : `${row.item.hashrate || 0} MH/s`;
      return `
        <div class="drop-row" data-rarity="${row.item.rarity}">
          <span class="emoji">${cfg.icon}</span>
          <span class="drop-name">${row.item.name}<small>${Data.RARITY[row.item.rarity].label} · ${label}</small></span>
          <span class="drop-percent">${row.percent}%</span>
          <span class="drop-owned">${owned ? '[✓]' : '[ ]'}</span>
        </div>`;
    }).join('');
    openSheet(`${cfg.icon} ${cfg.name} — что внутри`, `<div class="drop-table">${rows}</div>`);
  }

  /* ---------- Рулетка ---------- */
  function randomPoolItem(caseId) {
    const drop = Rules.rollCaseDrop(caseId);
    return Rules.findItemById(drop.itemId).item;
  }

  function rouletteCellHtml(item) {
    return `<div class="roulette-item" data-rarity="${item.rarity}">
              <span class="card-emoji">${item.hashrateTh !== undefined ? '🗄️' : (item.hashrate > 20 ? '🎮' : '🔩')}</span>
              <span>${item.name}</span>
            </div>`;
  }

  /**
   * Анимация рулетки: strip из N случайных ячеек, выигрыш — предпоследняя.
   * @returns Promise<number> offsetX, на котором остановится лента
   */
  function spinRoulette(caseId, winners) {
    return new Promise((resolve) => {
      const strip = $('#roulette-strip');
      const CELLS = 48;
      const CELL_W = 92; // 86 + gap 6
      const cells = [];
      for (let i = 0; i < CELLS - 2; i++) cells.push(randomPoolItem(caseId));
      cells.push(winners[0]); // целевая ячейка
      cells.push(randomPoolItem(caseId));
      strip.innerHTML = cells.map(rouletteCellHtml).join('');
      strip.style.transition = 'none';
      strip.style.transform = 'translateX(0)';

      const wrapW = $('.roulette-strip-wrap').clientWidth;
      const targetIndex = CELLS - 2;
      const jitter = (Math.random() - 0.5) * (CELL_W - 30);
      const offset = targetIndex * CELL_W + CELL_W / 2 - wrapW / 2 + jitter;

      requestAnimationFrame(() => {
        strip.style.transition = 'transform 5s cubic-bezier(0.12, 0.7, 0.1, 1)';
        strip.style.transform = `translateX(-${offset}px)`;
      });
      setTimeout(() => resolve(offset), 5100);
    });
  }

  async function openCaseFlow(caseId) {
    if (rouletteBusy) return;
    rouletteBusy = true;
    const batch = [];
    try {
      for (let k = 0; k < currentMult; k++) {
        batch.push(Rules.run('openCase', state, caseId));
      }
    } catch (err) {
      rouletteBusy = false;
      handleError(err);
      return;
    }

    $('#roulette').classList.remove('hidden');
    haptic('impact');
    await spinRoulette(caseId, batch.map((b) => b.item));
    haptic('success');

    // Итоговая сетка результатов для ×3/×5/×10
    $('#roulette-batch').innerHTML = batch.map((b) => `
      <div class="part-card" data-rarity="${b.item.rarity}">
        <span class="card-emoji">${emojiForItem(b.item)}</span>
        <span class="item-name">${b.item.name}</span>
        ${rarityTag(b.item.rarity)}
      </div>`).join('');

    handleQuestsToast(batch[0].quests);
    rouletteBusy = false;
    afterChange();
  }

  /* ------------------------------------------------------------
   * 6. Рендер: Мастерская
   * ---------------------------------------------------------- */
  function renderWorkshop() {
    // 8 слотов проекта
    const pv = Workshop.previewProject(state);
    $('#slots-list').innerHTML = Data.SLOT_TYPES.map((s) => {
      const uid = state.project.slots[s.id];
      const inst = uid ? Workshop.findInstance(state, uid) : null;
      return `
        <li class="part-slot ${inst ? 'part-slot--filled' : ''} ${s.required ? 'part-slot--required' : ''}"
            data-slot="${s.id}">
          <span class="slot-icon">${s.icon}</span>
          <span class="slot-label">${s.label}</span>
          <span class="slot-value" ${inst ? `data-rarity="${inst.rarity}"` : ''}>${inst ? inst.name : '— пусто —'}</span>
          ${inst ? `<button class="slot-clear" data-unslot="${s.id}" aria-label="Убрать">✕</button>` : ''}
        </li>`;
    }).join('');

    $('#sum-power').textContent = `${pv.power} Вт / БП ${pv.psuCap} Вт`;
    $('#sum-hashrate').textContent = `${pv.hashrate.toFixed(1)} MH/s`;
    $('#sum-fps').textContent = pv.fps;
    $('#sum-error').textContent = pv.validation.valid ? '' : `⚠ ${pv.validation.errors[0]}`;

    // Склад деталей
    const groups = Workshop.partsByModel(state);
    $('#warehouse-grid').innerHTML = groups.length
      ? groups.map(({ item, count }) => {
          const def = Rules.findPart(item.slot, item.id);
          return `
            <div class="part-card" data-rarity="${item.rarity}" data-pick-part="${item.uid}">
              <span class="item-count">×${count}</span>
              ${itemThumb(item)}
              <span class="item-name">${item.name}</span>
              <span class="item-stat">${def.hashrate ? def.hashrate + ' MH/s' : ''} ${def.power ? '· ' + def.power + 'Вт' : ''}</span>
            </div>`;
        }).join('')
      : '<p class="racks-empty">Склад пуст — открывайте кейсы 📦</p>';

    // Слияние
    const mergeRows = groups.map(({ item, count }) => {
      const can = Workshop.canMerge(state, item.id);
      const nextName = can.ok ? can.next.name : (can.reason === 'max_tier' ? 'макс. уровень' : `нужно ещё ${Data.ECONOMY.MERGE_COUNT - count}`);
      return `
        <div class="merge-row" data-rarity="${item.rarity}">
          <span>${emojiForItem(item)} ${item.name} <small>на складе: ${count} → ${nextName}</small></span>
          <button class="btn btn--small btn--primary" ${can.ok ? '' : 'disabled'} data-merge="${item.id}">Слить ⚗️</button>
        </div>`;
    }).join('');
    $('#merge-list').innerHTML = mergeRows || '<p class="racks-empty">Нет деталей для слияния.</p>';

    // FPS-дуэли
    const now = Date.now();
    const energy = Fps.currentEnergy(state, now);
    $('#duel-energy').textContent = `⚡ ${energy} / ${Data.ECONOMY.DUEL_ENERGY_MAX}`;
    const opps = Fps.availableDuels(state);
    $('#opponents-list').innerHTML = opps.map((o) => `
      <div class="opponent-row">
        <span class="tier-badge">T${o.tier}</span>
        <span class="opp-info"><span class="opp-name">${o.name}</span>
          <span class="opp-fps">~${o.fps} FPS · победа: ${Rules.fmtMoney(o.reward)} ₽</span></span>
        <button class="btn btn--small btn--primary" data-duel="${o.id}">⚔️ Бой (2⚡)</button>
      </div>`).join('');
  }

  /** Модалка выбора детали для слота. */
  function showSlotPicker(slotId) {
    const slot = Data.SLOT_TYPES.find((s) => s.id === slotId);
    const options = Workshop.partInstances(state, slotId).filter((i) => Workshop.isInstanceFree(state, i.uid));
    const body = options.length
      ? `<div class="drop-table">` + options.map((i) => `
          <div class="drop-row" data-rarity="${i.rarity}">
            <span class="emoji">${emojiForItem(i)}</span>
            <span class="drop-name">${i.name}<small>${Data.RARITY[i.rarity].label}</small></span>
            <button class="btn btn--small btn--primary" data-install="${slotId}:${i.uid}">Установить</button>
          </div>`).join('') + `</div>`
      : `<p class="racks-empty">На складе нет свободных деталей типа «${slot.label}». Откройте кейсы или разберите устройства.</p>`;
    openSheet(`${slot.icon} ${slot.label}`, body);
  }

  function runDuel(opponentId) {
    const res = act(() => Fps.fightDuel(state, opponentId));
    if (!res) return;
    const box = $('#duel-result');
    box.classList.remove('hidden');
    box.innerHTML = `
      <h3 class="panel-title">${res.win ? '🏆 Победа!' : '💥 Поражение'}</h3>
      <div class="duel-vs">
        <div><div class="duel-score ${res.win ? 'duel-win' : 'duel-lose'}">${res.you}</div><small>вы</small></div>
        <div><b>FPS</b></div>
        <div><div class="duel-score ${res.win ? 'duel-lose' : 'duel-win'}">${res.them}</div><small>противник</small></div>
      </div>
      <p class="duel-note">${res.note}${res.rewardRub ? ` · награда ${Rules.fmtMoney(res.rewardRub)} ₽` : ''}${res.loot ? ` · лут: ${res.loot.name}` : ''}</p>`;
    haptic(res.win ? 'success' : 'error');
  }

  /* ------------------------------------------------------------
   * 7. Рендер: Меню
   * ---------------------------------------------------------- */
  function renderMenu() {
    $('#login-streak').textContent = state.daily.streak;

    const days = Rewards.dailyBonusTable();
    // Если бонус сегодня ещё не забран — «сегодняшний» день = streak+1
    const claimedToday = Rewards.canClaimDaily(state) === false;
    const claimedUpTo = state.daily.streak;
    $('#bonus-days').innerHTML = days.map((d) => {
      const claimed = d.day <= claimedUpTo;
      const today = claimedToday ? d.day === claimedUpTo + 1 : d.day === Math.max(1, claimedUpTo);
      return `<div class="bonus-day ${claimed ? 'bonus-day--claimed' : ''} ${today ? 'bonus-day--today' : ''}">
                <span>День ${d.day}</span>
                <span class="day-reward">${d.isFinal ? '🔑' : '₽'}</span>
                <span>${d.isFinal ? 'кейс' : Math.round(d.amount / 1000) + 'k'}</span>
              </div>`;
    }).join('');
    $('#btn-daily-bonus').disabled = !Rewards.canClaimDaily(state);

    // Квесты
    $('#quests-list').innerHTML = Rewards.questsProgress(state).map(({ quest, done, progress }) => `
      <div class="quest-row ${done ? 'quest-row--done' : ''}">
        <div class="quest-title"><span>${quest.title}</span><span>${progress}/${quest.goal}</span></div>
        <div class="quest-desc">${quest.desc} · награда: ${quest.reward.type === 'currency' ? Rules.fmtMoney(quest.reward.amount) + ' ₽' : '🔑 кейс'}</div>
        <div class="quest-bar"><i style="width:${Math.round((progress / quest.goal) * 100)}%"></i></div>
      </div>`).join('');

    // Коллекция
    const prog = Rewards.collectionProgress(state);
    $('#collection-percent').textContent = `${prog.owned}/${prog.total} (${prog.percent}%)`;
    $('#collection-grid').innerHTML = Rewards.collectionStatus(state).map((m) => `
      <div class="collect-cell ${m.owned ? '' : 'collect-cell--locked'}" data-rarity="${m.item.rarity}">
        <span class="card-emoji">${m.kind === 'asic' ? '🗄️' : m.kind === 'pc' ? '🖥️' : (Data.SLOT_TYPES.find((s) => s.id === m.slot) || {}).icon || '🔩'}</span>
        <span class="item-name">${m.owned ? m.item.name : '???'}</span>
        <span class="collect-check">${m.owned ? '[✓]' + (m.count ? ' ×' + m.count : '') : '[ ]'}</span>
      </div>`).join('');

    // Расширение
    const devicesCount = state.devices.length + Object.keys(state.deviceRack).length;
    $('#garage-used').textContent = devicesCount;
    $('#garage-total').textContent = state.garageSlots;
    const slotPrice = Rewards.nextSlotPrice(state);
    $('#btn-buy-slot').textContent = slotPrice ? `+ Слот (${Rules.fmtMoney(slotPrice)} ₽)` : 'Максимум';
    $('#btn-buy-slot').disabled = !slotPrice;
    $('#racks-count').textContent = state.racks.length;
  }

  /* ------------------------------------------------------------
   * 8. Полный рендер
   * ---------------------------------------------------------- */
  function renderAll() {
    if (!state) return;
    renderHeader();
    renderFarm();
    renderCases();
    renderWorkshop();
    renderMenu();
  }

  /* ------------------------------------------------------------
   * 9. Вкладки
   * ---------------------------------------------------------- */
  function switchTab(target) {
    $$('.screen').forEach((s) => s.classList.toggle('screen--active', s.dataset.screen === target));
    $$('.nav-item').forEach((n) => n.classList.toggle('nav-item--active', n.dataset.target === target));
    $('#app-main').scrollTop = 0;
    haptic('select');
  }

  function switchWsTab(tab) {
    $$('[data-ws-tab]').forEach((t) => t.classList.toggle('tab--active', t.dataset.wsTab === tab));
    ['build', 'merge', 'duels'].forEach((name) => {
      $('#ws-' + name).classList.toggle('hidden', name !== tab);
    });
    haptic('select');
  }

  /* ------------------------------------------------------------
   * 10. Делегирование кликов
   * ---------------------------------------------------------- */
  function bindEvents() {
    // Нижняя навигация
    $('#bottom-nav').addEventListener('click', (e) => {
      const item = e.target.closest('.nav-item');
      if (item) switchTab(item.dataset.target);
    });

    // Закрытие модалки
    $('#sheet-close').addEventListener('click', closeSheet);
    $('#modal-overlay').addEventListener('click', (e) => {
      if (e.target === $('#modal-overlay')) closeSheet();
    });
    if (tg && tg.BackButton) {
      tg.BackButton.show();
      tg.BackButton.onClick(() => {
        if (!$('#modal-overlay').classList.contains('hidden')) closeSheet();
        else switchTab('farm');
      });
    }

    // Общий делегат по документу
    document.addEventListener('click', (e) => {
      const el = e.target;

      /* ---- Подтверждения data-confirm ---- */
      const confirmEl = el.closest('[data-confirm]');
      if (confirmEl) {
        const msg = confirmEl.getAttribute('data-confirm');
        const ok = tg && tg.confirm ? tg.confirm(msg) : global.confirm(msg);
        if (!ok) { haptic('select'); return; }
        haptic('impact');
      }

      /* ---- Вкладки мастерской ---- */
      const wsTab = el.closest('[data-ws-tab]');
      if (wsTab) { switchWsTab(wsTab.dataset.wsTab); return; }

      /* ---- Множители кейсов ---- */
      const mult = el.closest('[data-mult]');
      if (mult) {
        currentMult = Number(mult.dataset.mult);
        $$('.mult-btn').forEach((b) => b.classList.toggle('mult-btn--active', b === mult));
        haptic('select');
        return;
      }

      /* ---- Кейсы ---- */
      if (el.closest('#btn-reward-case')) {
        act(() => {
          const res = Rules.run('claimRewardCase', state);
          toast(`🎁 Кейс наград: ${res.item.name}!`, 'success');
          haptic('success');
          return res;
        });
        return;
      }
      const info = el.closest('[data-case-info]');
      if (info) { showCaseContents(info.dataset.caseInfo); haptic('select'); return; }
      const open = el.closest('[data-case-open]');
      if (open) { openCaseFlow(open.dataset.caseOpen); return; }

      /* ---- Ферма ---- */
      if (el.closest('#btn-collect-income')) {
        act(() => {
          const res = Rules.run('claimMining', state);
          toast(`📥 Получено ${res.coins.toFixed(6)} CR`, 'success');
          haptic('success');
          return res;
        });
        return;
      }
      if (el.closest('#btn-sell-coins')) {
        act(() => {
          const res = Rules.run('sellCoins', state);
          toast(`💱 Продано за ${Rules.fmtMoney(res.rub)} ₽ (э/э −${Rules.fmtMoney(res.electricityPaid)} ₽)`, 'success');
          haptic('success');
          return res;
        });
        return;
      }
      const tap = el.closest('#btn-tap-farm');
      if (tap) {
        // collectTap уже начисляет res.gain на state.balance внутри Rules.actions
        const res = Rules.run('collectTap', state);
        const plus = document.createElement('span');
        plus.className = 'float-plus';
        plus.textContent = '+' + Rules.fmtMoney(res.gain) + ' ₽';
        plus.style.left = '50%';
        plus.style.top = '8px';
        tap.appendChild(plus);
        setTimeout(() => plus.remove(), 800);
        haptic('select');
        afterChange();
        return;
      }
      if (el.closest('#btn-buy-rack') || el.closest('#btn-menu-rack')) {
        act(() => {
          const res = Rules.run('buyRack', state);
          toast(`🗄️ Куплена ${res.rack.name}`, 'success');
          return res;
        });
        return;
      }
      if (el.closest('#btn-buy-slot')) {
        act(() => {
          const res = Rules.run('buyDeviceSlot', state);
          toast(`➕ Слот куплен. Всего: ${res.slots}`, 'success');
          return res;
        });
        return;
      }

      /* ---- Разбор устройства ---- */
      const scrap = el.closest('[data-scrap]');
      if (scrap) {
        const uid = scrap.dataset.scrap;
        const okMsg = 'Разобрать устройство на детали?';
        const confirmed = tg && tg.confirm ? tg.confirm(okMsg) : global.confirm(okMsg);
        if (!confirmed) return;
        act(() => {
          const res = Workshop.scrapDevice(state, uid);
          toast(`🔧 Разобрано: +${res.parts.length} деталей`, 'success');
          return res;
        });
        return;
      }

      /* ---- Стойки: снятие/установка ---- */
      const unrack = el.closest('[data-unrack]');
      if (unrack) { act(() => Rules.run('removeFromRack', state, unrack.dataset.unrack)); return; }
      const emptySlot = el.closest('[data-empty-rack]');
      if (emptySlot) { showRackPicker(emptySlot.dataset.emptyRack, Number(emptySlot.dataset.slotIndex)); return; }

      /* ---- Мастерская: слоты проекта ---- */
      const unslot = el.closest('[data-unslot]');
      if (unslot) {
        Workshop.uninstallPart(state, unslot.dataset.unslot);
        afterChange();
        return;
      }
      const slotRow = el.closest('[data-slot]');
      if (slotRow && !el.closest('.slot-clear')) { showSlotPicker(slotRow.dataset.slot); return; }

      const pick = el.closest('[data-pick-part]');
      if (pick) {
        const inst = Workshop.findInstance(state, pick.dataset.pickPart);
        if (inst) {
          act(() => Workshop.installPart(state, inst.slot, inst.uid));
          closeSheet();
        }
        return;
      }
      const install = el.closest('[data-install]');
      if (install) {
        const [slotId, uid] = install.dataset.install.split(':');
        act(() => Workshop.installPart(state, slotId, uid));
        closeSheet();
        return;
      }

      if (el.closest('#btn-finish-build')) {
        act(() => {
          const res = Workshop.finishPcBuild(state);
          toast(`✅ Собрано: ${res.device.name} (${res.stats.hashrate} MH/s)`, 'success');
          haptic('success');
          return res;
        });
        return;
      }
      if (el.closest('#btn-asic-route')) {
        act(() => {
          const res = Workshop.finishAsicBuild(state);
          toast(`⚙️ Сварганен: ${res.device.name}`, 'success');
          haptic('success');
          return res;
        });
        return;
      }

      /* ---- Слияние ---- */
      const merge = el.closest('[data-merge]');
      if (merge && !merge.disabled) {
        act(() => {
          const res = Workshop.mergeParts(state, merge.dataset.merge);
          if (res.outcome === 'success') toast(`⚗️ Успех! Получена ${res.item.name}`, 'success');
          else if (res.outcome === 'salvage') toast('🟡 Деталь сгорела, но одна уцелела…', 'error');
          else toast('🔴 Все три детали сгорели! 💸', 'error');
          haptic(res.outcome === 'success' ? 'success' : 'error');
          return res;
        });
        return;
      }

      /* ---- Дуэли ---- */
      const duel = el.closest('[data-duel]');
      if (duel) { runDuel(duel.dataset.duel); return; }

      /* ---- Ежедневный бонус ---- */
      if (el.closest('#btn-daily-bonus')) {
        act(() => {
          const res = Rewards.claimDaily(state);
          toast(`🗓 День ${res.day}: +${Rules.fmtMoney(res.amount)} ₽${res.keyOnDay7 ? ' + 🔑 кейса!' : ''}`, 'success');
          haptic('success');
          return res;
        });
        return;
      }

      /* ---- Сброс ---- */
      if (el.closest('#btn-reset')) {
        localStorage.removeItem(Data.ECONOMY.SAVE_KEY);
        init(true);
        toast('Прогресс сброшен. Стартовый набор выдан заново 🚀');
        return;
      }
    });
  }

  /** Модалка выбора устройства для ячейки стойки. */
  function showRackPicker(rackId, slotIndex) {
    const placed = new Set(Object.keys(state.deviceRack));
    const free = state.warehouse.items.filter((i) => i.type !== 'part' && !placed.has(i.uid));
    const body = free.length
      ? `<div class="drop-table">` + free.map((i) => `
          <div class="drop-row" data-rarity="${i.rarity}">
            <span class="emoji">${emojiForItem(i)}</span>
            <span class="drop-name">${i.name}<small>${Data.RARITY[i.rarity].label}</small></span>
            <button class="btn btn--small btn--primary" data-place="${i.uid}:${rackId}:${slotIndex}">В стойку</button>
          </div>`).join('') + '</div>'
      : '<p class="racks-empty">Нет свободных устройств (ПК/ASIC).</p>';
    openSheet('🗄️ Установка в стойку', body);

    // одноразовый обработчик кнопок установки
    const handler = (e) => {
      const btn = e.target.closest('[data-place]');
      if (!btn) return;
      const [uid, rid, idx] = btn.dataset.place.split(':');
      act(() => Rules.run('placeInRack', state, uid, rid, Number(idx)));
      closeSheet();
      $('#sheet-body').removeEventListener('click', handler);
    };
    $('#sheet-body').addEventListener('click', handler);
  }

  /* ------------------------------------------------------------
   * 11. Тик пассивного майнинга
   * ---------------------------------------------------------- */
  function startTick() {
    clearInterval(tickTimer);
    tickTimer = setInterval(() => {
      if (!state) return;
      renderHeader();
      renderFarm();
      renderCases();
      saveState();
    }, Data.ECONOMY.TICK_INTERVAL_MS * 2); // обновляем UI каждые 2 сек
  }

  /* ------------------------------------------------------------
   * 12. Инициализация
   * ---------------------------------------------------------- */
  function init(forceFresh = false) {
    state = forceFresh ? null : loadState();
    if (!state) state = defaultState();
    state.project = state.project || Workshop.emptyProject();
    Workshop.recomputeUsedUids(state);

    // Стартовый набор при первом запуске: Стартовый ПК + 50 000 ₽
    if (!state.starterKitGiven) {
      Rewards.grantStarterKit(state);
      toast('🎁 Стартовый набор: ПК + 50 000 ₽!', 'success');
    }

    // Telegram WebApp
    if (tg) {
      try {
        tg.ready();
        tg.expand();
        if (tg.setHeaderColor) tg.setHeaderColor('#16161d');
        if (tg.setBackgroundColor) tg.setBackgroundColor('#0f0f14');
        if (tg.disableVerticalSwipes) tg.disableVerticalSwipes();
      } catch (e) { /* старые клиенты */ }
    }

    bindEventsSafe();
    renderAll();
    startTick();
    saveState();
  }

  let eventsBound = false;
  function bindEventsSafe() {
    if (eventsBound) return;
    eventsBound = true;
    bindEvents();
  }

  global.Game = {
    get state() { return state; },
    init,
    renderAll,
    switchTab,
    toast,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => init());
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : globalThis);
