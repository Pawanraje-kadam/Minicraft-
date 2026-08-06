import { BlockType, WORLD_SIZE } from './types';

const STORAGE_KEY = 'minicraft_world';
const HIGHSCORE_KEY = 'minicraft_highscores';

// Simple seeded pseudo-random
function mulberry32(seed: number) {
  return () => {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Simple 2D value noise
function valueNoise2D(x: number, z: number, scale: number, seed: number): number {
  const sx = x / scale;
  const sz = z / scale;
  const ix = Math.floor(sx);
  const iz = Math.floor(sz);
  const fx = sx - ix;
  const fz = sz - iz;
  // Smooth interpolation
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);

  const hash = (a: number, b: number) => {
    const rng = mulberry32(a * 374761393 + b * 668265263 + seed);
    return rng();
  };

  const n00 = hash(ix, iz);
  const n10 = hash(ix + 1, iz);
  const n01 = hash(ix, iz + 1);
  const n11 = hash(ix + 1, iz + 1);

  const nx0 = n00 + (n10 - n00) * ux;
  const nx1 = n01 + (n11 - n01) * ux;
  return nx0 + (nx1 - nx0) * uz;
}

export class World {
  private blocks: Map<string, BlockType> = new Map();

  static key(x: number, y: number, z: number): string {
    return `${x},${y},${z}`;
  }

  static parseKey(key: string): [number, number, number] {
    const p = key.split(',');
    return [parseInt(p[0]), parseInt(p[1]), parseInt(p[2])];
  }

  inBounds(x: number, y: number, z: number): boolean {
    return x >= 0 && x < WORLD_SIZE && y >= 0 && y < WORLD_SIZE && z >= 0 && z < WORLD_SIZE;
  }

  getBlock(x: number, y: number, z: number): BlockType | undefined {
    return this.blocks.get(World.key(x, y, z));
  }

  setBlock(x: number, y: number, z: number, type: BlockType): boolean {
    if (!this.inBounds(x, y, z)) return false;
    this.blocks.set(World.key(x, y, z), type);
    return true;
  }

  removeBlock(x: number, y: number, z: number): BlockType | undefined {
    const key = World.key(x, y, z);
    const type = this.blocks.get(key);
    if (type !== undefined) {
      this.blocks.delete(key);
    }
    return type;
  }

  hasBlock(x: number, y: number, z: number): boolean {
    return this.blocks.has(World.key(x, y, z));
  }

  getAllBlocks(): Map<string, BlockType> {
    return this.blocks;
  }

  getBlockCount(): number {
    return this.blocks.size;
  }

  generateFlatWorld(): void {
    this.blocks.clear();

    const rng = mulberry32(42);
    const half = WORLD_SIZE / 2;

    // ── Full 100×100 ground layer ──
    for (let x = 0; x < WORLD_SIZE; x++) {
      for (let z = 0; z < WORLD_SIZE; z++) {
        // Biome noise determines surface type
        const biomeVal = valueNoise2D(x, z, 30, 7777);
        const beachVal = valueNoise2D(x, z, 18, 3333);

        // Distance from center for pond / beach ring
        const dx = x - half;
        const dz = z - half;
        const dist = Math.sqrt(dx * dx + dz * dz);

        // Pond in south-west quadrant
        const pondCx = half - 18;
        const pondCz = half + 20;
        const pondDist = Math.sqrt((x - pondCx) ** 2 + (z - pondCz) ** 2);

        if (pondDist < 5 + beachVal * 2) {
          // Water pond
          this.blocks.set(World.key(x, 0, z), BlockType.Water);
        } else if (pondDist < 8 + beachVal * 2) {
          // Sand beach ring around pond
          this.blocks.set(World.key(x, 0, z), BlockType.Sand);
        } else if (biomeVal > 0.72 && dist < 46) {
          // Sand patches (desert spots)
          this.blocks.set(World.key(x, 0, z), BlockType.Sand);
        } else if (biomeVal < 0.12 && dist < 44) {
          // Snow patches
          this.blocks.set(World.key(x, 0, z), BlockType.Snow);
        } else if (dist > 46) {
          // Outer edge – dirt/stone border
          this.blocks.set(World.key(x, 0, z), biomeVal > 0.5 ? BlockType.Dirt : BlockType.Stone);
        } else {
          // Main grass
          this.blocks.set(World.key(x, 0, z), BlockType.Grass);
        }
      }
    }

    // ── Dirt sub-layer (y=-1 mapped to y=0 not possible, but we can skip since y=0 is ground) ──
    // We'll leave that. Ground is already at y=0.

    // ── Stone path ──
    const pathSegs = [
      { x1: half, z1: half, x2: half + 20, z2: half },
      { x1: half, z1: half, x2: half, z2: half - 20 },
      { x1: half, z1: half, x2: half - 15, z2: half + 15 },
    ];
    for (const seg of pathSegs) {
      const steps = 40;
      for (let t = 0; t <= steps; t++) {
        const px = Math.round(seg.x1 + (seg.x2 - seg.x1) * (t / steps));
        const pz = Math.round(seg.z1 + (seg.z2 - seg.z1) * (t / steps));
        for (let dx = -1; dx <= 1; dx++) {
          for (let dz = -1; dz <= 1; dz++) {
            if (Math.abs(dx) + Math.abs(dz) <= 1) {
              const bx = px + dx;
              const bz = pz + dz;
              if (bx >= 0 && bx < WORLD_SIZE && bz >= 0 && bz < WORLD_SIZE) {
                // Don't overwrite water
                const existing = this.blocks.get(World.key(bx, 0, bz));
                if (existing !== BlockType.Water) {
                  this.blocks.set(World.key(bx, 0, bz), BlockType.Cobblestone);
                }
              }
            }
          }
        }
      }
    }

    // ── Trees ──
    const treeCount = 30;
    for (let i = 0; i < treeCount; i++) {
      const tx = Math.floor(5 + rng() * (WORLD_SIZE - 10));
      const tz = Math.floor(5 + rng() * (WORLD_SIZE - 10));

      // Only place on grass or snow
      const ground = this.blocks.get(World.key(tx, 0, tz));
      if (ground !== BlockType.Grass && ground !== BlockType.Snow) continue;

      // Check not too close to center (clear building area)
      const cdx = tx - half;
      const cdz = tz - half;
      if (Math.abs(cdx) < 5 && Math.abs(cdz) < 5) continue;

      const trunkHeight = 3 + Math.floor(rng() * 3); // 3-5

      // Trunk
      for (let y = 1; y <= trunkHeight; y++) {
        this.blocks.set(World.key(tx, y, tz), BlockType.Wood);
      }

      // Leaf canopy
      const leafType = ground === BlockType.Snow ? BlockType.Snow : BlockType.Leaves;
      const canopyRadius = 2;
      for (let dy = trunkHeight - 1; dy <= trunkHeight + 3; dy++) {
        const layerR = dy <= trunkHeight ? canopyRadius : (dy === trunkHeight + 3 ? 0 : canopyRadius - 1);
        for (let ddx = -layerR; ddx <= layerR; ddx++) {
          for (let ddz = -layerR; ddz <= layerR; ddz++) {
            if (ddx === 0 && ddz === 0 && dy <= trunkHeight) continue;
            if (Math.abs(ddx) === layerR && Math.abs(ddz) === layerR && rng() < 0.4) continue;
            this.blocks.set(World.key(tx + ddx, dy, tz + ddz), leafType);
          }
        }
      }
      // Tree top
      this.blocks.set(World.key(tx, trunkHeight + 3, tz), leafType);
    }

    // ── Stone formations (boulders) ──
    for (let i = 0; i < 8; i++) {
      const bx = Math.floor(8 + rng() * (WORLD_SIZE - 16));
      const bz = Math.floor(8 + rng() * (WORLD_SIZE - 16));
      const ground = this.blocks.get(World.key(bx, 0, bz));
      if (ground === BlockType.Water) continue;

      const bSize = 1 + Math.floor(rng() * 2);
      for (let ddx = -bSize; ddx <= bSize; ddx++) {
        for (let ddz = -bSize; ddz <= bSize; ddz++) {
          const maxH = bSize + 1 - Math.max(Math.abs(ddx), Math.abs(ddz));
          for (let dy = 1; dy <= maxH; dy++) {
            this.blocks.set(World.key(bx + ddx, dy, bz + ddz), BlockType.Stone);
          }
        }
      }
    }

    // ── Small starter house near center ──
    const hx = half + 8;
    const hz = half - 6;
    // Floor
    for (let ddx = 0; ddx < 5; ddx++) {
      for (let ddz = 0; ddz < 5; ddz++) {
        this.blocks.set(World.key(hx + ddx, 0, hz + ddz), BlockType.Planks);
      }
    }
    // Walls (3 high, leave a door gap)
    for (let dy = 1; dy <= 3; dy++) {
      for (let ddx = 0; ddx < 5; ddx++) {
        for (let ddz = 0; ddz < 5; ddz++) {
          const isEdge = ddx === 0 || ddx === 4 || ddz === 0 || ddz === 4;
          if (!isEdge) continue;
          // Door opening on front wall (ddz === 0, ddx 2, dy 1-2)
          if (ddz === 0 && ddx === 2 && dy <= 2) continue;
          // Window on back wall
          if (ddz === 4 && ddx === 2 && dy === 2) {
            this.blocks.set(World.key(hx + ddx, dy, hz + ddz), BlockType.Glass);
            continue;
          }
          // Window on side walls
          if ((ddx === 0 || ddx === 4) && ddz === 2 && dy === 2) {
            this.blocks.set(World.key(hx + ddx, dy, hz + ddz), BlockType.Glass);
            continue;
          }
          this.blocks.set(World.key(hx + ddx, dy, hz + ddz), BlockType.Planks);
        }
      }
    }
    // Roof
    for (let ddx = -1; ddx < 6; ddx++) {
      for (let ddz = -1; ddz < 6; ddz++) {
        this.blocks.set(World.key(hx + ddx, 4, hz + ddz), BlockType.Brick);
      }
    }

    // ── Flower beds: small clusters of coloured blocks as "flowers" ──
    for (let i = 0; i < 12; i++) {
      const fx = Math.floor(5 + rng() * (WORLD_SIZE - 10));
      const fz = Math.floor(5 + rng() * (WORLD_SIZE - 10));
      const ground = this.blocks.get(World.key(fx, 0, fz));
      if (ground !== BlockType.Grass) continue;
      if (this.blocks.has(World.key(fx, 1, fz))) continue;
      // Use sand or snow as "flowers" to add colour spots
      const flowerType = rng() > 0.5 ? BlockType.Sand : BlockType.Snow;
      this.blocks.set(World.key(fx, 1, fz), flowerType);
    }
  }

  clear(): void {
    this.blocks.clear();
    this.generateFlatWorld();
  }

  save(): void {
    const data: Record<string, number> = {};
    this.blocks.forEach((type, key) => {
      data[key] = type;
    });
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('Failed to save world:', e);
    }
  }

  load(): boolean {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw) as Record<string, number>;
      this.blocks.clear();
      for (const [key, type] of Object.entries(data)) {
        this.blocks.set(key, type as BlockType);
      }
      return true;
    } catch (e) {
      console.warn('Failed to load world:', e);
      return false;
    }
  }

  hasSave(): boolean {
    return localStorage.getItem(STORAGE_KEY) !== null;
  }

  static saveHighScore(score: number): number[] {
    let scores: number[] = [];
    try {
      const raw = localStorage.getItem(HIGHSCORE_KEY);
      if (raw) scores = JSON.parse(raw);
    } catch { /* empty */ }
    scores.push(score);
    scores.sort((a, b) => b - a);
    scores = scores.slice(0, 10);
    try {
      localStorage.setItem(HIGHSCORE_KEY, JSON.stringify(scores));
    } catch { /* empty */ }
    return scores;
  }

  static getHighScores(): number[] {
    try {
      const raw = localStorage.getItem(HIGHSCORE_KEY);
      if (raw) return JSON.parse(raw);
    } catch { /* empty */ }
    return [];
  }
}
