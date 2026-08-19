/* ============================================================
   effects.js — Système générique d'effets (CC, buffs, debuffs)
   Aucune classe n'est traitée en dur ici : le moteur interprète
   uniquement des "types" d'effets. Ajouter une classe = ajouter des
   données dans data.js, pas de code ici.
   ============================================================ */

const EffectSystem = {

  /* Peut-on appliquer ce type de CC (immunité ?) */
  isImmune(entity, type) {
    if (type === 'mez'  && entity.immunities.mez  > 0) return true;
    if (type === 'stun' && entity.immunities.stun > 0) return true;
    if ((type === 'root' || type === 'snare')) {
      if (entity.immunities.root > 0) return true;
    }
    if (type === 'mez'  && entity.flags.immuneMez)        return true;
    if ((type === 'root' || type === 'snare') && entity.flags.immuneRootSnare) return true;
    return false;
  },

  /* Applique un effet (déjà "résolu") à une entité. */
  apply(entity, eff, sourceId) {
    const type = eff.type;

    // Immunité aux CC durs
    if ((type === 'mez' || type === 'root' || type === 'stun' || type === 'snare')
        && this.isImmune(entity, type)) {
      entity.floatText('IMMUNE', '#cccccc');
      return false;
    }

    // Effets "flag" (immunités accordées, charge, etc.)
    if (type === 'immunity_root_snare') { entity.effects.push({ type, remaining: eff.duration }); return true; }
    if (type === 'immunity_mez')        { entity.effects.push({ type, remaining: eff.duration }); return true; }
    if (type === 'immunity_stun')       { entity.effects.push({ type, remaining: eff.duration }); return true; }

    // Heal shield
    if (type === 'heal_shield') {
      entity.effects.push({ type, remaining: eff.duration, value: eff.value });
      return true;
    }

    // Mez : casse toute action, ne stack pas (rafraîchit)
    if (type === 'mez') {
      entity.removeEffectsOfType('mez');
      entity.effects.push({ type, remaining: eff.duration });
      entity.cancelCast('MEZ');
      entity.floatText('MEZ', '#b98ae6');
      return true;
    }

    if (type === 'stun') {
      entity.removeEffectsOfType('stun');
      entity.effects.push({ type, remaining: eff.duration });
      entity.cancelCast('STUN');
      entity.floatText('STUN', '#e6e04f');
      return true;
    }

    if (type === 'root') {
      entity.removeEffectsOfType('root');
      entity.effects.push({ type, remaining: eff.duration });
      entity.floatText('ROOT', '#7fd9a0');
      return true;
    }

    if (type === 'snare') {
      // garde le snare le plus fort
      entity.removeEffectsOfType('snare');
      entity.effects.push({ type, remaining: eff.duration, value: eff.value });
      entity.floatText('SNARE', '#9ec2e6');
      return true;
    }

    if (type === 'disease') {
      entity.removeEffectsOfType('disease');
      entity.effects.push({ type, remaining: eff.duration, value: eff.value });
      entity.floatText('DISEASE', '#a8cf5f');
      return true;
    }

    if (type === 'nearsight') {
      entity.removeEffectsOfType('nearsight');
      entity.effects.push({ type, remaining: eff.duration, value: eff.value });
      entity.floatText('NEARSIGHT', '#cf8ac0');
      return true;
    }

    if (type === 'dot') {
      entity.effects.push({ type, remaining: eff.duration, value: eff.value,
                            tick: eff.tick || 1.0, tickTimer: eff.tick || 1.0, sourceId });
      return true;
    }

    // Buffs génériques (speed, damage, attackspeed, defense_down, guard, charge, stealth, camouflage...)
    entity.effects.push(Object.assign({ remaining: eff.duration }, eff));
    return true;
  },

  /* Suppression Purge : mez/root/stun/snare */
  purge(entity) {
    entity.effects = entity.effects.filter(e =>
      !['mez', 'root', 'stun', 'snare'].includes(e.type));
    entity.floatText('PURGE', '#7ad0ff');
  },

  /* Réveille un mez (dégâts subis / sorts de réveil) */
  breakMez(entity) {
    const had = entity.effects.some(e => e.type === 'mez');
    if (had) {
      entity.removeEffectsOfType('mez');
      // immunité mez après réveil
      entity.immunities.mez = Math.max(entity.immunities.mez, CC_IMMUNITY_AFTER.mez);
    }
    return had;
  },

  /* Mise à jour temporelle + expirations + DoT. Retourne dégâts DoT à appliquer. */
  update(entity, dt) {
    // Décrément immunités
    for (const k of ['mez', 'root', 'stun']) {
      if (entity.immunities[k] > 0) entity.immunities[k] = Math.max(0, entity.immunities[k] - dt);
    }

    const expired = [];
    for (const e of entity.effects) {
      e.remaining -= dt;

      // DoT tick
      if (e.type === 'dot') {
        e.tickTimer -= dt;
        if (e.tickTimer <= 0) {
          e.tickTimer += e.tick;
          entity.pendingDotDamage = (entity.pendingDotDamage || 0) + e.value;
        }
      }

      if (e.remaining <= 0) expired.push(e);
    }

    // Gérer expirations et immunités post-CC
    for (const e of expired) {
      if (e.type === 'mez')  entity.immunities.mez  = Math.max(entity.immunities.mez,  CC_IMMUNITY_AFTER.mez);
      if (e.type === 'root') entity.immunities.root = Math.max(entity.immunities.root, CC_IMMUNITY_AFTER.root);
      if (e.type === 'stun') entity.immunities.stun = Math.max(entity.immunities.stun, CC_IMMUNITY_AFTER.stun);
    }
    if (expired.length) {
      entity.effects = entity.effects.filter(e => e.remaining > 0);
    }
  },

  /* Recalcule les flags dérivés (appelé chaque frame après update). */
  recompute(entity) {
    const f = entity.flags;
    f.canMove = true; f.canCast = true; f.canAttack = true;
    f.speedMult = 1; f.damageMult = 1; f.attackSpeedMult = 1;
    f.healReceivedMult = 1; f.rangeMult = 1; f.damageTakenMult = 1;
    f.meleeResist = 0; f.crit = false; f.poisonBoost = 1;
    f.immuneRootSnare = false; f.immuneMez = false;
    f.stealthed = false; f.camouflaged = false;
    f.mez = false; f.root = false; f.stun = false;

    let snareFactor = 1;

    for (const e of entity.effects) {
      switch (e.type) {
        case 'mez':  f.mez = true;  f.canMove = false; f.canCast = false; f.canAttack = false; break;
        case 'stun': f.stun = true; f.canMove = false; f.canCast = false; f.canAttack = false; break;
        case 'root': f.root = true; f.canMove = false; break; // peut caster/attaquer
        case 'snare': snareFactor = Math.min(snareFactor, 1 - e.value); break;
        case 'disease': f.healReceivedMult *= (1 - e.value); break;
        case 'nearsight': f.rangeMult *= (1 - e.value); break;
        case 'buff_speed': f.speedMult *= e.value; break;
        case 'buff_damage': f.damageMult *= e.value; if (e.crit) f.crit = true; if (e.poisonBoost) f.poisonBoost = e.poisonBoost; if (e.meleeResist) f.meleeResist = Math.max(f.meleeResist, e.meleeResist); break;
        case 'buff_attackspeed': f.attackSpeedMult *= e.value; break;
        case 'defense_down': f.damageTakenMult *= (1 + e.value); break;
        case 'immunity_root_snare': f.immuneRootSnare = true; break;
        case 'immunity_mez': f.immuneMez = true; break;
        case 'stealth': f.stealthed = true; break;
        case 'camouflage': f.camouflaged = true; break;
      }
    }
    // Un mez actif rend le personnage vulnérable (annule stealth déjà géré ailleurs)
    f.speedMult *= snareFactor;
    if (!f.canMove) f.effectiveSpeed = 0;
    else f.effectiveSpeed = entity.baseSpeed * f.speedMult;
  },

  /* Effets visibles pour l'UI (chips) */
  statusChips(entity) {
    const chips = [];
    const seen = {};
    for (const e of entity.effects) {
      let cls = null, label = null;
      switch (e.type) {
        case 'mez': cls='mez'; label='MEZ'; break;
        case 'root': cls='root'; label='ROOT'; break;
        case 'stun': cls='stun'; label='STUN'; break;
        case 'snare': cls='snare'; label='SNARE'; break;
        case 'disease': cls='disease'; label='DISEASE'; break;
        case 'nearsight': cls='nearsight'; label='NS'; break;
        case 'dot': cls='dot'; label='POISON'; break;
        case 'buff_speed': cls='buff'; label='SPD'; break;
        case 'buff_damage': cls='buff'; label='DMG'; break;
        case 'buff_attackspeed': cls='buff'; label='HASTE'; break;
        case 'heal_shield': cls='buff'; label='SHIELD'; break;
      }
      if (label && !seen[label]) { seen[label] = true; chips.push({ cls, label }); }
    }
    if (entity.immunities.mez > 0)  chips.push({ cls:'immune', label:'IMM-MEZ' });
    if (entity.immunities.stun > 0) chips.push({ cls:'immune', label:'IMM-STN' });
    return chips;
  },
};

window.EffectSystem = EffectSystem;
