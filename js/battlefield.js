/* ============================================================
   battlefield.js — Prototype de mêlée lisible près du spawn

   Ne crée aucun type d'entité ni règle de combat. Il repositionne une seule
   fois deux petites escouades de bots existants, puis BotAI reprend la main.
   Les tags posés ici pourront devenir une source d'interest management.
   ============================================================ */

const BATTLEFIELD_SQUAD_SIZE = 4;
const BATTLEFIELD_DISTANCE = 950;
const BATTLEFIELD_LINE_GAP = 190;
const BATTLEFIELD_ROW_GAP = 72;
const BATTLEFIELD_RETURN_RADIUS = 2200;

class BattlefieldPrototype {
  constructor(game) { this.game = game; this.state = null; }

  stage(playerFaction) {
    const game = this.game;
    const bases = game.map.territories.filter(t => t.base);
    const base = bases.find(t => t.owner === playerFaction);
    const approaches = game.map.territories.filter(t => !t.base && t.owner === playerFaction);
    if (!base || !approaches.length) return null;

    approaches.sort((a, b) => this._distance2(base, a) - this._distance2(base, b));
    const approach = approaches[0];
    const enemyBase = bases
      .filter(t => t.owner !== playerFaction)
      .sort((a, b) => this._distance2(approach, a) - this._distance2(approach, b))[0];
    if (!enemyBase) return null;

    const dx = approach.x - base.x, dy = approach.y - base.y;
    const length = Math.hypot(dx, dy) || 1;
    const forward = { x: dx / length, y: dy / length };
    const side = { x: -forward.y, y: forward.x };
    const center = {
      x: base.x + forward.x * BATTLEFIELD_DISTANCE,
      y: base.y + forward.y * BATTLEFIELD_DISTANCE,
    };
    const allies = game.entities.filter(e => e.isBot && e.faction === playerFaction).slice(0, BATTLEFIELD_SQUAD_SIZE);
    const enemies = game.entities.filter(e => e.isBot && e.faction === enemyBase.owner).slice(0, BATTLEFIELD_SQUAD_SIZE);
    const count = Math.min(allies.length, enemies.length);
    if (!count) return null;

    const slots = [];
    for (let i = 0; i < count; i++) {
      const offset = (i - (count - 1) / 2) * BATTLEFIELD_ROW_GAP;
      const ally = allies[i], enemy = enemies[i];
      this._place(ally, center, forward, side, -BATTLEFIELD_LINE_GAP / 2, offset);
      this._place(enemy, center, forward, side, BATTLEFIELD_LINE_GAP / 2, offset);
      ally.target = enemy; enemy.target = ally;
      ally.followTarget = enemy; enemy.followTarget = ally;
      ally.objective = null; enemy.objective = null;
      ally.aiTimer = enemy.aiTimer = 0.35 + i * 0.08;
      ally.battlefieldSquad = 'home'; enemy.battlefieldSquad = 'invader';
      slots.push(
        { entity: ally, forwardOffset: -BATTLEFIELD_LINE_GAP / 2, sideOffset: offset, waiting: false },
        { entity: enemy, forwardOffset: BATTLEFIELD_LINE_GAP / 2, sideOffset: offset, waiting: false });
    }

    this.state = {
      center, forward, approachId: approach.id, playerFaction,
      enemyFaction: enemyBase.owner, allies: allies.slice(0, count), enemies: enemies.slice(0, count),
      side, slots, reinforcements: 0,
    };
    return this.state;
  }

  /* Les Entity conservent leur respawn canonique. Lorsqu'un membre du front
     revient vivant à un point de royaume, on le réinjecte dans son slot. */
  update() {
    const state = this.state;
    if (!state) return;
    for (const slot of state.slots) {
      const entity = slot.entity;
      if (entity.dead) { slot.waiting = true; continue; }
      const distance = Math.hypot(entity.x - state.center.x, entity.y - state.center.y);
      if (!slot.waiting && distance <= BATTLEFIELD_RETURN_RADIUS) continue;
      this._place(entity, state.center, state.forward, state.side, slot.forwardOffset, slot.sideOffset);
      slot.waiting = false;
      state.reinforcements++;
      const opponents = entity.faction === state.playerFaction ? state.enemies : state.allies;
      const target = opponents.find(candidate => !candidate.dead) || null;
      entity.target = target;
      entity.followTarget = target;
      entity.objective = null;
      entity.aiTimer = 0.2;
    }
  }

  _place(entity, center, forward, side, forwardOffset, sideOffset) {
    const desired = {
      x: center.x + forward.x * forwardOffset + side.x * sideOffset,
      y: center.y + forward.y * forwardOffset + side.y * sideOffset,
    };
    const placed = this.game.map.resolveCollision(desired.x, desired.y, entity.radius);
    entity.x = placed.x; entity.y = placed.y;
    entity.facing = Math.atan2(forward.y * -Math.sign(forwardOffset), forward.x * -Math.sign(forwardOffset));
    entity.moveTarget = null;
  }

  _distance2(a, b) { return (a.x - b.x) ** 2 + (a.y - b.y) ** 2; }
}

if (typeof window !== 'undefined') window.BattlefieldPrototype = BattlefieldPrototype;
