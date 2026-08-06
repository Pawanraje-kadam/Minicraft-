import * as THREE from 'three';
import { BlockType, ALL_BLOCK_TYPES, WORLD_SIZE, ParticleData } from './types';
import { World } from './world';
import { getBlockTextures } from './textures';

const MAX_INSTANCES = 50000;
const DUMMY = new THREE.Object3D();

export class GameRenderer {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  
  private instanceMeshes: Map<BlockType, THREE.InstancedMesh> = new Map();
  private highlightMesh: THREE.LineSegments;
  private highlightPulseMesh: THREE.Mesh;
  private particles: ParticleData[] = [];
  private particlesMesh: THREE.Points;
  private particleGeometry: THREE.BufferGeometry;
  private particlePositions: Float32Array;
  private particleColors: Float32Array;
  private particleSizes: Float32Array;
  private maxParticles = 600;
  private elapsedTime = 0;
  
  // Screen shake
  private shakeIntensity = 0;
  private shakeDecay = 0.85;
  private cameraBasePos = new THREE.Vector3();

  constructor(canvas: HTMLCanvasElement) {
    // Scene
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x88BBDD, 0.006);

    // Gradient sky background
    this.scene.background = this.createSkyGradient();

    // Camera
    this.camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 300);
    this.camera.position.set(WORLD_SIZE / 2, 4, WORLD_SIZE / 2 + 8);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    // === Lighting ===
    // Warm sunlight
    const sunLight = new THREE.DirectionalLight(0xFFF0D4, 1.4);
    sunLight.position.set(80, 120, 60);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 10;
    sunLight.shadow.camera.far = 300;
    sunLight.shadow.camera.left = -80;
    sunLight.shadow.camera.right = 80;
    sunLight.shadow.camera.top = 80;
    sunLight.shadow.camera.bottom = -80;
    sunLight.shadow.bias = -0.001;
    sunLight.shadow.normalBias = 0.02;
    this.scene.add(sunLight);

    // Cool fill from opposite side
    const fillLight = new THREE.DirectionalLight(0x8EAAC8, 0.35);
    fillLight.position.set(-40, 60, -30);
    this.scene.add(fillLight);

    // Hemisphere for sky/ground bounce
    const hemi = new THREE.HemisphereLight(0x8EC5E8, 0x6B8E3A, 0.45);
    this.scene.add(hemi);

    // Subtle ambient to soften shadows
    const ambient = new THREE.AmbientLight(0xffffff, 0.3);
    this.scene.add(ambient);

    // Sun sphere
    const sunGeo = new THREE.SphereGeometry(6, 16, 16);
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xFFF8CC });
    const sun = new THREE.Mesh(sunGeo, sunMat);
    sun.position.copy(sunLight.position).normalize().multiplyScalar(200);
    sun.position.y = 140;
    this.scene.add(sun);

    // Sun glow
    const glowGeo = new THREE.SphereGeometry(12, 16, 16);
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xFFF8CC, transparent: true, opacity: 0.12 });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.position.copy(sun.position);
    this.scene.add(glow);

    // === Blocks ===
    this.createInstancedMeshes();

    // Highlight mesh - wireframe outline
    const highlightGeo = new THREE.BoxGeometry(1.006, 1.006, 1.006);
    const edges = new THREE.EdgesGeometry(highlightGeo);
    this.highlightMesh = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ 
      color: 0xffffff, 
      linewidth: 2,
      transparent: true,
      opacity: 0.9,
    }));
    this.highlightMesh.visible = false;
    this.highlightMesh.renderOrder = 999;
    this.scene.add(this.highlightMesh);

    // Highlight pulse overlay
    const pulseMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.08,
      side: THREE.FrontSide,
      depthWrite: false,
    });
    this.highlightPulseMesh = new THREE.Mesh(new THREE.BoxGeometry(1.02, 1.02, 1.02), pulseMat);
    this.highlightPulseMesh.visible = false;
    this.highlightPulseMesh.renderOrder = 998;
    this.scene.add(this.highlightPulseMesh);

    // === Particles ===
    this.particlePositions = new Float32Array(this.maxParticles * 3);
    this.particleColors = new Float32Array(this.maxParticles * 3);
    this.particleSizes = new Float32Array(this.maxParticles);
    
    this.particleGeometry = new THREE.BufferGeometry();
    this.particleGeometry.setAttribute('position', new THREE.BufferAttribute(this.particlePositions, 3));
    this.particleGeometry.setAttribute('color', new THREE.BufferAttribute(this.particleColors, 3));
    this.particleGeometry.setAttribute('size', new THREE.BufferAttribute(this.particleSizes, 1));
    
    const particleMat = new THREE.PointsMaterial({
      size: 0.2,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      sizeAttenuation: true,
      depthWrite: false,
    });
    this.particlesMesh = new THREE.Points(this.particleGeometry, particleMat);
    this.particlesMesh.renderOrder = 1000;
    this.scene.add(this.particlesMesh);

    // Handle resize
    window.addEventListener('resize', () => this.onResize());
  }

  private createSkyGradient(): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, '#1E3A5F');    // Deep blue zenith
    grad.addColorStop(0.25, '#4A8BC2'); // Mid sky
    grad.addColorStop(0.5, '#7CBDE8');  // Light sky
    grad.addColorStop(0.75, '#A8D8F0'); // Horizon haze
    grad.addColorStop(0.92, '#D4ECFA'); // Pale horizon
    grad.addColorStop(1.0, '#E8F4FE');  // Ground-level haze
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 2, 512);
    
    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.mapping = THREE.EquirectangularReflectionMapping;
    return tex;
  }

  private createInstancedMeshes() {
    const geo = new THREE.BoxGeometry(1, 1, 1);

    for (const def of ALL_BLOCK_TYPES) {
      const textures = getBlockTextures(def.type);
      const isTransparent = def.opacity < 1;

      // Create 6-material array: +X, -X, +Y, -Y, +Z, -Z
      // Three.js box face order: +X, -X, +Y (top), -Y (bottom), +Z, -Z
      const materials = [
        this.makeBlockMat(textures.side, def, isTransparent),   // +X
        this.makeBlockMat(textures.side, def, isTransparent),   // -X
        this.makeBlockMat(textures.top, def, isTransparent),    // +Y (top)
        this.makeBlockMat(textures.bottom, def, isTransparent), // -Y (bottom)
        this.makeBlockMat(textures.side, def, isTransparent),   // +Z
        this.makeBlockMat(textures.side, def, isTransparent),   // -Z
      ];

      const mesh = new THREE.InstancedMesh(geo, materials, MAX_INSTANCES);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.castShadow = !isTransparent;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.instanceMeshes.set(def.type, mesh);
    }
  }

  private makeBlockMat(
    tex: THREE.CanvasTexture,
    def: { opacity: number; roughness: number },
    isTransparent: boolean,
  ): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      map: tex,
      transparent: isTransparent,
      opacity: def.opacity,
      side: isTransparent ? THREE.DoubleSide : THREE.FrontSide,
      alphaTest: isTransparent ? 0.05 : 0,
      roughness: def.roughness,
      metalness: 0.0,
      depthWrite: !isTransparent,
    });
  }

  updateBlocks(world: World) {
    const counts = new Map<BlockType, number>();
    ALL_BLOCK_TYPES.forEach(def => counts.set(def.type, 0));

    world.getAllBlocks().forEach((type, key) => {
      const [x, y, z] = World.parseKey(key);
      const mesh = this.instanceMeshes.get(type);
      if (!mesh) return;

      const idx = counts.get(type) || 0;
      if (idx >= MAX_INSTANCES) return;

      DUMMY.position.set(x + 0.5, y + 0.5, z + 0.5);
      DUMMY.scale.set(1, 1, 1);
      DUMMY.rotation.set(0, 0, 0);
      DUMMY.updateMatrix();
      mesh.setMatrixAt(idx, DUMMY.matrix);
      counts.set(type, idx + 1);
    });

    this.instanceMeshes.forEach((mesh, type) => {
      mesh.count = counts.get(type) || 0;
      mesh.instanceMatrix.needsUpdate = true;
    });
  }

  setHighlight(x: number, y: number, z: number, visible: boolean) {
    this.highlightMesh.visible = visible;
    this.highlightPulseMesh.visible = visible;
    if (visible) {
      this.highlightMesh.position.set(x + 0.5, y + 0.5, z + 0.5);
      this.highlightPulseMesh.position.set(x + 0.5, y + 0.5, z + 0.5);
    }
  }

  spawnParticles(position: THREE.Vector3, color: number, count: number = 8) {
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.maxParticles) break;
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 3.5;
      this.particles.push({
        position: position.clone().add(new THREE.Vector3(
          (Math.random() - 0.5) * 0.7,
          (Math.random() - 0.5) * 0.7,
          (Math.random() - 0.5) * 0.7
        )),
        velocity: new THREE.Vector3(
          Math.cos(angle) * speed,
          Math.random() * 5 + 2,
          Math.sin(angle) * speed
        ),
        color,
        life: 1,
        maxLife: 0.4 + Math.random() * 0.6,
        size: 0.1 + Math.random() * 0.18,
      });
    }
  }

  triggerShake(intensity: number = 0.15) {
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
  }

  updateParticles(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt / p.maxLife;
      p.velocity.y -= 16 * dt;
      p.velocity.multiplyScalar(0.97);
      p.position.add(p.velocity.clone().multiplyScalar(dt));
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }

    for (let i = 0; i < this.maxParticles; i++) {
      if (i < this.particles.length) {
        const p = this.particles[i];
        this.particlePositions[i * 3] = p.position.x;
        this.particlePositions[i * 3 + 1] = p.position.y;
        this.particlePositions[i * 3 + 2] = p.position.z;
        const col = new THREE.Color(p.color);
        this.particleColors[i * 3] = col.r;
        this.particleColors[i * 3 + 1] = col.g;
        this.particleColors[i * 3 + 2] = col.b;
        this.particleSizes[i] = p.size * Math.max(0, p.life);
      } else {
        this.particleSizes[i] = 0;
      }
    }

    this.particleGeometry.attributes.position.needsUpdate = true;
    this.particleGeometry.attributes.color.needsUpdate = true;
    this.particleGeometry.attributes.size.needsUpdate = true;
    this.particleGeometry.setDrawRange(0, this.particles.length);
  }

  render(dt: number) {
    this.elapsedTime += dt;

    this.cameraBasePos.copy(this.camera.position);

    if (this.shakeIntensity > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * this.shakeIntensity * 2;
      this.camera.position.y += (Math.random() - 0.5) * this.shakeIntensity * 2;
      this.shakeIntensity *= this.shakeDecay;
      if (this.shakeIntensity < 0.001) this.shakeIntensity = 0;
    }

    // Animate highlight
    if (this.highlightPulseMesh.visible) {
      const pulseOpacity = 0.04 + Math.sin(this.elapsedTime * 5) * 0.04;
      (this.highlightPulseMesh.material as THREE.MeshBasicMaterial).opacity = pulseOpacity;
      const lineOpacity = 0.55 + Math.sin(this.elapsedTime * 5) * 0.35;
      (this.highlightMesh.material as THREE.LineBasicMaterial).opacity = lineOpacity;
    }

    this.updateParticles(dt);
    this.renderer.render(this.scene, this.camera);

    this.camera.position.copy(this.cameraBasePos);
  }

  onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  dispose() {
    this.renderer.dispose();
    this.instanceMeshes.forEach(mesh => {
      mesh.geometry.dispose();
      const mats = mesh.material;
      if (Array.isArray(mats)) mats.forEach(m => m.dispose());
      else (mats as THREE.Material).dispose();
    });
  }
}
