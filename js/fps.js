/* ============================================================
 * fps.js — FPS-сражения (бенчмарк-дуэли) вместо гонок
 * Crypto Rigs: Master & Mining (Telegram Mini App)
 *
 * globalThis.Fps:
 *  - Ваша сборка/устройство против противников из Data.FPS_OPPONENTS;
 *  - Суммарные FPS-очки = GPU×1.6 + CPU×0.7 + RAM + MB + SSD + корпус,
 *    бонус за охлаждение (стабильность), штраф за перегрев;
 *  - Система энергии: дуэль стоит DUEL_COST_ENERGY, энергия
 *    восстанавливается раз в DUEL_ENERGY_REGEN_MS;
 *  - Награда за победу — ₽ и шанс на деталь.
 *
 * Модуль не трогает DOM. Ошибки — Rules.GameError.
 * ============================================================ */

(function (global) {
  'use strict';

  const D = () => global.Data;
  const R = () => global.Rules;

  /* ------------------------------------------------------------
   * 1. Энергия для битв
   * ---------------------------------------------------------- */
  function currentEnergy(state, now = Date.now()) {
    const E = D().ECONOMY;
    if (state.energy.points >= E.DUEL_ENERGY_MAX) return E.DUEL_ENERGY_MAX;
    const regen = Math.floor((now - state.energy.updatedAt) / E.DUEL_ENERGY_REGEN_MS);
    if (regen > 0) {
      state.energy.points = Math.min(E.DUEL_ENERGY_MAX, state.energy.points + regen);
      state.energy.updatedAt += regen * E.DUEL_ENERGY_REGEN_MS;
    }
    return state.energy.points;
  }

  function msToNextEnergy(state, now = Date.now()) {
    const E = D().ECONOMY;
    if (state.energy.points >= E.DUEL_ENERGY_MAX) return 0;
    return E.DUEL_ENERGY_REGEN_MS - (now - state.energy.updatedAt);
  }

  /* ------------------------------------------------------------
   * 2. Расчёт «боевых» FPS устройства
   * ---------------------------------------------------------- */

  /** FPS по готовому устройству (pc/asic instance). */
  function deviceFps(instance) {
    const stats = instance.stats || {};
    let base = stats.fps || instance.fps || 0;
    // Кастомные сборки уже содержат fps в stats
    if (!base && stats.hashrate) base = stats.hashrate * 8; // консоль майнинг-фермы ~ бенчмарк
    return Math.round(base);
  }

  /** Итоговые очки дуэли с учётом стабильности охлаждения. */
  function duelScore(fpsBase, coolPoints = 0, rng = Math.random) {
    // Перегрев: если охлаждения мало относительно мощности — риск просадки кадров
    const heatRisk = Math.max(0, Math.min(0.35, (fpsBase / 4000) * 0.12 - coolPoints / 400));
    let mult = 1;
    let note = 'Стабильный прогон';
    const roll = rng();
    if (roll < heatRisk) {
      mult = 0.75 + rng() * 0.15;
      note = '⚠️ Троттлинг! Перегрев снизил результат';
    } else if (coolPoints >= 120 && roll > 0.75) {
      mult = 1.05 + rng() * 0.1;
      note = '❄️ Отличное охлаждение — разгон стабилен';
    } else if (roll > 0.9) {
      mult = 1.08;
      note = '🔥 Удачный прогон бэнчмарка';
    }
    // Небольшой случайный разброс ±5%
    const jitter = 0.95 + rng() * 0.1;
    return { score: Math.round(fpsBase * mult * jitter), note };
  }

  /** Лучшее активное устройство игрока (по FPS) — «боевой ПК». */
  function bestDevice(state) {
    // activeDevices возвращает stats-объекты; здесь нужны именно инстансы
    let best = null;
    state.warehouse.items.forEach((inst) => {
      if (inst.type === 'part') return;
      const isPlaced = state.devices.includes(inst.uid) || state.deviceRack[inst.uid];
      if (!isPlaced) return;
      const fps = deviceFps(inst);
      if (!best || fps > deviceFps(best)) best = inst;
    });
    return best;
  }

  /** Текущий проект мастерской как боевая сборка (если валидна). */
  function projectCombatStats(state) {
    if (!global.Workshop || !state.project) return null;
    const pv = global.Workshop.previewProject(state);
    if (!pv.validation.valid) return null;
    return { fps: pv.fps, cool: pv.build.cooling ? pv.build.cooling.cool : 0 };
  }

  /* ------------------------------------------------------------
   * 3. Дуэль
   * ---------------------------------------------------------- */
  function opponentById(id) {
    return D().FPS_OPPONENTS.find((o) => o.id === id) || null;
  }

  /** Доступные дуэли: следующий tier противника не выше уровня игрока+2. */
  function availableDuels(state) {
    const maxTier = Math.min(5, 1 + Math.floor(state.level / 4));
    return D().FPS_OPPONENTS.filter((o) => o.tier <= maxTier);
  }

  /**
   * Провести дуэль.
   * @returns {win, you, them, rewardRub, loot?, note, quests}
   */
  function fightDuel(state, opponentId, rng = Math.random, now = Date.now()) {
    const E = D().ECONOMY;
    const opp = opponentById(opponentId);
    if (!opp) throw new R().GameError('not_found', 'Противник не найден');

    const energy = currentEnergy(state, now);
    if (energy < E.DUEL_COST_ENERGY) {
      throw new R().GameError('no_energy', `Нужно ${E.DUEL_COST_ENERGY}⚡ энергии (есть ${energy}). Восстановится через ${R().formatDuration(msToNextEnergy(state, now))}`);
    }

    // Выбираем бойца: активная сборка из мастерской или лучшее устройство
    const proj = projectCombatStats(state);
    const dev = bestDevice(state);
    let fpsBase, cool;
    if (proj && (!dev || proj.fps >= deviceFps(dev))) {
      fpsBase = proj.fps; cool = proj.cool;
    } else if (dev) {
      fpsBase = deviceFps(dev);
      cool = (dev.stats && dev.stats.cool) || (dev.rarity === 'legendary' ? 150 : dev.rarity === 'epic' ? 80 : 30);
    } else {
      throw new R().GameError('no_device', 'Нечем бенчмаркать — соберите ПК или купите устройство');
    }
    if (fpsBase <= 0) throw new R().GameError('weak_build', 'Сборка слишком слабая для дуэлей');

    // Списываем энергию; стартуем окно регенерации, если энергия была полна
    const wasFull = state.energy.points >= E.DUEL_ENERGY_MAX;
    state.energy.points = energy - E.DUEL_COST_ENERGY;
    if (wasFull || !state.energy.updatedAt) state.energy.updatedAt = now;

    const mine = duelScore(fpsBase, cool, rng);
    const theirs = duelScore(opp.fps, opp.tier * 40, rng);
    const win = mine.score >= theirs.score;

    let rewardRub = 0;
    let loot = null;
    if (win) {
      rewardRub = opp.reward;
      state.balance += rewardRub;
      R().addXp(state, 30 + opp.tier * 15);
      // Шанс лута 35% — деталь около уровня противника
      if (rng() < 0.35) {
        const slots = D().SLOT_TYPES.map((s) => s.id);
        const slot = slots[Math.floor(rng() * slots.length)];
        const pool = D().PARTS[slot].filter((p) => p.tier <= opp.tier + 1 && p.tier >= Math.max(1, opp.tier - 1));
        const pick = pool[Math.floor(rng() * pool.length)] || D().PARTS[slot][0];
        loot = R().addItemToWarehouse(state, { type: 'part', slot, item: pick });
      }
    } else {
      R().addXp(state, 8);
    }

    state.duelsPlayed = (state.duelsPlayed || 0) + 1;
    if (win) state.duelsWon = (state.duelsWon || 0) + 1;
    state.quests.counters.duelsWon = state.duelsWon || 0;
    const quests = R().checkQuests(state);

    return {
      win,
      you: mine.score,
      them: theirs.score,
      note: mine.note,
      rewardRub,
      loot,
      energyLeft: state.energy.points,
      quests,
    };
  }

  /* ------------------------------------------------------------
   * Экспорт
   * ---------------------------------------------------------- */
  global.Fps = {
    currentEnergy,
    msToNextEnergy,
    deviceFps,
    duelScore,
    bestDevice,
    projectCombatStats,
    opponentById,
    availableDuels,
    fightDuel,
  };
})(typeof window !== 'undefined' ? window : globalThis);
