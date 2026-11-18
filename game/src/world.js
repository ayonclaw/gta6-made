/* The stage: renderer, sky dome, sun and haze. Nothing here knows about
   gameplay — it just keeps a warm coastal evening on screen. */

import * as THREE from '../vendor/three.module.min.js';
import { PALETTE, RENDER } from './config.js';

export class World {
  constructor(canvas, tex, options = {}) {
    this.canvas = canvas;
    this.textures = tex;
    this.lowQuality = Boolean(options.low);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !this.lowQuality,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.setPixelRatio(this.lowQuality ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = !this.lowQuality;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = RENDER.exposure;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(PALETTE.haze, RENDER.fogNear, RENDER.fogFar);

    this.camera = new THREE.PerspectiveCamera(RENDER.fov, 1, 0.1, 2200);
    this.camera.position.set(0, 18, 60);

    // sky dome — a painted gradient, no network, no cube maps
    const skyMat = new THREE.MeshBasicMaterial({
      map: tex.sky,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1100, 32, 20), skyMat);
    this.sky.matrixAutoUpdate = false;
    this.scene.add(this.sky);

    this.hemi = new THREE.HemisphereLight(0xa9c6dc, 0x4a3a2c, 0.75);
    this.scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xffd9b0, 2.1);
    this.sun.castShadow = !this.lowQuality;
    const size = RENDER.shadowMap;
    this.sun.shadow.mapSize.set(size, size);
    const extent = RENDER.shadowExtent;
    this.sun.shadow.camera.left = -extent;
    this.sun.shadow.camera.right = extent;
    this.sun.shadow.camera.top = extent;
    this.sun.shadow.camera.bottom = -extent;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 520;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.05;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    // cool rim from the sea, no shadow cost
    this.fill = new THREE.DirectionalLight(0x9fc4d6, 0.35);
    this.fill.position.set(-80, 60, -120);
    this.scene.add(this.fill);

    this.sunOffset = new THREE.Vector3();
    this.timeOfDay = 0.62;
    this.shadowFocus = new THREE.Vector3();
    this.setTimeOfDay(this.timeOfDay);

    this.resize();
  }

  /** t: 0 dawn, 0.5 noon, 1 night. */
  setTimeOfDay(t) {
    this.timeOfDay = THREE.MathUtils.clamp(t, 0, 1);
    const climb = Math.sin(this.timeOfDay * Math.PI);
    const elevation = -0.05 + climb * 1.18;
    const azimuth = -0.85 + this.timeOfDay * 3.05;

    const dir = new THREE.Vector3(
      Math.cos(elevation) * Math.sin(azimuth),
      Math.max(0.05, Math.sin(elevation)),
      Math.cos(elevation) * Math.cos(azimuth),
    ).normalize();

    this.sunOffset.copy(dir).multiplyScalar(240);
    this.sun.position.copy(this.sunOffset);
    this.sun.target.position.set(0, 0, 0);

    const warmth = THREE.MathUtils.clamp(1 - climb * 1.35, 0, 1);
    this.sun.color.set(PALETTE.sunHigh).lerp(new THREE.Color(PALETTE.sunLow), warmth);
    this.sun.intensity = 0.6 + climb * 2.05;
    this.hemi.intensity = 0.34 + climb * 0.56;
    this.hemi.color.set('#a9c6dc').lerp(new THREE.Color('#e0b394'), warmth * 0.8);
    this.fill.intensity = 0.14 + climb * 0.28;

    const haze = new THREE.Color(PALETTE.haze).lerp(new THREE.Color('#33455e'), 1 - climb);
    this.scene.fog.color.copy(haze);
    if (this.sky) this.sky.material.color.setScalar(0.88 + climb * 0.18);
    this.renderer.toneMappingExposure = RENDER.exposure * (0.96 + climb * 0.16);
  }

  /** Keep the shadow volume around whoever we are following. */
  focus(position) {
    this.shadowFocus.copy(position);
    this.sun.target.position.set(position.x, 0, position.z);
    this.sun.position.copy(this.sunOffset).add(new THREE.Vector3(position.x, 0, position.z));
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
