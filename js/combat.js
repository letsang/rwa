/* ============================================================
   combat.js — Exécution générique des compétences
   Interprète les structures de data.js : damage, heal, effects,
   AoE (target caps), dash, interrupt, cleanse, poison, runes...
   ============================================================ */

const MAGIC_CLASSES = ['SORCERER', 'RUNEMASTER', 'CLERIC'];

const CombatSystem = {

  /* Dégâts centralisés (+ vfx). */
  dealDamage(source, target, amount, opts = {}) {
    if (!target || target.dead) return;
    if (source) {
      opts.magic = opts.magic != null ? opts.magic : MAGIC_CLASSES.includes(source.classId);
      // Rogue sort du stealth en attaquant
      source.combatTimer = 0;
    }
    target.takeDamage(Math.max(1, Math.round(amount)), source, opts);
    if (source && source.game) source.game.spawnHitFx(target.x, target.y, opts.magic);
  },

  applyPoison(rogue, target) {
    const p = POISONS[rogue.currentPoison];
    if (!p) return;
    const eff = Object.assign({}, p.effect);
    if (rogue.flags.poisonBoost && rogue.flags.poisonBoost > 1) {
      if (eff.value) eff.value *= rogue.flags.poisonBoost;
    }
    EffectSystem.apply(target, eff, rogue.id);
  },

  /* Récupère les cibles d'une AoE (ennemis ou alliés) avec plafond. */
  gatherAoe(caster, cx, cy, radius, cap, wantEnemy) {
    let list = caster.game.entities.filter(e => {
      if (e.dead) return false;
      const ally = e.faction === caster.faction;
      if (wantEnemy && ally) return false;
      if (!wantEnemy && !ally) return false;
      return Math.hypot(e.x - cx, e.y - cy) <= radius;
    });
    list.sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy));
    if (cap && list.length > cap) list = list.slice(0, cap);
    return list;
  },

  /* Point d'entrée : exécute une compétence résolue. */
  executeSkill(caster, skill, targetRef, gx, gy, opts) {
    const game = caster.game;
    const combatTimerBefore = caster.combatTimer; // pour détecter stealth avant l'action
    caster.combatTimer = 0;

    // Orientation vers la cible
    if (targetRef) caster.facing = Math.atan2(targetRef.y - caster.y, targetRef.x - caster.x);
    else if (gx != null) caster.facing = Math.atan2(gy - caster.y, gx - caster.x);

    // Puissance (Runes du Runemaster)
    let power = 1 + (caster.def.runes ? caster.runes * 0.12 : 0);
    power *= (caster.flags.damageMult || 1);

    const wasStealthed = caster.def.stealthClass && combatTimerBefore > 3;

    /* ---- Skills utilitaires "self" ---- */
    if (skill.quickcast) { caster.quickcast = true; caster.floatText('QUICKCAST', '#7ad0ff'); }
    if (skill.uninterruptible) { caster.uninterruptible = skill.uninterruptibleDuration; caster.floatText('CONCENTRATION', '#7ad0ff'); }
    if (skill.purge) { EffectSystem.purge(caster); }
    if (skill.cyclePoison) {
      const arr = skill.poisons;
      const i = arr.indexOf(caster.currentPoison);
      caster.currentPoison = arr[(i + 1) % arr.length];
      caster.floatText('POISON: ' + POISONS[caster.currentPoison].name, '#a8cf5f');
    }
    if (skill.vanish) { caster.combatTimer = 2.1; caster.floatText('VANISH', '#9ec2e6'); }
    if (skill.toggle && skill.id === 'guard') {
      caster.guardTarget = (targetRef && targetRef !== caster) ? targetRef : null;
      caster.floatText(caster.guardTarget ? 'GUARD ✓' : 'GUARD ✗', '#7fd9a0');
    }

    // Effets sur soi
    if (skill.selfEffects) for (const e of skill.selfEffects) EffectSystem.apply(caster, e, caster.id);

    /* ---- Dash (Intercept / Shadowstep) ---- */
    if (skill.dashToTarget && targetRef && targetRef !== caster) {
      if (skill.noWalls && game.map.lineBlocked(caster.x, caster.y, targetRef.x, targetRef.y)) {
        caster.floatText('BLOQUÉ (mur)', '#ff8a8a');
      } else {
        const ang = Math.atan2(caster.y - targetRef.y, caster.x - targetRef.x);
        caster.x = targetRef.x + Math.cos(ang) * 44;
        caster.y = targetRef.y + Math.sin(ang) * 44;
        const c = game.map.resolveCollision(caster.x, caster.y, caster.radius);
        caster.x = c.x; caster.y = c.y;
      }
      if (skill.interceptGuard) { caster.guardTarget = targetRef; }
    }

    /* ---- Volley (dégâts de zone dans le temps) ---- */
    if (skill.ticks && skill.targetType === 'ground') {
      game.spawnGroundEffect({
        x: gx, y: gy, radius: skill.aoeRadius, cap: skill.targetCap,
        damage: skill.damage * power, ticks: skill.ticks, interval: skill.tickInterval,
        faction: caster.faction, caster,
      });
      caster.floatText(skill.name, '#e6d27a');
      if (skill.grantsRune && caster.def.runes) caster.runes = Math.min(3, caster.runes + 1);
      return;
    }

    /* ---- Détermination des cibles ---- */
    let dmgTargets = [], healTargets = [], effectTargets = [];

    const isAoE = skill.aoeRadius && (skill.targetType === 'ground' || skill.healAllies || skill.buffAllies || skill.appliesToAllies || skill.effects);
    const damaging = skill.damage != null;
    const affectsEnemy = damaging || (skill.effects && skill.targetType !== 'ally');

    if (skill.aoeRadius && (skill.targetType === 'ground')) {
      const cx = gx, cy = gy;
      dmgTargets = affectsEnemy ? this.gatherAoe(caster, cx, cy, skill.aoeRadius, skill.targetCap, true) : [];
      effectTargets = dmgTargets;
    } else if (skill.aoeRadius && (skill.healAllies || skill.buffAllies || skill.appliesToAllies)) {
      healTargets = this.gatherAoe(caster, caster.x, caster.y, skill.aoeRadius, skill.targetCap, false);
      healTargets.push(caster);
    } else {
      // cible unique
      if (skill.targetType === 'enemy') { dmgTargets = targetRef ? [targetRef] : []; effectTargets = dmgTargets; }
      if (skill.targetType === 'ally')  { healTargets = [targetRef || caster]; }
    }

    /* ---- Dégâts ---- */
    if (damaging) {
      for (const t of dmgTargets) {
        let dmg = skill.damage * power;

        // positionnel (Backslash, Backstab)
        if (skill.requiresBehind) {
          const mult = caster.positionalMult(t);
          if (mult < 1.25) dmg *= (skill.frontPenalty || 0.3); // pas dans le dos = forte pénalité
          else dmg *= 1.0;
        }
        // depuis stealth (Backstab)
        if (skill.fromStealthBonus && wasStealthed) dmg += skill.fromStealthBonus * power;

        // bonus de distance (Long Shot)
        if (skill.rangeDamageBonus) {
          const dist = caster.distanceTo(t);
          dmg *= (0.85 + Math.min(0.5, dist / 1200));
        }
        if (caster.flags.crit) dmg *= 1.6;

        const melee = (caster.def.attackRange <= 60);
        this.dealDamage(caster, t, dmg, { melee, interrupt: skill.interrupt });
      }
    } else if (skill.interrupt) {
      // interrupt "pur" (Shield Bash, Battle Cry, Rapid Shot avec petits dégâts déjà gérés)
      for (const t of dmgTargets) this.dealDamage(caster, t, skill.damage || 5, { interrupt: true, melee: caster.def.attackRange <= 60 });
    }

    /* ---- Effets (CC / debuffs) sur ennemis ---- */
    if (skill.effects && skill.targetType !== 'ally' && skill.targetType !== 'self') {
      for (const t of effectTargets) {
        for (const e of skill.effects) EffectSystem.apply(t, e, caster.id);
      }
    }

    /* ---- Soins ---- */
    if (skill.heal) for (const t of healTargets) t.heal(skill.heal * (caster.flags.damageMult || 1), caster);
    if (skill.healAllies) for (const t of healTargets) t.heal(skill.healAllies, caster);

    /* ---- Buffs alliés / boucliers ---- */
    if (skill.buffAllies) for (const t of healTargets) for (const e of skill.buffAllies) EffectSystem.apply(t, e, caster.id);
    if (skill.appliesToAllies && skill.effects) for (const t of healTargets) for (const e of skill.effects) EffectSystem.apply(t, e, caster.id);
    // Realm ally-buff (Bodyguard, Intercept) sur cible unique alliée
    if (skill.targetType === 'ally' && skill.effects && !skill.appliesToAllies) {
      const t = healTargets[0];
      if (t) for (const e of skill.effects) EffectSystem.apply(t, e, caster.id);
    }

    /* ---- Cleanse (Cure) ---- */
    if (skill.cleanse) {
      const t = healTargets[0];
      if (t) { t.effects = t.effects.filter(e => !skill.cleanse.includes(e.type)); t.floatText('CURE', '#66d97a'); }
    }

    /* ---- Rune gagnée ---- */
    if (skill.grantsRune && caster.def.runes) caster.runes = Math.min(3, caster.runes + 1);
  },
};

window.CombatSystem = CombatSystem;
