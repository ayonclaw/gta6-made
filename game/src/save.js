/* The save. Four numbers and a job index in localStorage, versioned so a
   stale slot from an older build is simply ignored. Reads never throw: a
   private window with storage turned off should still play. */

const VERSION = 1;

export class Save {
  constructor(key = 'salmora-save-v1') {
    this.key = key;
    this.available = false;
    try {
      const probe = '__salmora_probe__';
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      this.available = true;
    } catch (err) {
      this.available = false;
    }
    this.last = null;
  }

  read() {
    if (!this.available) return null;
    try {
      const raw = window.localStorage.getItem(this.key);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || data.v !== VERSION) return null;
      return {
        cash: Number.isFinite(data.cash) ? Math.max(0, Math.round(data.cash)) : 240,
        stars: Math.min(5, Math.max(0, Math.round(data.stars || 0))),
        health: Math.min(100, Math.max(1, Math.round(data.health || 100))),
        job: Math.max(0, Math.round(data.job || 0)),
        step: Math.max(0, Math.round(data.step || 0)),
        completed: Array.isArray(data.completed) ? data.completed.slice(0, 8) : [],
        at: data.at || 0,
      };
    } catch (err) {
      return null;
    }
  }

  write(payload) {
    if (!this.available) return false;
    const data = {
      v: VERSION,
      cash: Math.round(payload.cash || 0),
      stars: Math.round(payload.stars || 0),
      health: Math.round(payload.health || 0),
      job: Math.round(payload.job || 0),
      step: Math.round(payload.step || 0),
      completed: (payload.completed || []).slice(0, 8),
      at: Date.now(),
    };
    try {
      window.localStorage.setItem(this.key, JSON.stringify(data));
      this.last = data;
      return true;
    } catch (err) {
      return false;
    }
  }

  clear() {
    this.last = null;
    if (!this.available) return;
    try {
      window.localStorage.removeItem(this.key);
    } catch (err) {
      /* storage is not ours to use */
    }
  }
}
