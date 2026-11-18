/* Three chained jobs, each with a real check behind every step: stand in the
   circle, press the key, shake the heat, reach the drop. The card in the HUD
   and the beacon in the world both read from the same object, so the text on
   screen always describes the thing the code is waiting for. */

import * as THREE from '../vendor/three.module.min.js';

const JOBS = [
  {
    id: 'dock-dues',
    title: 'DOCK DUES',
    payout: 480,
    intro: 'A runner is waiting across the road. He does not like to wait.',
    steps: [
      {
        text: 'Meet the runner on the east pavement',
        x: 16,
        z: 34.6,
        r: 5.5,
        line: 'RUNNER: You are late. That is twice this week.',
      },
      {
        text: 'Carry the parcel to the kiosk past the junction',
        x: 52,
        z: 34.2,
        r: 5.5,
        line: 'RUNNER: Kiosk on the corner. Do not open it.',
      },
    ],
    outro: 'Dock dues paid. The card fills in another name.',
  },
  {
    id: 'cold-ledger',
    title: 'COLD LEDGER',
    payout: 740,
    intro: 'The bookkeeper wants his ledger back before somebody reads it.',
    steps: [
      {
        text: 'Collect the ledger from the shop on the west street',
        x: -26,
        z: 34.2,
        r: 5.5,
        line: 'BOOKKEEPER: It is in the back. Take it and go.',
      },
      {
        text: 'Lose the heat before the drop',
        x: 20,
        z: 34.4,
        r: 9,
        cool: true,
        crime: 2,
        line: 'BOOKKEEPER: Somebody called it in. Move.',
      },
      {
        text: 'Leave the ledger at the kiosk',
        x: 52,
        z: 34.2,
        r: 5.5,
        line: 'BOOKKEEPER: Clean hands from here. Mostly.',
      },
    ],
    outro: 'The ledger is gone and the heat with it.',
  },
  {
    id: 'last-call',
    title: 'LAST CALL',
    payout: 1150,
    intro: 'One case, one pier, one last favour before the sun goes down.',
    steps: [
      {
        text: 'Take the case to the end of the pier',
        x: -64,
        z: 220,
        r: 6.5,
        interact: true,
        line: 'FISHER: Heavy. You carrying bricks now?',
      },
      {
        text: 'Drive the case north to the tower',
        x: 90,
        z: -140,
        r: 7,
        line: 'FISHER: Tower lot. Do not stop for anybody.',
      },
    ],
    outro: 'Last call, paid in full. Salmora keeps its receipts.',
  },
];

export class Missions {
  constructor(scene, options = {}) {
    this.jobs = JOBS;
    this.index = 0;
    this.step = 0;
    this.state = 'active';
    this.active = true;
    this.dwell = 0;
    this.clock = 0;
    this.cash = 0;
    this.completed = [];
    this.onPayout = null;
    this.onMessage = null;
    this.onLine = null;
    this.onCrime = null;

    this.beacon = new THREE.Group();
    this.beacon.name = 'marker';
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xf0b45a, transparent: true, opacity: 0.18, depthWrite: false,
      side: THREE.DoubleSide, fog: false,
    });
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 11, 12, 1, true), beamMat);
    this.beam.position.y = 5.5;
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xf7d9a0, transparent: true, opacity: 0.7, depthWrite: false, fog: false,
    });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(3.3, 3.75, 32), ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.06;
    this.diamond = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.55, 0),
      new THREE.MeshBasicMaterial({ color: 0xffdca0, fog: false }),
    );
    this.diamond.position.y = 3.4;
    this.beacon.add(this.beam, this.ring, this.diamond);
    scene.add(this.beacon);
    this._place();
  }

  get job() {
    return this.jobs[this.index] || null;
  }

  get stepData() {
    const job = this.job;
    if (!job) return null;
    return job.steps[this.step] || null;
  }

  get objective() {
    if (this.state === 'done') return 'All three jobs are done. The card is blank.';
    const step = this.stepData;
    return step ? step.text : 'Collect the next job';
  }

  get marker() {
    if (this.state === 'done') return null;
    const step = this.stepData;
    return step ? { x: step.x, z: step.z, r: step.r } : null;
  }

  _place() {
    const marker = this.marker;
    this.beacon.visible = Boolean(marker);
    if (!marker) return;
    this.beacon.position.set(marker.x, 0, marker.z);
  }

  /** Move to the next step, paying out when a job ends. */
  _advance() {
    const job = this.job;
    if (!job) return;
    this.step++;
    this.dwell = 0;
    if (this.step < job.steps.length) {
      const step = this.stepData;
      if (step.crime && this.onCrime) this.onCrime(step.crime);
      if (step.line && this.onLine) this.onLine(step.line);
      this._place();
      return;
    }

    this.completed.push(job.id);
    this.cash += job.payout;
    if (this.onPayout) this.onPayout(job.payout, job.title);
    this.index++;
    this.step = 0;
    if (this.index >= this.jobs.length) {
      this.state = 'done';
      this.beacon.visible = false;
      if (this.onMessage) this.onMessage('Salmora is out of favours');
      return;
    }
    if (job.outro && this.onLine) this.onLine(job.outro);
    this._place();
    if (this.onMessage) this.onMessage(`${this.job.title} — ${this.job.intro}`);
  }

  update(dt, ctx) {
    this.clock += dt;
    if (this.beacon.visible) {
      this.ring.rotation.z += dt * 0.6;
      this.diamond.rotation.y += dt * 1.2;
      const pulse = 1 + Math.sin(this.clock * 2.4) * 0.12;
      this.ring.scale.setScalar(pulse);
      this.beam.material.opacity = 0.13 + Math.sin(this.clock * 2.4) * 0.05;
    }
    if (this.state === 'done' || !this.active) return;

    const step = this.stepData;
    if (!step) return;

    const dx = ctx.x - step.x;
    const dz = ctx.z - step.z;
    const inside = dx * dx + dz * dz < step.r * step.r;
    this.dwell = inside ? this.dwell + dt : 0;

    if (step.cool) {
      if (ctx.wanted === 0 && inside) this._advance();
      return;
    }
    if (step.interact) {
      if (inside && ctx.interact) this._advance();
      return;
    }
    if (inside && this.dwell > 0.45) this._advance();
  }

  /** Staging: park the card on the first job without touching the world. */
  stage() {
    this.index = 0;
    this.step = 0;
    this.state = 'active';
    this.dwell = 0;
    this._place();
  }

  /** Pick a save back up: the job, the step inside it, the finished list. */
  restore(data) {
    if (!data) return;
    const job = Math.max(0, Math.min(this.jobs.length, data.job | 0));
    this.index = job;
    this.completed = Array.isArray(data.completed)
      ? data.completed.filter((id) => this.jobs.some((j) => j.id === id))
      : [];
    if (job >= this.jobs.length) {
      this.state = 'done';
      this.step = 0;
      this.beacon.visible = false;
      return;
    }
    const steps = this.jobs[job].steps.length;
    this.step = Math.max(0, Math.min(steps - 1, data.step | 0));
    this.state = 'active';
    this._place();
  }

  report() {
    return {
      index: this.index,
      step: this.step,
      id: this.job ? this.job.id : null,
      objective: this.objective,
      completed: this.completed.slice(),
      cash: this.cash,
      state: this.state,
    };
  }
}
