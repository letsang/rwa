/* ============================================================
   bots.js — IA des bots (3 factions)
   Objectifs territoriaux + combat cohérent par rôle.
   IA volontairement simple : rendre la guerre vivante.
   ============================================================ */

const BotAI = {

  update(bot, game, dt) {
    if (bot.dead) return;

    bot.aiTimer = (bot.aiTimer || 0) - dt;
    if (bot.aiTimer <= 0) {
      bot.aiTimer = 1.0 + Math.random();
      this.think(bot, game);
    }

    // Combat continu (chaque frame, léger)
    this.combat(bot, game);
  },

  /* Décision de haut niveau : objectif + cible. */
  think(bot, game) {
    const map = game.map;

    // 1a) Défense prioritaire : un territoire allié proche est menacé ?
    let defend = null, defendScore = 0;
    for (const t of map.territories) {
      if (t.owner !== bot.faction) continue;
      const enemyPres = FACTION_IDS.reduce((s, f) => f !== bot.faction ? s + t.presence[f] : s, 0);
      if (enemyPres <= 0) continue;
      const d = Math.hypot(t.x - bot.x, t.y - bot.y);
      const score = 100 + enemyPres * 10 - d / 100;
      if (score > defendScore) { defendScore = score; defend = t; }
    }

    if (defend && Math.hypot(defend.x - bot.x, defend.y - bot.y) < 900) {
      bot.objective = defend;
    } else {
      // 1b) Sinon : suivre le "focus" de faction (push coordonné) avec un peu de dispersion
      const focus = game.factionFocus[bot.faction];
      // ~18% des bots choisissent un objectif local différent -> plusieurs fronts (anti-zerg)
      // mais assez de concentration pour réellement prendre un point.
      if (focus && Math.random() > 0.18) {
        bot.objective = focus;
      } else {
        // cible attaquable la plus proche
        let best = null, bestScore = -Infinity;
        for (const t of map.territories) {
          if (t.base || t.owner === bot.faction) continue;
          if (!map.factionOwnsAdjacent(t, bot.faction)) continue;
          const enemyPres = FACTION_IDS.reduce((s, f) => f !== bot.faction ? s + t.presence[f] : s, 0);
          let score = t.value * 8 - enemyPres * 3 - Math.hypot(t.x - bot.x, t.y - bot.y) / 130 + Math.random() * 8;
          if (score > bestScore) { bestScore = score; best = t; }
        }
        bot.objective = best || game.factionFocus[bot.faction];
      }
    }

    // 2) Cible ennemie
    this.acquireTarget(bot, game);
  },

  acquireTarget(bot, game) {
    const aggro = bot.def.attackRange > 200 ? 720 : 340;
    let best = null, bestScore = -Infinity;
    for (const e of game.entities) {
      if (e.dead || e.faction === bot.faction) continue;
      // stealth : bots détectent moins bien
      if (e.isStealthed && bot.distanceTo(e) > 90 && !bot.def.detectStealth) continue;
      const d = bot.distanceTo(e);
      if (d > aggro) continue;
      let s = 400 - d * 0.3;
      s += (1 - e.hp / e.maxHp) * 200;          // finir les blessés
      // assassins/mages ciblent les casters
      if (['ROGUE', 'BERSERKER', 'RANGER'].includes(bot.classId) && MAGIC_CLASSES.includes(e.classId)) s += 220;
      if (e.casting) s += 120;                    // interrompre
      if (s > bestScore) { bestScore = s; best = e; }
    }
    bot.target = best;
  },

  combat(bot, game) {
    const t = bot.target;
    // Cible invalide ?
    if (t && (t.dead || t.faction === bot.faction || bot.distanceTo(t) > 900)) bot.target = null;

    const melee = bot.def.attackRange <= 60;

    // Mouvement
    if (bot.target) {
      const d = bot.distanceTo(bot.target);
      if (melee) {
        bot.followTarget = bot.target; bot.moveTarget = null;
      } else {
        // caster/archer : garder ses distances
        const ideal = bot.def.attackRange * 0.75;
        bot.followTarget = null;
        if (d < ideal * 0.6) {
          // kite : s'éloigner
          const ang = Math.atan2(bot.y - bot.target.y, bot.x - bot.target.x);
          bot.moveTarget = { x: bot.x + Math.cos(ang) * 120, y: bot.y + Math.sin(ang) * 120 };
        } else if (d > bot.def.attackRange) {
          bot.moveTarget = { x: bot.target.x, y: bot.target.y };
        } else {
          bot.moveTarget = null;
        }
      }
    } else if (bot.objective) {
      bot.followTarget = null;
      const distObj = Math.hypot(bot.objective.x - bot.x, bot.objective.y - bot.y);
      // Tenir le point : si proche, se placer bien à l'intérieur de la zone de capture.
      if (distObj < CAPTURE_RADIUS * 1.3) {
        if (!bot.moveTarget || Math.hypot(bot.moveTarget.x - bot.objective.x, bot.moveTarget.y - bot.objective.y) > 80) {
          bot.moveTarget = { x: bot.objective.x + (Math.random() - 0.5) * 80, y: bot.objective.y + (Math.random() - 0.5) * 80 };
        }
      } else if (!bot.moveTarget || Math.hypot(bot.moveTarget.x - bot.objective.x, bot.moveTarget.y - bot.objective.y) > 260) {
        bot.moveTarget = { x: bot.objective.x + (Math.random() - 0.5) * 160, y: bot.objective.y + (Math.random() - 0.5) * 160 };
      }
    }

    // Compétences
    this.useSkills(bot, game);
  },

  /* Utilise les compétences selon le rôle. */
  useSkills(bot, game) {
    if (bot.casting || bot.globalCd > 0) return;
    const skills = bot.def.skills;
    const t = bot.target;

    // Purge si sous CC dur et disponible
    if ((bot.flags.mez || bot.flags.stun || bot.flags.root) && !bot.onCooldownUniv) {
      // rare : bots gardent purge pour les urgences
    }

    // CLERIC : soigner
    if (bot.classId === 'CLERIC') {
      const ally = this.lowestAlly(bot, game, 450);
      if (ally && ally.hp / ally.maxHp < 0.75) {
        const gh = skills.find(s => s.id === 'greater_heal');
        const ih = skills.find(s => s.id === 'instant_heal');
        if (ally.hp / ally.maxHp < 0.4 && !bot.onCooldown(ih)) { bot.tryCast(ih, ally); return; }
        if (!bot.onCooldown(gh)) { bot.tryCast(gh, ally); return; }
      }
      // cure debuff
      const cure = skills.find(s => s.id === 'cure');
      const diseased = this.alliesNear(bot, game, 400).find(a => a.hasEffect('disease') || a.hasEffect('dot'));
      if (diseased && !bot.onCooldown(cure)) { bot.tryCast(cure, diseased); return; }
    }

    // GUARDIAN : garder un caster allié, stun/interrupt ennemis
    if (bot.classId === 'GUARDIAN') {
      if (!bot.guardTarget || bot.guardTarget.dead) {
        const caster = this.alliesNear(bot, game, 500).find(a => MAGIC_CLASSES.includes(a.classId));
        if (caster) bot.tryCast(skills.find(s => s.id === 'guard'), caster);
      }
      if (t) {
        const bash = skills.find(s => s.id === 'shield_bash');
        if (t.casting && !bot.onCooldown(bash) && bot.distanceTo(t) < 60) { bot.tryCast(bash, t); return; }
        const slam = skills.find(s => s.id === 'shield_slam');
        if (!bot.onCooldown(slam) && bot.distanceTo(t) < 60) { bot.tryCast(slam, t); return; }
      }
    }

    // SORCERER : mez de masse sur clusters, mez/root single
    if (bot.classId === 'SORCERER') {
      const cluster = this.enemyCluster(bot, game, 400, 180);
      const mass = skills.find(s => s.id === 'mass_mez');
      if (cluster && cluster.count >= 3 && !bot.onCooldown(mass)) { bot.tryCast(mass, null, cluster.x, cluster.y); return; }
      if (t && !t.flags.mez && !t.hasEffect('mez')) {
        const mez = skills.find(s => s.id === 'mesmerize');
        if (!bot.onCooldown(mez)) { bot.tryCast(mez, t); return; }
        const root = skills.find(s => s.id === 'root');
        if (!bot.onCooldown(root)) { bot.tryCast(root, t); return; }
      }
    }

    // MAGE : artillerie
    if (bot.classId === 'MAGE' && t) {
      const cluster = this.enemyCluster(bot, game, 500, 150);
      const storm = skills.find(s => s.id === 'rune_storm');
      if (cluster && cluster.count >= 3 && !bot.onCooldown(storm)) { bot.tryCast(storm, null, cluster.x, cluster.y); return; }
      const bolt = skills.find(s => s.id === 'rune_bolt');
      const blast = skills.find(s => s.id === 'rune_blast');
      if (!bot.onCooldown(bolt)) { bot.tryCast(bolt, t); return; }
      if (!bot.onCooldown(blast)) { bot.tryCast(blast, t); return; }
    }

    // BERSERKER : backslash / hamstring / charge
    if (bot.classId === 'BERSERKER' && t) {
      if (bot.distanceTo(t) > 200) { const ch = skills.find(s => s.id === 'charge'); if (!bot.onCooldown(ch)) bot.tryCast(ch); }
      const back = skills.find(s => s.id === 'backslash');
      if (!bot.onCooldown(back) && bot.positionalMult(t) > 1.25 && bot.distanceTo(t) < 60) { bot.tryCast(back, t); return; }
      const ham = skills.find(s => s.id === 'hamstring');
      if (!bot.onCooldown(ham) && bot.distanceTo(t) < 60) { bot.tryCast(ham, t); return; }
    }

    // SKALD : war mez / battle cry (interrupt) / snare
    if (bot.classId === 'SKALD' && t) {
      const cry = skills.find(s => s.id === 'battle_cry');
      if (t.casting && !bot.onCooldown(cry) && bot.distanceTo(t) < 340) { bot.tryCast(cry, t); return; }
      const wm = skills.find(s => s.id === 'war_mez');
      if (!bot.onCooldown(wm) && !t.hasEffect('mez') && bot.distanceTo(t) < 300) { bot.tryCast(wm, t); return; }
      const cs = skills.find(s => s.id === 'crippling_song');
      if (!bot.onCooldown(cs) && bot.distanceTo(t) < 340) { bot.tryCast(cs, t); return; }
    }

    // RANGER : long shot / rapid shot pour interrompre
    if (bot.classId === 'RANGER' && t) {
      const rapid = skills.find(s => s.id === 'rapid_shot');
      if (t.casting && !bot.onCooldown(rapid)) { bot.tryCast(rapid, t); return; }
      const long = skills.find(s => s.id === 'long_shot');
      if (!bot.onCooldown(long) && bot.distanceTo(t) < 600) { bot.tryCast(long, t); return; }
      if (!bot.onCooldown(rapid)) { bot.tryCast(rapid, t); return; }
    }

    // ROGUE : approcher casters isolés, backstab
    if (bot.classId === 'ROGUE' && t) {
      const step = skills.find(s => s.id === 'shadowstep');
      if (bot.distanceTo(t) > 120 && bot.distanceTo(t) < 340 && !bot.onCooldown(step)) { bot.tryCast(step, t); return; }
      const bs = skills.find(s => s.id === 'backstab');
      if (!bot.onCooldown(bs) && bot.distanceTo(t) < 55) { bot.tryCast(bs, t); return; }
    }
  },

  /* ---- Helpers ---- */
  alliesNear(bot, game, r) {
    return game.entities.filter(e => !e.dead && e.faction === bot.faction && e !== bot && bot.distanceTo(e) <= r);
  },
  lowestAlly(bot, game, r) {
    let best = bot.hp / bot.maxHp < 0.75 ? bot : null;
    let bv = best ? bot.hp / bot.maxHp : 1;
    for (const e of this.alliesNear(bot, game, r)) {
      const v = e.hp / e.maxHp;
      if (v < bv) { bv = v; best = e; }
    }
    return best;
  },
  enemyCluster(bot, game, range, radius) {
    let best = null, bestCount = 0;
    for (const e of game.entities) {
      if (e.dead || e.faction === bot.faction) continue;
      if (bot.distanceTo(e) > range) continue;
      let count = 0;
      for (const o of game.entities) {
        if (o.dead || o.faction === bot.faction) continue;
        if (Math.hypot(o.x - e.x, o.y - e.y) <= radius) count++;
      }
      if (count > bestCount) { bestCount = count; best = { x: e.x, y: e.y, count }; }
    }
    return best;
  },
};

window.BotAI = BotAI;
