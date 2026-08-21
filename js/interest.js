/* ============================================================
   interest.js — Interest management visuel piloté par l'atmosphère

   La simulation reste globale. Cette première frontière ne décide que quels
   personnages méritent rendu, animation et overlay autour de l'observateur.
   La portée suit scene.fogEnd en direct, y compris pendant le tuning F8.
   ============================================================ */

class VisualInterestManager {
  constructor(game, opts = {}) {
    this.game = game;
    this.renderScale = opts.renderScale || 0.08;
    this.margin = opts.margin == null ? 220 : opts.margin;
    this.minRadius = opts.minRadius == null ? 900 : opts.minRadius;
    this.relevant = new Set();
    this.radius = this.minRadius;
  }

  refresh() {
    const fogEnd = Number(this.game.scene && this.game.scene.fogEnd) || 0;
    this.radius = Math.max(this.minRadius, fogEnd / this.renderScale + this.margin);
    const radius2 = this.radius * this.radius;
    const observer = this.game.player;
    this.relevant.clear();
    if (!observer) return;
    for (const entity of this.game.entities) {
      if (entity === observer) { this.relevant.add(entity); continue; }
      const dx = entity.x - observer.x, dy = entity.y - observer.y;
      if (dx * dx + dy * dy <= radius2) this.relevant.add(entity);
    }
  }

  isRelevant(entity) { return entity === this.game.player || this.relevant.has(entity); }
  count() { return this.relevant.size; }
}

if (typeof window !== 'undefined') window.VisualInterestManager = VisualInterestManager;
