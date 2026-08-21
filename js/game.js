/* ============================================================
   game.js — Orchestrateur : menu, monde, boucle, rendu, input
   ============================================================ */

class Game {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.map = new GameMap();
    this.entities = [];
    this.groundEffects = [];
    this.hitFx = [];
    this.camera = { x: 0, y: 0 };
    this.mouse = { x: 0, y: 0 };          // écran
    this.mouseWorld = { x: 0, y: 0 };
    this.player = null;
    this.running = false;
    this.lastTs = 0;
    this.factionFocus = {};   // objectif d'attaque prioritaire par faction (coordination légère)
    this.focusTimer = 0;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  log(t) { UI.log(t); }

  /* -------------------- SETUP MENU -------------------- */
  setupMenu() {
    const fsel = document.getElementById('faction-select');
    const csel = document.getElementById('class-select');
    let chosenFaction = null, chosenClass = null;
    const startBtn = document.getElementById('start-btn');
    const check = () => startBtn.disabled = !(chosenFaction && chosenClass);

    FACTION_IDS.forEach(fid => {
      const F = FACTIONS[fid];
      const el = document.createElement('div');
      el.className = 'choice';
      el.style.borderColor = F.color;
      el.innerHTML = `<span class="icon" style="color:${F.color}">●</span>
        <span class="name">${F.name}</span>`;
      el.onclick = () => {
        [...fsel.children].forEach(c => c.classList.remove('selected'));
        el.classList.add('selected'); chosenFaction = fid; check();
      };
      fsel.appendChild(el);
    });

    CLASS_IDS.forEach(cid => {
      const C = CLASSES[cid];
      const el = document.createElement('div');
      el.className = 'choice';
      el.innerHTML = `<span class="icon">${C.icon}</span>
        <span class="name">${C.name}</span>
        <span class="role">${C.role}</span>`;
      el.onclick = () => {
        [...csel.children].forEach(c => c.classList.remove('selected'));
        el.classList.add('selected'); chosenClass = cid; check();
      };
      csel.appendChild(el);
    });

    startBtn.onclick = () => {
      if (!chosenFaction || !chosenClass) return;
      document.getElementById('menu').classList.add('hidden');
      document.getElementById('game-root').classList.remove('hidden');
      this.resize();
      this.start(chosenFaction, chosenClass);
    };
  }

  /* -------------------- START -------------------- */
  start(faction, classId) {
    this.player = new Entity(this, faction, classId, true);
    this.entities.push(this.player);

    // Bots : peupler les 3 factions
    const perFaction = 9;
    for (const f of FACTION_IDS) {
      for (let i = 0; i < perFaction; i++) {
        const cls = CLASS_IDS[Math.floor(Math.random() * CLASS_IDS.length)];
        this.entities.push(new Entity(this, f, cls));
      }
    }

    UI.buildSkillbar(this.player);
    this.bindInput();
    this.running = true;
    requestAnimationFrame(ts => this.loop(ts));
    UI.notify('La guerre fait rage. Bonne chance !', '#fff');
  }

  /* -------------------- INPUT -------------------- */
  bindInput() {
    const cv = this.canvas;
    cv.addEventListener('contextmenu', e => e.preventDefault());

    cv.addEventListener('mousemove', e => {
      const r = cv.getBoundingClientRect();
      this.mouse.x = e.clientX - r.left; this.mouse.y = e.clientY - r.top;
      this.updateMouseWorld();
    });

    cv.addEventListener('mousedown', e => {
      this.updateMouseWorld();
      if (this.player.dead) return;
      if (e.button === 0) {
        // clic gauche : sélectionner un ennemi visible sous le curseur, sinon se déplacer
        const ent = this.entityAtWorld(this.mouseWorld.x, this.mouseWorld.y);
        if (ent && this.isEnemyVisible(ent)) {
          this.player.target = ent;
        } else {
          this.player.moveTarget = { x: this.mouseWorld.x, y: this.mouseWorld.y };
        }
      } else if (e.button === 2) {
        this.player.moveTarget = { x: this.mouseWorld.x, y: this.mouseWorld.y };
      }
    });

    window.addEventListener('keydown', e => {
      if (this.player.dead) return;
      const k = e.key.toLowerCase();
      if (e.key === 'Tab') { e.preventDefault(); this.cycleTarget(); return; }
      const p = this.player;
      const map = {
        '1': p.def.skills[0], '2': p.def.skills[1], '3': p.def.skills[2], '4': p.def.skills[3],
        'r': p.def.realm, 'q': UNIVERSAL_SKILLS.sprint,
      };
      const skill = map[k];
      if (skill) { e.preventDefault(); this.castPlayerSkill(skill); }
    });
  }

  castPlayerSkill(skill) {
    const p = this.player;
    if (skill.targetType === 'enemy') {
      p.tryCast(skill, p.target);
    } else if (skill.targetType === 'ally') {
      // allié sous le curseur, sinon soi
      const ally = this.allyAtWorld(this.mouseWorld.x, this.mouseWorld.y) || p;
      p.tryCast(skill, ally);
    } else if (skill.targetType === 'ground') {
      p.tryCast(skill, null, this.mouseWorld.x, this.mouseWorld.y);
    } else {
      p.tryCast(skill, p);
    }
  }

  cycleTarget() {
    const enemies = this.entities
      .filter(e => !e.dead && e.faction !== this.player.faction && this.isEnemyVisible(e))
      .sort((a, b) => this.player.distanceTo(a) - this.player.distanceTo(b));
    if (!enemies.length) return;
    const cur = enemies.indexOf(this.player.target);
    this.player.target = enemies[(cur + 1) % enemies.length];
  }

  updateMouseWorld() {
    this.mouseWorld.x = this.mouse.x + this.camera.x;
    this.mouseWorld.y = this.mouse.y + this.camera.y;
  }

  entityAtWorld(x, y) {
    let best = null, bd = 30 * 30;
    for (const e of this.entities) {
      if (e.dead) continue;
      const d = (e.x - x) ** 2 + (e.y - y) ** 2;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  allyAtWorld(x, y) {
    let best = null, bd = 34 * 34;
    for (const e of this.entities) {
      if (e.dead || e.faction !== this.player.faction) continue;
      const d = (e.x - x) ** 2 + (e.y - y) ** 2;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  /* -------------------- VISIBILITÉ / STEALTH -------------------- */
  nearestSeerDist(e) {
    // distance min entre e et (joueur + alliés du joueur)
    let best = this.player.distanceTo(e);
    let rangerNear = this.player.def.detectStealth ? best : Infinity;
    for (const a of this.entities) {
      if (a.dead || a.faction !== this.player.faction) continue;
      const d = a.distanceTo(e);
      if (d < best) best = d;
      if (a.def.detectStealth) rangerNear = Math.min(rangerNear, d);
    }
    return { best, rangerNear };
  }

  isEnemyVisible(e) {
    if (e.faction === this.player.faction) return true;
    const { best, rangerNear } = this.nearestSeerDist(e);
    if (e.isStealthed) {
      // révélation progressive ; ranger détecte de plus loin
      if (best < 130) return true;
      if (rangerNear < 260) return true;
      return false;
    }
    if (e.isCamouflaged) return best < 320 || rangerNear < 480;
    return best < 720; // vision normale (fog léger)
  }
  isVisibleToPlayer(e) { return this.isEnemyVisible(e); }

  /* -------------------- GROUND EFFECTS / FX -------------------- */
  spawnGroundEffect(cfg) {
    this.groundEffects.push(Object.assign({ timer: 0, ticksDone: 0 }, cfg));
  }
  spawnHitFx(x, y, magic) { this.hitFx.push({ x, y, life: 0.22, magic }); }

  updateGroundEffects(dt) {
    for (const g of this.groundEffects) {
      g.timer -= dt;
      if (g.timer <= 0 && g.ticksDone < g.ticks) {
        g.timer = g.interval;
        g.ticksDone++;
        const targets = CombatSystem.gatherAoe(g.caster, g.x, g.y, g.radius,
          g.cap, true);
        for (const t of targets) CombatSystem.dealDamage(g.caster, t, g.damage, { magic: false });
      }
    }
    this.groundEffects = this.groundEffects.filter(g => g.ticksDone < g.ticks);
    for (const h of this.hitFx) h.life -= dt;
    this.hitFx = this.hitFx.filter(h => h.life > 0);
  }

  /* Objectif d'attaque prioritaire de chaque faction (met des "pushes" en place,
     tout en laissant plusieurs fronts actifs pour éviter le zerg unique). */
  recomputeFocus() {
    for (const f of FACTION_IDS) {
      let best = null, bestScore = -Infinity;
      for (const t of this.map.territories) {
        if (t.base || t.owner === f) continue;
        if (!this.map.factionOwnsAdjacent(t, f)) continue;
        const enemyDef = FACTION_IDS.reduce((s, o) => o !== f ? s + t.presence[o] : s, 0);
        // valorise les cibles fortes et peu défendues, proche du barycentre de la faction
        let score = t.value * 10 - enemyDef * 2 + Math.random() * 4;
        if (score > bestScore) { bestScore = score; best = t; }
      }
      this.factionFocus[f] = best;
    }
  }

  /* -------------------- UPDATE -------------------- */
  update(dt) {
    this.focusTimer -= dt;
    if (this.focusTimer <= 0) { this.focusTimer = 3; this.recomputeFocus(); }
    // IA + logique entités
    for (const e of this.entities) {
      if (e !== this.player && !e.dead) BotAI.update(e, this, dt);
    }
    for (const e of this.entities) e.update(dt);

    // respawn auto du joueur
    if (this.player.dead && this.player.respawnTimer <= 0) this.player.respawn();

    // Capture / contrôle territorial
    this.map.update(dt, this.entities, (t, prev, now) => {
      const F = FACTIONS[now].name;
      UI.notify(`${t.name} capturé par ${F} !`, FACTIONS[now].color);
      UI.log(`${t.name} : ${prev ? FACTIONS[prev].short : 'Neutre'} → ${FACTIONS[now].short}`);
    });

    this.updateGroundEffects(dt);

    // caméra suit le joueur
    const cx = this.player.x - this.canvas.width / 2;
    const cy = this.player.y - this.canvas.height / 2;
    this.camera.x = Math.max(0, Math.min(WORLD.w - this.canvas.width, cx));
    this.camera.y = Math.max(0, Math.min(WORLD.h - this.canvas.height, cy));
    if (WORLD.w < this.canvas.width) this.camera.x = (WORLD.w - this.canvas.width) / 2;
    if (WORLD.h < this.canvas.height) this.camera.y = (WORLD.h - this.canvas.height) / 2;
    this.updateMouseWorld();
  }

  /* -------------------- RENDER -------------------- */
  render() {
    const ctx = this.ctx, cam = this.camera;
    const W = this.canvas.width, H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);

    // sol
    ctx.fillStyle = '#151b26';
    ctx.fillRect(0, 0, W, H);
    this.drawGrid(ctx);

    ctx.save();
    ctx.translate(-cam.x, -cam.y);

    // liens du graphe
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 3;
    for (const t of this.map.territories) {
      for (const nid of t.neighbors) {
        const n = this.map.byId[nid]; if (!n) continue;
        ctx.beginPath(); ctx.moveTo(t.x, t.y); ctx.lineTo(n.x, n.y); ctx.stroke();
      }
    }

    // territoires (zones de capture)
    for (const t of this.map.territories) this.drawTerritory(ctx, t);

    // obstacles
    ctx.fillStyle = '#39435a';
    ctx.strokeStyle = '#4c5a78'; ctx.lineWidth = 2;
    for (const o of this.map.obstacles) { ctx.fillRect(o.x, o.y, o.w, o.h); ctx.strokeRect(o.x, o.y, o.w, o.h); }

    // ground effects (volley)
    for (const g of this.groundEffects) {
      ctx.fillStyle = 'rgba(217,79,79,0.16)';
      ctx.strokeStyle = 'rgba(217,79,79,0.6)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(g.x, g.y, g.radius, 0, 7); ctx.fill(); ctx.stroke();
    }

    // entités
    for (const e of this.entities) {
      if (e.dead) continue;
      const ally = e.faction === this.player.faction;
      if (!ally && !this.isEnemyVisible(e)) continue;
      this.drawEntity(ctx, e, ally);
    }

    // hit fx
    for (const h of this.hitFx) {
      const a = h.life / 0.22;
      ctx.strokeStyle = h.magic ? `rgba(150,120,255,${a})` : `rgba(255,220,120,${a})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(h.x, h.y, (1 - a) * 22 + 6, 0, 7); ctx.stroke();
    }

    // indicateur de déplacement
    if (this.player.moveTarget && !this.player.dead) {
      const m = this.player.moveTarget;
      ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(m.x, m.y, 8, 0, 7); ctx.stroke();
    }

    ctx.restore();

    // curseur portée (pour skills ground) — léger cercle sous la souris
    UI.update(this);
  }

  drawGrid(ctx) {
    const cam = this.camera, W = this.canvas.width, H = this.canvas.height;
    ctx.strokeStyle = 'rgba(255,255,255,0.03)'; ctx.lineWidth = 1;
    const step = 200;
    const startX = -((cam.x) % step);
    const startY = -((cam.y) % step);
    for (let x = startX; x < W; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = startY; y < H; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  }

  drawTerritory(ctx, t) {
    const col = t.owner ? FACTIONS[t.owner].color : '#7a7a7a';
    // zone de capture
    ctx.fillStyle = this.hexA(col, 0.10);
    ctx.beginPath(); ctx.arc(t.x, t.y, CAPTURE_RADIUS, 0, 7); ctx.fill();
    ctx.strokeStyle = this.hexA(col, 0.5); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(t.x, t.y, CAPTURE_RADIUS, 0, 7); ctx.stroke();

    // marqueur central
    const R = t.base ? 34 : (t.value > 1 ? 30 : 22);
    ctx.fillStyle = col;
    ctx.beginPath();
    if (t.base) { ctx.rect(t.x - R, t.y - R, R * 2, R * 2); }
    else { ctx.arc(t.x, t.y, R, 0, 7); }
    ctx.fill();
    ctx.strokeStyle = '#0009'; ctx.lineWidth = 3; ctx.stroke();

    // barre de capture en cours
    if (t.captureBy) {
      ctx.strokeStyle = FACTIONS[t.captureBy].color; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(t.x, t.y, R + 8, -1.57, -1.57 + t.capture * 6.28); ctx.stroke();
    }

    // label
    ctx.fillStyle = '#e8ecf4'; ctx.font = 'bold 13px "Myriad Pro"'; ctx.textAlign = 'center';
    ctx.fillText((t.base ? '★ ' : '') + t.name, t.x, t.y - R - 8);
    ctx.font = '11px "Myriad Pro"';
    ctx.fillStyle = '#c8d2e6';
    ctx.fillText(t.owner ? FACTIONS[t.owner].short : 'NEUTRE', t.x, t.y + 4);
  }

  drawEntity(ctx, e, ally) {
    const F = FACTIONS[e.faction];
    const stealthed = e.isStealthed || (e.isCamouflaged);
    ctx.save();
    if (stealthed) ctx.globalAlpha = ally ? 0.55 : 0.6;

    // corps
    ctx.beginPath(); ctx.arc(e.x, e.y, e.radius, 0, 7);
    ctx.fillStyle = ally ? F.color : this.darken(F.color);
    ctx.fill();
    ctx.lineWidth = e === this.player ? 3 : 2;
    ctx.strokeStyle = e === this.player ? '#fff' : '#0008';
    ctx.stroke();

    // direction (facing)
    ctx.strokeStyle = '#fff9'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(e.x, e.y);
    ctx.lineTo(e.x + Math.cos(e.facing) * (e.radius + 8), e.y + Math.sin(e.facing) * (e.radius + 8));
    ctx.stroke();

    // icône de classe
    ctx.globalAlpha = 1;
    ctx.font = '16px "Myriad Pro"'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(e.def.icon, e.x, e.y);

    // anneau CC
    let ring = null;
    if (e.flags.mez) ring = '#b98ae6';
    else if (e.flags.stun) ring = '#e6e04f';
    else if (e.flags.root) ring = '#7fd9a0';
    else if (e.hasEffect('snare')) ring = '#9ec2e6';
    if (ring) { ctx.strokeStyle = ring; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(e.x, e.y, e.radius + 5, 0, 7); ctx.stroke(); }

    // sélection (cible du joueur)
    if (e === this.player.target) {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.radius + 9, 0, 7); ctx.stroke();
    }
    // guard target du joueur
    if (this.player.guardTarget === e && ally) {
      ctx.strokeStyle = '#7fd9a0'; ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.arc(e.x, e.y, e.radius + 11, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    }

    // barre de vie
    const bw = 34, bh = 5, bx = e.x - bw / 2, by = e.y - e.radius - 12;
    ctx.fillStyle = '#000a'; ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
    ctx.fillStyle = e.hp / e.maxHp > 0.4 ? '#4fbf6a' : '#d94f4f';
    ctx.fillRect(bx, by, bw * Math.max(0, e.hp / e.maxHp), bh);

    // barre de cast
    if (e.casting) {
      const cy2 = by - 7;
      ctx.fillStyle = '#000a'; ctx.fillRect(bx - 1, cy2 - 1, bw + 2, 5);
      ctx.fillStyle = '#e6d27a';
      ctx.fillRect(bx, cy2, bw * (1 - e.casting.remaining / e.casting.total), 4);
    }

    // nom (joueur / cible)
    if (e === this.player || e === this.player.target) {
      ctx.fillStyle = '#fff'; ctx.font = '10px "Myriad Pro"';
      ctx.fillText(e.def.name, e.x, by - (e.casting ? 14 : 8));
    }

    // textes flottants
    ctx.font = 'bold 13px "Myriad Pro"';
    for (const f of e.floats) {
      ctx.globalAlpha = Math.max(0, f.life);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, e.x, e.y - e.radius - 20 + f.y);
    }
    ctx.restore();
  }

  /* -------------------- HELPERS COULEUR -------------------- */
  hexA(hex, a) {
    const c = hex.replace('#', '');
    const r = parseInt(c.substr(0, 2), 16), g = parseInt(c.substr(2, 2), 16), b = parseInt(c.substr(4, 2), 16);
    return `rgba(${r},${g},${b},${a})`;
  }
  darken(hex) {
    const c = hex.replace('#', '');
    let r = parseInt(c.substr(0, 2), 16), g = parseInt(c.substr(2, 2), 16), b = parseInt(c.substr(4, 2), 16);
    r = Math.round(r * 0.6); g = Math.round(g * 0.6); b = Math.round(b * 0.6);
    return `rgb(${r},${g},${b})`;
  }

  /* -------------------- BOUCLE -------------------- */
  loop(ts) {
    if (!this.running) return;
    let dt = (ts - this.lastTs) / 1000;
    this.lastTs = ts;
    if (!dt || dt > 0.1) dt = Math.min(dt || 0.016, 0.05); // clamp (onglet inactif)
    this.update(dt);
    this.render();
    requestAnimationFrame(t => this.loop(t));
  }
}

/* -------------------- BOOT -------------------- */
window.addEventListener('DOMContentLoaded', () => {
  const game = new Game();
  window.GAME = game;
  game.setupMenu();
});

// Sécurité pour quickcast (utilisé par entity.startCast)
Game.prototype.canQuickcast = function () { return false; };
