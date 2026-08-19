/* ============================================================
   entity.js — Entité de combat (joueur ET bots)
   Mouvement, ressources, cast, cooldowns, dégâts, mort, respawn.
   ============================================================ */

let ENTITY_UID = 1;

class Entity {
  constructor(game, faction, classId, isPlayer = false) {
    this.game = game;
    this.id = ENTITY_UID++;
    this.faction = faction;
    this.classId = classId;
    this.def = CLASSES[classId];
    this.isPlayer = isPlayer;
    this.isBot = !isPlayer;

    this.radius = 16;
    this.baseSpeed = this.def.moveSpeed || 110;

    this.maxHp = this.def.hp;
    this.hp = this.maxHp;
    this.maxMana = this.def.mana || 0;
    this.mana = this.maxMana;
    this.maxEndurance = this.def.endurance || 100;
    this.endurance = this.maxEndurance;

    this.effects = [];
    this.immunities = { mez: 0, root: 0, stun: 0 };
    this.flags = {};

    this.cooldowns = {};
    this.globalCd = 0;
    this.casting = null;          // { skill, remaining, total, targetRef, gx, gy }
    this.interruptLock = 0;       // fenêtre post-interrupt
    this.autoTimer = 0;

    this.moveTarget = null;       // {x,y}
    this.followTarget = null;     // Entity à suivre
    this.facing = 0;

    this.target = null;           // cible ennemie sélectionnée
    this.guardTarget = null;      // (Guardian) allié gardé
    this.dead = false;
    this.respawnTimer = 0;
    this.respawnLoc = null;

    this.combatTimer = 99;        // temps hors combat
    this.runes = 0;               // Mage
    this.currentPoison = 'lethal';// Rogue
    this.quickcast = false;       // Sorcerer
    this.uninterruptible = 0;     // Mage MoC
    this.pendingDotDamage = 0;

    this.floats = [];             // textes flottants attachés
    this.stealthDesired = this.def.stealthClass || false; // Rogue veut se cacher hors combat

    // position initiale : base de la faction
    const base = game.map.respawnPoints(faction)[0];
    this.x = base.x + (Math.random() - 0.5) * 120;
    this.y = base.y + (Math.random() - 0.5) * 120;
  }

  get name() { return (this.isPlayer ? 'Vous — ' : '') + this.def.name; }
  get alive() { return !this.dead; }

  distanceTo(e) { return Math.hypot(e.x - this.x, e.y - this.y); }
  distTo(x, y) { return Math.hypot(x - this.x, y - this.y); }

  isEnemy(e) { return e.faction !== this.faction; }
  isAlly(e)  { return e.faction === this.faction && e !== this; }

  floatText(text, color) {
    this.floats.push({ text, color: color || '#fff', life: 1.1, y: 0 });
  }

  removeEffectsOfType(type) {
    this.effects = this.effects.filter(e => e.type !== type);
  }

  hasEffect(type) { return this.effects.some(e => e.type === type); }

  /* ---------- STEALTH ---------- */
  get isStealthed() {
    return this.def.stealthClass && this.combatTimer > 3 && this.stealthDesired && !this.flags.mez && !this.flags.stun;
  }
  get isCamouflaged() { return this.flags.camouflaged && this.combatTimer > 3; }

  /* ---------- CAST ---------- */
  startCast(skill, targetRef, gx, gy) {
    // Quickcast : instantané et non interruptible
    const instant = skill.castTime <= 0 || (this.quickcast && this.game.canQuickcast(skill));
    if (this.quickcast && !instant) {} // quickcast seulement pour sorts à cast
    if (this.quickcast && skill.castTime > 0) {
      this.quickcast = false;
      CombatSystem.executeSkill(this, skill, targetRef, gx, gy, { quickcast: true });
      return;
    }
    if (skill.castTime <= 0) {
      CombatSystem.executeSkill(this, skill, targetRef, gx, gy, {});
      return;
    }
    this.casting = { skill, remaining: skill.castTime, total: skill.castTime, targetRef, gx, gy };
    this.combatTimer = 0;
  }

  cancelCast(reason) {
    if (!this.casting) return;
    const wasSkill = this.casting.skill;
    this.casting = null;
    if (reason === 'INTERRUPT') {
      this.interruptLock = 3.0;
      this.floatText('INTERRUPTED', '#ff5a5a');
      // Le Mage perd une rune
      if (this.def.runes && this.runes > 0) this.runes--;
    }
  }

  updateCast(dt) {
    if (!this.casting) return;
    if (this.flags.mez || this.flags.stun) { this.cancelCast('CC'); return; }
    this.casting.remaining -= dt;
    if (this.casting.remaining <= 0) {
      const c = this.casting;
      this.casting = null;
      CombatSystem.executeSkill(this, c.skill, c.targetRef, c.gx, c.gy, {});
    }
  }

  /* ---------- RESSOURCES ---------- */
  canAfford(skill) {
    const c = skill.cost || {};
    if (c.mana && this.mana < c.mana) return false;
    if (c.endu && this.endurance < c.endu) return false;
    return true;
  }
  payCost(skill) {
    const c = skill.cost || {};
    if (c.mana) this.mana = Math.max(0, this.mana - c.mana);
    if (c.endu) this.endurance = Math.max(0, this.endurance - c.endu);
  }

  onCooldown(skill) { return (this.cooldowns[skill.id] || 0) > 0; }

  /* Tente de lancer une compétence. Retourne true si lancé. */
  tryCast(skill, targetRef, gx, gy) {
    if (this.dead) return false;
    if (this.flags.mez || this.flags.stun) return false;
    if (this.casting) return false;
    if (this.globalCd > 0) return false;
    if (this.onCooldown(skill)) return false;
    if (this.interruptLock > 0 && skill.castTime > 0) return false;
    if (!this.canAfford(skill)) { if (this.isPlayer) this.floatText('Ressource insuffisante', '#ff8a8a'); return false; }

    // Validation de cible
    if (skill.targetType === 'enemy') {
      if (!targetRef || targetRef.dead || !this.isEnemy(targetRef)) return false;
      if (this.distanceTo(targetRef) > this.effectiveRange(skill)) { if (this.isPlayer) this.floatText('Hors de portée', '#ff8a8a'); return false; }
    }
    if (skill.targetType === 'ally') {
      if (skill.id === 'guard') { /* ally requis, géré plus bas */ }
      if (!targetRef) targetRef = this; // self-heal fallback
      if (targetRef !== this && (targetRef.dead || !(targetRef.faction === this.faction))) return false;
      if (this.distTo(targetRef.x, targetRef.y) > this.effectiveRange(skill)) { if (this.isPlayer) this.floatText('Hors de portée', '#ff8a8a'); return false; }
    }
    if (skill.targetType === 'ground') {
      if (gx == null) return false;
      if (this.distTo(gx, gy) > this.effectiveRange(skill) + 40) { if (this.isPlayer) this.floatText('Hors de portée', '#ff8a8a'); return false; }
    }

    this.payCost(skill);
    if (skill.cooldown) this.cooldowns[skill.id] = skill.cooldown;
    this.globalCd = 0.6;
    this.startCast(skill, targetRef, gx, gy);
    return true;
  }

  effectiveRange(skill) {
    let r = skill.range || 0;
    if (this.def.ccRangeBonus && skill.effects && skill.effects.some(e => ['mez','root'].includes(e.type)))
      r *= this.def.ccRangeBonus;
    r *= (this.flags.rangeMult || 1); // nearsight réduit la portée
    return r;
  }

  /* ---------- DÉGÂTS / SOINS ---------- */
  takeDamage(amount, source, opts = {}) {
    if (this.dead) return;
    // armure physique
    let dmg = amount;
    if (!opts.magic) dmg *= (1 - (this.def.armor || 0));
    if (opts.melee) dmg *= (1 - (this.flags.meleeResist || 0));
    dmg *= (this.flags.damageTakenMult || 1);
    dmg = Math.round(dmg);

    // bouclier de soins absorbe
    const shield = this.effects.find(e => e.type === 'heal_shield');
    if (shield) {
      const absorbed = Math.min(shield.value, dmg);
      shield.value -= absorbed; dmg -= absorbed;
      if (shield.value <= 0) this.removeEffectsOfType('heal_shield');
    }

    this.hp -= dmg;
    this.combatTimer = 0;
    if (source) source.combatTimer = 0;
    this.floatText('-' + dmg, '#ff6b6b');

    // Casse le mez
    EffectSystem.breakMez(this);

    // Interruption de cast (attaques interruptrices, ou tout dégât conséquent sur un caster)
    if (this.casting && this.uninterruptible <= 0) {
      const interrupts = opts.interrupt || dmg > 0; // toute frappe interrompt sauf protections
      if (interrupts) this.cancelCast('INTERRUPT');
    }

    if (this.hp <= 0) this.die(source);
  }

  heal(amount, source) {
    if (this.dead) return;
    amount *= (this.flags.healReceivedMult || 1); // disease réduit
    amount = Math.round(amount);
    this.hp = Math.min(this.maxHp, this.hp + amount);
    this.floatText('+' + amount, '#66d97a');
  }

  die(killer) {
    this.dead = true;
    this.casting = null;
    this.effects = [];
    this.target = null;
    this.moveTarget = null;
    this.respawnTimer = 5;
    this.respawnLoc = this.game.map.nearestRespawn(this.faction, this.x, this.y);
    if (killer && killer.isPlayer) this.game.log(`${killer.def.name} a tué ${this.def.name}`);
    if (this.isPlayer) this.game.log('Vous êtes mort.');
  }

  respawn() {
    const loc = this.game.map.nearestRespawn(this.faction, this.x, this.y)
             || this.game.map.respawnPoints(this.faction)[0]
             || this.game.map.getTerritory('BASE_' + this.faction);
    this.dead = false;
    this.hp = this.maxHp;
    this.mana = this.maxMana;
    this.endurance = this.maxEndurance;
    this.effects = [];
    this.immunities = { mez: 0, root: 0, stun: 0 };
    this.cooldowns = {};
    this.casting = null;
    this.combatTimer = 99;
    this.runes = 0;
    this.x = loc.x + (Math.random() - 0.5) * 100;
    this.y = loc.y + (Math.random() - 0.5) * 100;
    this.moveTarget = null; this.followTarget = null; this.target = null;
  }

  /* ---------- MOUVEMENT ---------- */
  moveUpdate(dt) {
    if (!this.flags.canMove) return;
    let tx = null, ty = null;
    if (this.followTarget && !this.followTarget.dead) { tx = this.followTarget.x; ty = this.followTarget.y; }
    else if (this.moveTarget) { tx = this.moveTarget.x; ty = this.moveTarget.y; }
    if (tx == null) return;

    const dx = tx - this.x, dy = ty - this.y;
    const d = Math.hypot(dx, dy);
    // Le stick joueur colle réellement au personnage suivi. Le follow des bots
    // conserve sa distance tactique historique (mêlée ou portée).
    const stopDist = this.followTarget
      ? (this._stickActive ? this.radius + this.followTarget.radius + 8 : (this.def.attackRange > 200 ? 300 : 42))
      : 6;
    if (d <= stopDist) { if (!this.followTarget) this.moveTarget = null; return; }

    this.facing = Math.atan2(dy, dx);
    const spd = this.baseSpeed * (this.flags.speedMult || 1);
    let nx = this.x + Math.cos(this.facing) * spd * dt;
    let ny = this.y + Math.sin(this.facing) * spd * dt;
    const c = this.game.map.resolveCollision(nx, ny, this.radius);
    this.x = c.x; this.y = c.y;
  }

  /* ---------- AUTO-ATTACK ---------- */
  autoUpdate(dt) {
    const aa = this.def.autoAttack;
    if (!aa) return;
    if (this.autoTimer > 0) this.autoTimer -= dt;
    if (this.flags.mez || this.flags.stun) return;
    if (!this.target || this.target.dead || !this.isEnemy(this.target)) return;
    if (this.distanceTo(this.target) > this.def.attackRange + this.radius + this.target.radius) return;
    if (this.autoTimer > 0) return;

    const interval = aa.interval / (this.flags.attackSpeedMult || 1);
    this.autoTimer = interval;
    let dmg = aa.damage * (this.flags.damageMult || 1);
    // positionnel (Berserker/Rogue passifs)
    if (aa.positional) dmg *= this.positionalMult(this.target);
    if (this.flags.crit) dmg *= 1.6;
    CombatSystem.dealDamage(this, this.target, dmg, { melee: true, interrupt: aa.interrupt });
    // Poison sur auto (Rogue)
    if (this.def.stealthClass) CombatSystem.applyPoison(this, this.target);
  }

  positionalMult(target) {
    // angle entre le "dos" de la cible et l'attaquant
    const toAtt = Math.atan2(this.y - target.y, this.x - target.x);
    let diff = Math.abs(normalizeAngle(toAtt - target.facing));
    // target.facing pointe là où elle regarde ; dos = derrière
    if (diff < Math.PI * 0.33) return 1.30;      // dos
    if (diff < Math.PI * 0.66) return 1.15;      // flanc
    return 1.0;                                   // face
  }

  /* ---------- REGEN ---------- */
  regen(dt) {
    this.combatTimer += dt;
    const inCombat = this.combatTimer < 5;
    if (this.maxMana) this.mana = Math.min(this.maxMana, this.mana + (inCombat ? 4 : 10) * dt);
    if (this.maxEndurance) this.endurance = Math.min(this.maxEndurance, this.endurance + (inCombat ? 6 : 14) * dt);
    if (!inCombat) this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.02 * dt);
  }

  /* ---------- UPDATE PRINCIPAL ---------- */
  update(dt) {
    if (this.dead) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0 && (this.isBot)) this.respawn();
      return;
    }

    // cooldowns
    for (const k in this.cooldowns) if (this.cooldowns[k] > 0) this.cooldowns[k] -= dt;
    if (this.globalCd > 0) this.globalCd -= dt;
    if (this.interruptLock > 0) this.interruptLock -= dt;
    if (this.uninterruptible > 0) this.uninterruptible -= dt;

    EffectSystem.update(this, dt);
    EffectSystem.recompute(this);

    // Dégâts de DoT accumulés
    if (this.pendingDotDamage > 0) {
      const d = this.pendingDotDamage; this.pendingDotDamage = 0;
      this.takeDamage(d, null, { magic: true });
      if (this.dead) return;
    }

    this.updateCast(dt);
    this.autoUpdate(dt);
    this.moveUpdate(dt);
    this.regen(dt);

    // Mage : rune buff visuel (puissance appliquée dans combat)
    // Textes flottants
    for (const f of this.floats) { f.life -= dt; f.y -= 26 * dt; }
    this.floats = this.floats.filter(f => f.life > 0);
  }
}

function normalizeAngle(a) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

window.Entity = Entity;
window.normalizeAngle = normalizeAngle;
