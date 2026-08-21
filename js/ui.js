/* ============================================================
   ui.js — Interface (DOM) : cible,
   barre de compétences et notifications.
   ============================================================ */

const UI = {
  built: false,

  buildSkillbar(player) {
    const bar = document.getElementById('skillbar');
    bar.innerHTML = '';
    this.slots = [];
    const list = [
      ...player.def.skills.slice(0, 4),
      player.def.realm,
    ].filter(Boolean);
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

  update(game) {
    const p = game.player;

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
  },
};

window.UI = UI;
