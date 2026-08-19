/* ============================================================
   ui.js — Interface (DOM) : war status, cible, HUD joueur,
   barre de compétences, mini-map, notifications.
   ============================================================ */

const UI = {
  built: false,

  buildSkillbar(player) {
    const bar = document.getElementById('skillbar');
    bar.innerHTML = '';
    this.slots = [];
    const list = [
      ...player.def.skills,
      player.def.realm,
      UNIVERSAL_SKILLS.sprint,
      UNIVERSAL_SKILLS.purge,
    ];
    for (const s of list) {
      const el = document.createElement('div');
      el.className = 'skill-slot';
      el.innerHTML = `<span class="key">${s.key}</span>
        <span class="s-icon">${s.icon}</span>
        <span class="s-name">${s.name}</span>
        <span class="cd hidden"></span>`;
      el.title = (s.desc || s.name);
      bar.appendChild(el);
      this.slots.push({ el, skill: s });
    }
    this.built = true;
  },

  notify(text, color) {
    const box = document.getElementById('notifications');
    const el = document.createElement('div');
    el.className = 'notif';
    el.style.borderLeftColor = color || '#fff';
    el.textContent = text;
    box.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  },

  log(text) {
    const box = document.getElementById('combat-log');
    const el = document.createElement('div');
    el.textContent = text;
    box.appendChild(el);
    while (box.children.length > 12) box.removeChild(box.firstChild);
    setTimeout(() => el.remove(), 6000);
  },

  bar(cls, ratio, text) {
    return `<div class="bar ${cls}"><span style="width:${Math.max(0, Math.min(100, ratio * 100))}%"></span><span class="bar-txt">${text}</span></div>`;
  },

  update(game) {
    const p = game.player;

    /* War status */
    const pct = game.map.controlPercentages();
    const ws = document.getElementById('war-status');
    ws.innerHTML = `<div class="war-title">⚔ GUERRE EN COURS ⚔</div>` +
      FACTION_IDS.map(f => {
        const F = FACTIONS[f];
        return `<div class="war-row"><span class="lbl" style="color:${F.color}">${F.name}</span>
          <span class="war-bar"><span style="width:${pct[f]}%;background:${F.color}"></span></span>
          <span class="pct">${pct[f]}%</span></div>`;
      }).join('');

    /* Player stats */
    const ps = document.getElementById('player-stats');
    const F = FACTIONS[p.faction];
    let resBar = '';
    if (p.maxMana) resBar = this.bar('mana', p.mana / p.maxMana, `Mana ${Math.round(p.mana)}`);
    else resBar = this.bar('endu', p.endurance / p.maxEndurance, `End. ${Math.round(p.endurance)}`);
    let castBar = '';
    if (p.casting) castBar = `<div class="p-cast">${this.bar('cast', 1 - p.casting.remaining / p.casting.total, p.casting.skill.name + '…')}</div>`;
    let runeStr = p.def.runes ? ` • Runes ${p.runes}/3` : '';
    let poisonStr = p.def.stealthClass ? ` • Poison: ${POISONS[p.currentPoison].name}` : '';
    ps.innerHTML =
      `<div class="p-head"><b style="color:${F.color}">${p.def.icon} ${p.def.name}</b>
        <span>${F.name}${runeStr}${poisonStr}${p.isStealthed ? ' • 🕶 STEALTH' : ''}</span></div>` +
      this.bar('hp', p.hp / p.maxHp, `HP ${Math.max(0, Math.round(p.hp))}/${p.maxHp}`) +
      resBar + castBar;

    /* Target panel */
    const tp = document.getElementById('target-panel');
    const t = p.target;
    if (t && !t.dead) {
      tp.classList.remove('hidden');
      const tf = FACTIONS[t.faction];
      const chips = EffectSystem.statusChips(t).map(c => `<span class="chip ${c.cls}">${c.label}</span>`).join('');
      let tcast = t.casting ? this.bar('cast', 1 - t.casting.remaining / t.casting.total, t.casting.skill.name + '…') : '';
      tp.innerHTML =
        `<div class="t-name" style="color:${tf.color}">${t.def.icon} ${t.def.name}</div>
         <div class="t-sub">${t.def.role} — ${tf.name}</div>` +
        this.bar('hp', t.hp / t.maxHp, `HP ${Math.max(0, Math.round(t.hp))}/${t.maxHp}`) +
        tcast +
        `<div class="status-icons">${chips}</div>`;
    } else {
      tp.classList.add('hidden');
    }

    /* Skillbar cooldowns */
    if (this.built) {
      for (const slot of this.slots) {
        const s = slot.skill;
        const cd = (p.cooldowns[s.id] || 0);
        const cdEl = slot.el.querySelector('.cd');
        slot.el.classList.remove('ready', 'oncd', 'nomana');
        if (cd > 0) {
          slot.el.classList.add('oncd');
          cdEl.classList.remove('hidden');
          cdEl.textContent = cd > 1 ? Math.ceil(cd) : cd.toFixed(1);
        } else if (!p.canAfford(s)) {
          slot.el.classList.add('nomana');
          cdEl.classList.add('hidden');
        } else {
          slot.el.classList.add('ready');
          cdEl.classList.add('hidden');
        }
      }
    }

    /* Respawn overlay */
    const ro = document.getElementById('respawn-overlay');
    if (p.dead) {
      ro.classList.remove('hidden');
      document.getElementById('respawn-timer').textContent = Math.ceil(p.respawnTimer);
      const loc = p.respawnLoc || game.map.nearestRespawn(p.faction, p.x, p.y);
      document.getElementById('respawn-loc').textContent = loc ? ('Respawn : ' + loc.name) : '';
    } else {
      ro.classList.add('hidden');
    }

    this.drawMinimap(game);
  },

  drawMinimap(game) {
    const cv = document.getElementById('minimap');
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    const sx = W / WORLD.w, sy = H / WORLD.h;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0a0d14'; ctx.fillRect(0, 0, W, H);

    // obstacles
    ctx.fillStyle = '#2a3040';
    for (const o of game.map.obstacles) ctx.fillRect(o.x * sx, o.y * sy, o.w * sx, o.h * sy);

    // liens du graphe
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
    for (const t of game.map.territories) {
      for (const nid of t.neighbors) {
        const n = game.map.byId[nid];
        if (!n) continue;
        ctx.beginPath(); ctx.moveTo(t.x * sx, t.y * sy); ctx.lineTo(n.x * sx, n.y * sy); ctx.stroke();
      }
    }

    // territoires
    for (const t of game.map.territories) {
      const col = t.owner ? FACTIONS[t.owner].color : '#7a7a7a';
      ctx.fillStyle = col;
      const r = t.base ? 6 : (t.value > 1 ? 6 : 4);
      ctx.beginPath(); ctx.arc(t.x * sx, t.y * sy, r, 0, 7); ctx.fill();
      if (t.captureBy) {
        ctx.strokeStyle = FACTIONS[t.captureBy].color; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(t.x * sx, t.y * sy, r + 3, -1.57, -1.57 + t.capture * 6.28); ctx.stroke();
      }
    }

    // alliés visibles + ennemis détectés
    const p = game.player;
    for (const e of game.entities) {
      if (e.dead) continue;
      const ally = e.faction === p.faction;
      if (!ally && !game.isVisibleToPlayer(e)) continue;
      ctx.fillStyle = FACTIONS[e.faction].color;
      ctx.beginPath(); ctx.arc(e.x * sx, e.y * sy, ally ? 1.6 : 2, 0, 7); ctx.fill();
    }

    // joueur
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(p.x * sx, p.y * sy, 3, 0, 7); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
  },
};

window.UI = UI;
