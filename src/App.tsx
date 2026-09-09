import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

type BlockId = "grass" | "dirt" | "stone" | "wood" | "leaves" | "sand" | "water" | "glass" | "brick";
type BlockMap = Map<string, BlockId>;
type Toast = { text: string; tone: "info" | "good" | "warn" };
type GameStats = { fps: number; mode: string };

type FaceName = "top" | "bottom" | "side";
type FaceDef = {
  normal: [number, number, number];
  corners: [number, number, number][];
  shade: number;
  face: FaceName;
};

// ---------- World / map constants ----------
const WORLD_RADIUS = 64;
const CHUNK_SIZE = 16;
const CHUNK_MIN = Math.floor(-WORLD_RADIUS / CHUNK_SIZE);
const CHUNK_MAX = Math.floor(WORLD_RADIUS / CHUNK_SIZE);
const WATER_LEVEL = 5;
const SPAWN_HEIGHT = 7;
const SPAWN_CLEAR_RADIUS = 9;
const BUILD_MAX_Y = 48;
const STORAGE_KEY = "minicraft-pro-world-v1";

// ---------- Player / physics constants ----------
const PLAYER_HEIGHT = 1.8;
const PLAYER_HALF_WIDTH = 0.3;
const EYE_HEIGHT = 1.62;
const STEP_HEIGHT = 1.05; // auto-step up single-block ledges (two-block walls still need a jump)
const EPS = 0.001;
const RAY_DISTANCE = 8;
const PHYSICS_STEP = 1 / 120;
const WALK_SPEED = 5.4;
const SPRINT_SPEED = 8.0;
const FLY_SPEED = 13;
const GROUND_CONTROL = 13;
const AIR_CONTROL = 2.6;
const FLY_CONTROL = 10;
const GRAVITY = 25;
const WATER_GRAVITY = 6.5;
const JUMP_SPEED = 8.1;
const MAX_FALL_SPEED = -30;
const MAX_SINK_SPEED = -3.2;
const SWIM_UP_SPEED = 4.2;
const WATER_MOVE_FACTOR = 0.55;
const COYOTE_TIME = 0.1;
const WORLD_BOUND = WORLD_RADIUS + 5;
const COLLISION_SUB_STEP = 0.35;

const BLOCKS: Record<
  BlockId,
  {
    name: string;
    icon: string;
    transparent?: boolean;
    liquid?: boolean;
    solid?: boolean;
    colors: Record<FaceName, string>;
  }
> = {
  grass: {
    name: "Grass",
    icon: "🌱",
    colors: { top: "#54c45e", bottom: "#7a4c2f", side: "#5d9349" },
  },
  dirt: {
    name: "Dirt",
    icon: "🟫",
    colors: { top: "#8b5a35", bottom: "#6b4127", side: "#7a4c2f" },
  },
  stone: {
    name: "Stone",
    icon: "🪨",
    colors: { top: "#96999f", bottom: "#63666d", side: "#7f838a" },
  },
  wood: {
    name: "Wood",
    icon: "🪵",
    colors: { top: "#d3a061", bottom: "#8b5b30", side: "#9a6535" },
  },
  leaves: {
    name: "Leaves",
    icon: "🍃",
    transparent: true,
    colors: { top: "#38a852", bottom: "#226f3a", side: "#2f9147" },
  },
  sand: {
    name: "Sand",
    icon: "🟨",
    colors: { top: "#f1da91", bottom: "#bfa969", side: "#d8c27a" },
  },
  water: {
    name: "Water",
    icon: "💧",
    transparent: true,
    liquid: true,
    solid: false,
    colors: { top: "#4fb6ff", bottom: "#1d75c5", side: "#2e96de" },
  },
  glass: {
    name: "Glass",
    icon: "⬜",
    transparent: true,
    colors: { top: "#bceeff", bottom: "#77cbe8", side: "#9fe6ff" },
  },
  brick: {
    name: "Brick",
    icon: "🧱",
    colors: { top: "#c9573c", bottom: "#783020", side: "#a94532" },
  },
};

const HOTBAR: BlockId[] = ["grass", "dirt", "stone", "wood", "leaves", "sand", "water", "glass", "brick"];

const FACES: FaceDef[] = [
  { normal: [1, 0, 0], corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], shade: 0.82, face: "side" },
  { normal: [-1, 0, 0], corners: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]], shade: 0.68, face: "side" },
  { normal: [0, 1, 0], corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], shade: 1, face: "top" },
  { normal: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], shade: 0.48, face: "bottom" },
  { normal: [0, 0, 1], corners: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]], shade: 0.76, face: "side" },
  { normal: [0, 0, -1], corners: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]], shade: 0.9, face: "side" },
];

const keyOf = (x: number, y: number, z: number) => `${x},${y},${z}`;

const parseKey = (key: string): [number, number, number] => {
  const [x, y, z] = key.split(",").map(Number);
  return [x, y, z];
};

// ---------- Math / noise helpers ----------
const fract = (value: number) => value - Math.floor(value);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smoothstep = (edge0: number, edge1: number, value: number) => {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

const hash2 = (x: number, z: number, seed: number) => {
  const n = Math.sin(x * 127.1 + z * 311.7 + seed * 137.13) * 43758.5453123;
  return fract(n);
};

/** Smooth bilinear-interpolated value noise (no per-block spikes). */
const valueNoise = (x: number, z: number, seed: number) => {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, seed);
  const b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed);
  const d = hash2(ix + 1, iz + 1, seed);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uz);
};

/** Fractal Brownian motion — smooth rolling terrain. Returns 0..1. */
const fbm = (x: number, z: number, seed: number, octaves = 4) => {
  let sum = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i += 1) {
    sum += valueNoise(x * frequency, z * frequency, seed + i * 17.71) * amplitude;
    norm += amplitude;
    amplitude *= 0.5;
    frequency *= 2.03;
  }
  return sum / norm;
};

/** Ridged noise — sharp mountain crests. Returns 0..1. */
const ridged = (x: number, z: number, seed: number, octaves = 4) => {
  let sum = 0;
  let amplitude = 0.55;
  let frequency = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i += 1) {
    const n = 1 - Math.abs(valueNoise(x * frequency, z * frequency, seed + i * 31.31) * 2 - 1);
    sum += n * n * amplitude;
    norm += amplitude;
    amplitude *= 0.5;
    frequency *= 2.1;
  }
  return sum / norm;
};

// ---------- Structured terrain generation ----------
type Biome = "Ocean" | "Beach" | "Desert" | "Plains" | "Forest" | "Mountains";
type TerrainInfo = { height: number; biome: Biome; surface: BlockId };
type FeaturePoint = { x: number; z: number; radius: number };

/**
 * Deterministically places `count` landmark regions (mountain ranges, deserts)
 * around the island so every seed gets a complete, balanced map layout.
 */
const featurePoints = (seed: number, baseIndex: number, count: number, minSpawnDist: number): FeaturePoint[] => {
  const points: FeaturePoint[] = [];
  for (let i = 0; i < count; i += 1) {
    let px = 0;
    let pz = 0;
    let pr = 18;
    let attempt = 0;
    do {
      const salt = baseIndex + i * 37 + attempt * 101;
      const angle = hash2(salt, seed + 13, 3.1) * Math.PI * 2;
      const centerDist = lerp(20, WORLD_RADIUS - 14, hash2(salt + 5, seed - 7, 5.3));
      px = Math.cos(angle) * centerDist;
      pz = Math.sin(angle) * centerDist;
      pr = lerp(14, 24, hash2(salt + 9, seed + 3, 8.7));
      attempt += 1;
    } while (Math.hypot(px, pz) < minSpawnDist && attempt < 8);
    points.push({ x: px, z: pz, radius: pr });
  }
  return points;
};

let featureCache: { seed: number; mountains: FeaturePoint[]; deserts: FeaturePoint[] } | undefined;
const getFeatures = (seed: number) => {
  if (!featureCache || featureCache.seed !== seed) {
    featureCache = {
      seed,
      mountains: featurePoints(seed, 1000, 4, 26),
      deserts: featurePoints(seed, 2000, 3, 24),
    };
  }
  return featureCache;
};

/** Influence of a landmark point at (x, z), softened and wobbled by noise. */
const featureInfluence = (point: FeaturePoint, x: number, z: number, seed: number) => {
  const warp = (fbm(x * 0.06, z * 0.06, seed + 501, 3) - 0.5) * 9;
  const distance = Math.hypot(x - point.x, z - point.z) + warp;
  return smoothstep(point.radius, point.radius * 0.3, distance);
};

const terrainInfo = (x: number, z: number, seed: number): TerrainInfo => {
  const distSpawn = Math.hypot(x, z);
  const features = getFeatures(seed);

  const rolling = fbm(x * 0.02 + 40, z * 0.02 - 73, seed + 11, 4);
  const ridgeBase = ridged(x * 0.016 + 90, z * 0.016 - 140, seed + 83, 4);
  const forestNoise = fbm(x * 0.011 - 310, z * 0.011 + 140, seed + 177, 3);

  let mountainMask = 0;
  features.mountains.forEach((point) => {
    mountainMask = Math.max(mountainMask, featureInfluence(point, x, z, seed));
  });
  mountainMask *= smoothstep(12, 20, distSpawn);

  let desertMask = 0;
  features.deserts.forEach((point) => {
    desertMask = Math.max(desertMask, featureInfluence(point, x, z, seed));
  });
  desertMask *= (1 - mountainMask) * smoothstep(13, 22, distSpawn);

  // Base land height: gentle plains/hills, with ridged mountains layered on top.
  let land = 6 + rolling * 4.5;
  land += mountainMask * (ridgeBase * 15 + 2);
  land = lerp(land, 6.4 + rolling * 1.6, desertMask * 0.85);

  // Meandering rivers carved toward sea level (kept away from spawn).
  const riverNoise = Math.abs(valueNoise(x * 0.016 + 700, z * 0.016 + 700, seed + 229) - 0.5) * 2;
  const riverMask = smoothstep(0.055, 0.012, riverNoise) * smoothstep(10, 18, distSpawn) * (1 - mountainMask);
  land = lerp(land, 3.4, riverMask * 0.9);

  // Island falloff into an ocean ring, with a wobbled coastline.
  const wobble = (fbm(x * 0.05, z * 0.05, seed + 9, 3) - 0.5) * 12;
  const edge = (distSpawn + wobble) / (WORLD_RADIUS + 6);
  const coast = smoothstep(1.0, 0.72, edge);
  const oceanFloor = 1.6 + rolling * 1.8;
  let height = lerp(oceanFloor, land, coast);

  // Flat, clean spawn area.
  const spawnFlat = smoothstep(10, 4.5, distSpawn);
  if (spawnFlat > 0) height = lerp(height, SPAWN_HEIGHT, spawnFlat);

  const columnHeight = clamp(Math.round(height), 1, 30);

  let biome: Biome;
  let surface: BlockId;
  if (coast < 0.35 && columnHeight <= WATER_LEVEL) {
    biome = "Ocean";
    surface = "sand";
  } else if (columnHeight >= 16 || mountainMask > 0.55) {
    biome = "Mountains";
    surface = columnHeight >= 17 ? "stone" : "grass";
  } else if (desertMask > 0.5) {
    biome = "Desert";
    surface = "sand";
  } else if (columnHeight <= WATER_LEVEL + 1) {
    biome = "Beach";
    surface = "sand";
  } else if (forestNoise > 0.5) {
    biome = "Forest";
    surface = "grass";
  } else {
    biome = "Plains";
    surface = "grass";
  }

  return { height: columnHeight, biome, surface };
};

const generateWorld = (seed = Date.now()): { world: BlockMap; maxY: number } => {
  const world: BlockMap = new Map();
  let maxY = 1;

  for (let x = -WORLD_RADIUS; x <= WORLD_RADIUS; x += 1) {
    for (let z = -WORLD_RADIUS; z <= WORLD_RADIUS; z += 1) {
      const info = terrainInfo(x, z, seed);
      const h = info.height;
      for (let y = 0; y <= h; y += 1) {
        let block: BlockId;
        if (y === h) block = info.surface;
        else if (y > h - 3) block = info.surface === "sand" ? "sand" : "dirt";
        else block = "stone";
        world.set(keyOf(x, y, z), block);
      }
      for (let y = h + 1; y <= WATER_LEVEL; y += 1) {
        world.set(keyOf(x, y, z), "water");
      }
      maxY = Math.max(maxY, h);
    }
  }

  // Trees on a jittered grid so spacing stays structured, never clumped.
  for (let gx = -WORLD_RADIUS + 4; gx <= WORLD_RADIUS - 4; gx += 5) {
    for (let gz = -WORLD_RADIUS + 4; gz <= WORLD_RADIUS - 4; gz += 5) {
      const tx = gx + Math.floor(hash2(gx, gz, seed + 7) * 3) - 1;
      const tz = gz + Math.floor(hash2(gx + 2, gz - 2, seed + 13) * 3) - 1;
      if (Math.hypot(tx, tz) < SPAWN_CLEAR_RADIUS) continue;

      const info = terrainInfo(tx, tz, seed);
      if (info.height <= WATER_LEVEL + 1) continue;
      const roll = hash2(gx * 13 + 5, gz * 17 - 3, seed + 19);
      const place =
        (info.biome === "Forest" && roll < 0.7) ||
        (info.biome === "Plains" && roll < 0.08) ||
        (info.biome === "Mountains" && info.surface === "grass" && roll < 0.18);
      if (!place) continue;

      const trunkHeight = 4 + Math.floor(hash2(tx + 25, tz - 16, seed + 23) * 3);
      for (let y = info.height + 1; y <= info.height + trunkHeight; y += 1) {
        world.set(keyOf(tx, y, tz), "wood");
      }

      const leafCenterY = info.height + trunkHeight + 1;
      maxY = Math.max(maxY, leafCenterY + 2);
      for (let lx = -2; lx <= 2; lx += 1) {
        for (let ly = -2; ly <= 2; ly += 1) {
          for (let lz = -2; lz <= 2; lz += 1) {
            const distance = Math.abs(lx) + Math.abs(ly) + Math.abs(lz);
            const skipCorner = Math.abs(lx) === 2 && Math.abs(lz) === 2 && ly < 1;
            if (distance <= 4 && !skipCorner) {
              const key = keyOf(tx + lx, leafCenterY + ly, tz + lz);
              if (!world.has(key)) {
                world.set(key, "leaves");
              }
            }
          }
        }
      }
    }
  }

  // Paved spawn plaza — a clear structural landmark at world centre.
  for (let dx = -4; dx <= 4; dx += 1) {
    for (let dz = -4; dz <= 4; dz += 1) {
      if (Math.hypot(dx, dz) <= 3.6) {
        world.set(keyOf(dx, SPAWN_HEIGHT, dz), "brick");
        for (let y = SPAWN_HEIGHT + 1; y <= SPAWN_HEIGHT + 4; y += 1) {
          world.delete(keyOf(dx, y, dz));
        }
      }
    }
  }
  maxY = Math.max(maxY, SPAWN_HEIGHT);

  return { world, maxY };
};

const getSurfaceHeight = (world: BlockMap, x: number, z: number, maxY: number) => {
  for (let y = maxY; y >= 0; y -= 1) {
    const block = world.get(keyOf(x, y, z));
    if (block && block !== "water" && block !== "leaves") {
      return y;
    }
  }
  return 0;
};

const isTransparent = (block: BlockId) => Boolean(BLOCKS[block].transparent);
const isSolid = (block: BlockId) => BLOCKS[block].solid !== false;

const shouldRenderFace = (current: BlockId, neighbor: BlockId | undefined) => {
  if (!neighbor) return true;
  if (neighbor === current && isTransparent(current)) return false;
  if (isTransparent(neighbor)) return true;
  return isTransparent(current);
};

const shadeColor = (hex: string, shade: number) => {
  const color = new THREE.Color(hex);
  color.multiplyScalar(shade);
  return color;
};

const pushQuad = (
  positions: number[],
  normals: number[],
  colors: number[],
  indices: number[],
  x: number,
  y: number,
  z: number,
  face: FaceDef,
  block: BlockId,
) => {
  const vertexIndex = positions.length / 3;
  const color = shadeColor(BLOCKS[block].colors[face.face], face.shade);

  face.corners.forEach((corner) => {
    positions.push(x + corner[0], y + corner[1], z + corner[2]);
    normals.push(face.normal[0], face.normal[1], face.normal[2]);
    colors.push(color.r, color.g, color.b);
  });

  indices.push(vertexIndex, vertexIndex + 1, vertexIndex + 2, vertexIndex, vertexIndex + 2, vertexIndex + 3);
};

// Builds the mesh geometry for one 16x16 chunk column.
const buildChunkGeometry = (world: BlockMap, cx: number, cz: number, transparentPass: boolean, maxY: number) => {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const x0 = cx * CHUNK_SIZE;
  const z0 = cz * CHUNK_SIZE;

  for (let x = x0; x < x0 + CHUNK_SIZE; x += 1) {
    for (let z = z0; z < z0 + CHUNK_SIZE; z += 1) {
      for (let y = 0; y <= maxY; y += 1) {
        const block = world.get(keyOf(x, y, z));
        if (!block || isTransparent(block) !== transparentPass) continue;

        FACES.forEach((face) => {
          const neighbor = world.get(keyOf(x + face.normal[0], y + face.normal[1], z + face.normal[2]));
          if (shouldRenderFace(block, neighbor)) {
            pushQuad(positions, normals, colors, indices, x, y, z, face, block);
          }
        });
      }
    }
  }

  if (indices.length === 0) return undefined;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
};

// ---------- Collision / physics ----------
type PlayerState = {
  pos: THREE.Vector3; // feet position
  vel: THREE.Vector3;
  onGround: boolean;
  coyote: number;
  inWater: boolean;
  eyeInWater: boolean;
};

type PlayerInput = {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
  sprint: boolean;
  yaw: number;
  fly: boolean;
};

type PhysicsHooks = {
  onJump?: () => void;
  onLand?: (impactSpeed: number) => void;
  onSplash?: () => void;
  onStep?: (speed: number) => void;
  onVoid?: () => void;
};

const createPlayer = (x: number, y: number, z: number): PlayerState => ({
  pos: new THREE.Vector3(x, y, z),
  vel: new THREE.Vector3(),
  onGround: false,
  coyote: 0,
  inWater: false,
  eyeInWater: false,
});

/** True if the player AABB (feet at px, py, pz) overlaps any solid block. */
const playerCollides = (world: BlockMap, px: number, py: number, pz: number) => {
  const minX = Math.floor(px - PLAYER_HALF_WIDTH + EPS);
  const maxX = Math.floor(px + PLAYER_HALF_WIDTH - EPS);
  const minY = Math.floor(py + EPS);
  const maxY = Math.floor(py + PLAYER_HEIGHT - EPS);
  const minZ = Math.floor(pz - PLAYER_HALF_WIDTH + EPS);
  const maxZ = Math.floor(pz + PLAYER_HALF_WIDTH - EPS);

  for (let x = minX; x <= maxX; x += 1) {
    for (let y = minY; y <= maxY; y += 1) {
      for (let z = minZ; z <= maxZ; z += 1) {
        const block = world.get(keyOf(x, y, z));
        if (block && isSolid(block)) return true;
      }
    }
  }
  return false;
};

const blockAtPoint = (world: BlockMap, x: number, y: number, z: number) =>
  world.get(keyOf(Math.floor(x), Math.floor(y), Math.floor(z)));

const pointInWater = (world: BlockMap, x: number, y: number, z: number) => blockAtPoint(world, x, y, z) === "water";

type RayHit = { x: number; y: number; z: number; nx: number; ny: number; nz: number; block: BlockId };

/** Amanatides & Woo voxel DDA raycast — exact block + face normal. */
const raycastVoxel = (
  world: BlockMap,
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  maxDistance: number,
): RayHit | undefined => {
  let x = Math.floor(origin.x);
  let y = Math.floor(origin.y);
  let z = Math.floor(origin.z);

  const stepX = direction.x > 0 ? 1 : -1;
  const stepY = direction.y > 0 ? 1 : -1;
  const stepZ = direction.z > 0 ? 1 : -1;

  const tDeltaX = direction.x !== 0 ? Math.abs(1 / direction.x) : Infinity;
  const tDeltaY = direction.y !== 0 ? Math.abs(1 / direction.y) : Infinity;
  const tDeltaZ = direction.z !== 0 ? Math.abs(1 / direction.z) : Infinity;

  let tMaxX =
    direction.x !== 0 ? (direction.x > 0 ? x + 1 - origin.x : origin.x - x) * tDeltaX : Infinity;
  let tMaxY =
    direction.y !== 0 ? (direction.y > 0 ? y + 1 - origin.y : origin.y - y) * tDeltaY : Infinity;
  let tMaxZ =
    direction.z !== 0 ? (direction.z > 0 ? z + 1 - origin.z : origin.z - z) * tDeltaZ : Infinity;

  let nx = 0;
  let ny = 0;
  let nz = 0;
  let t = 0;

  for (let iter = 0; iter < 128 && t <= maxDistance; iter += 1) {
    const block = world.get(keyOf(x, y, z));
    if (block && isSolid(block)) {
      return { x, y, z, nx, ny, nz, block };
    }

    if (tMaxX <= tMaxY && tMaxX <= tMaxZ) {
      x += stepX;
      t = tMaxX;
      tMaxX += tDeltaX;
      nx = -stepX;
      ny = 0;
      nz = 0;
    } else if (tMaxY <= tMaxZ) {
      y += stepY;
      t = tMaxY;
      tMaxY += tDeltaY;
      nx = 0;
      ny = -stepY;
      nz = 0;
    } else {
      z += stepZ;
      t = tMaxZ;
      tMaxZ += tDeltaZ;
      nx = 0;
      ny = 0;
      nz = -stepZ;
    }
  }

  return undefined;
};

/** Attempts to walk up a low ledge (auto step). */
const tryStepUp = (world: BlockMap, player: PlayerState, axis: "x" | "z", increment: number) => {
  const ox = player.pos.x;
  const oy = player.pos.y;
  const oz = player.pos.z;

  player.pos[axis] -= increment; // back out of the wall
  player.pos.y += STEP_HEIGHT + EPS;
  if (playerCollides(world, player.pos.x, player.pos.y, player.pos.z)) {
    player.pos.set(ox, oy, oz);
    return false;
  }
  player.pos[axis] += increment;
  if (playerCollides(world, player.pos.x, player.pos.y, player.pos.z)) {
    player.pos.set(ox, oy, oz);
    return false;
  }

  // Settle down onto the ledge.
  let remaining = STEP_HEIGHT + EPS;
  let guard = 0;
  while (remaining > 0 && guard < 12) {
    guard += 1;
    const dy = Math.min(remaining, 0.1);
    player.pos.y -= dy;
    if (playerCollides(world, player.pos.x, player.pos.y, player.pos.z)) {
      player.pos.y = Math.floor(player.pos.y) + 1 + EPS;
      if (playerCollides(world, player.pos.x, player.pos.y, player.pos.z)) {
        player.pos.set(ox, oy, oz);
        return false;
      }
      return true;
    }
    remaining -= dy;
  }
  return true;
};

/** Moves along one horizontal axis in sub-steps, sliding and snapping on contact. */
const moveHorizontal = (world: BlockMap, player: PlayerState, axis: "x" | "z", amount: number, allowStep: boolean) => {
  if (amount === 0) return;
  const steps = Math.max(1, Math.ceil(Math.abs(amount) / COLLISION_SUB_STEP));
  const increment = amount / steps;

  for (let i = 0; i < steps; i += 1) {
    player.pos[axis] += increment;
    if (playerCollides(world, player.pos.x, player.pos.y, player.pos.z)) {
      if (allowStep && tryStepUp(world, player, axis, increment)) {
        continue;
      }

      // Snap flush against the blocking cell.
      if (axis === "x") {
        if (increment > 0) player.pos.x = Math.floor(player.pos.x + PLAYER_HALF_WIDTH - EPS) - PLAYER_HALF_WIDTH - EPS;
        else player.pos.x = Math.floor(player.pos.x - PLAYER_HALF_WIDTH + EPS) + 1 + PLAYER_HALF_WIDTH + EPS;
        player.vel.x = 0;
      } else {
        if (increment > 0) player.pos.z = Math.floor(player.pos.z + PLAYER_HALF_WIDTH - EPS) - PLAYER_HALF_WIDTH - EPS;
        else player.pos.z = Math.floor(player.pos.z - PLAYER_HALF_WIDTH + EPS) + 1 + PLAYER_HALF_WIDTH + EPS;
        player.vel.z = 0;
      }
      return;
    }
  }
};

/** Moves vertically in sub-steps; resolves landing and ceiling bumps. */
const moveVertical = (world: BlockMap, player: PlayerState, amount: number) => {
  if (amount === 0) return;
  const steps = Math.max(1, Math.ceil(Math.abs(amount) / COLLISION_SUB_STEP));
  const increment = amount / steps;

  for (let i = 0; i < steps; i += 1) {
    const previousY = player.pos.y;
    player.pos.y += increment;
    if (playerCollides(world, player.pos.x, player.pos.y, player.pos.z)) {
      if (increment < 0) {
        player.onGround = true;
        player.pos.y = Math.floor(player.pos.y) + 1 + EPS;
      } else {
        player.pos.y = Math.floor(player.pos.y + PLAYER_HEIGHT) - PLAYER_HEIGHT - EPS;
      }
      if (playerCollides(world, player.pos.x, player.pos.y, player.pos.z)) {
        player.pos.y = previousY; // snapped position still blocked — stay put
      }
      player.vel.y = 0;
      return;
    }
  }
};

/**
 * One fixed-timestep physics tick. All movement goes through sub-stepped,
 * axis-separated AABB collision so nothing tunnels, even at sprint + fall speed.
 */
const simulatePlayerStep = (
  world: BlockMap,
  player: PlayerState,
  input: PlayerInput,
  dt: number,
  hooks: PhysicsHooks = {},
) => {
  // Medium detection.
  const wasInWater = player.inWater;
  player.inWater =
    pointInWater(world, player.pos.x, player.pos.y + 0.45, player.pos.z) ||
    pointInWater(world, player.pos.x, player.pos.y + 1.3, player.pos.z);
  player.eyeInWater = pointInWater(world, player.pos.x, player.pos.y + EYE_HEIGHT, player.pos.z);

  if (player.inWater && !wasInWater && player.vel.y < -6) hooks.onSplash?.();

  // Desired horizontal velocity from input.
  let wishX = 0;
  let wishZ = 0;
  const sinYaw = Math.sin(input.yaw);
  const cosYaw = Math.cos(input.yaw);
  if (input.forward) {
    wishX -= sinYaw;
    wishZ -= cosYaw;
  }
  if (input.back) {
    wishX += sinYaw;
    wishZ += cosYaw;
  }
  if (input.right) {
    wishX += cosYaw;
    wishZ -= sinYaw;
  }
  if (input.left) {
    wishX -= cosYaw;
    wishZ += sinYaw;
  }
  const wishLength = Math.hypot(wishX, wishZ);
  if (wishLength > 0) {
    wishX /= wishLength;
    wishZ /= wishLength;
  }

  const sprinting = !input.fly && input.sprint && wishLength > 0;
  let speed = input.fly ? FLY_SPEED : sprinting ? SPRINT_SPEED : WALK_SPEED;
  if (player.inWater && !input.fly) speed *= WATER_MOVE_FACTOR;

  const hasInput = wishLength > 0;
  const control = input.fly
    ? FLY_CONTROL
    : hasInput
      ? player.onGround
        ? GROUND_CONTROL
        : AIR_CONTROL
      : player.onGround
        ? 18
        : 0.4;
  const blend = 1 - Math.exp(-control * dt);
  player.vel.x += (wishX * speed - player.vel.x) * blend;
  player.vel.z += (wishZ * speed - player.vel.z) * blend;

  const wasOnGround = player.onGround;
  const previousVy = player.vel.y;

  // Vertical velocity.
  if (input.fly) {
    let targetVy = 0;
    if (input.jump) targetVy += FLY_SPEED;
    if (input.sprint) targetVy -= FLY_SPEED;
    player.vel.y += (targetVy - player.vel.y) * (1 - Math.exp(-FLY_CONTROL * dt));
  } else if (player.inWater) {
    player.vel.y -= WATER_GRAVITY * dt;
    player.vel.y = Math.max(player.vel.y, MAX_SINK_SPEED);
    if (input.jump) {
      player.vel.y += (SWIM_UP_SPEED - player.vel.y) * (1 - Math.exp(-8 * dt));
    }
    if (input.jump && player.onGround) {
      player.vel.y = JUMP_SPEED; // hop out of the water
      hooks.onJump?.();
    }
  } else {
    if (input.jump && (player.onGround || player.coyote > 0)) {
      player.vel.y = JUMP_SPEED;
      player.onGround = false;
      player.coyote = 0;
      hooks.onJump?.();
    }
    player.vel.y -= GRAVITY * dt;
    player.vel.y = Math.max(player.vel.y, MAX_FALL_SPEED);
  }

  // Integrate with collision, one axis at a time.
  const allowStep = !input.fly && (player.onGround || player.inWater);
  player.onGround = false;
  moveHorizontal(world, player, "x", player.vel.x * dt, allowStep);
  moveHorizontal(world, player, "z", player.vel.z * dt, allowStep);
  moveVertical(world, player, player.vel.y * dt);

  if (player.onGround) player.coyote = COYOTE_TIME;
  else player.coyote = Math.max(0, player.coyote - dt);

  // Landing feedback.
  if (!wasOnGround && player.onGround && previousVy < -9) {
    hooks.onLand?.(-previousVy);
  }

  // World bounds & void safety net.
  if (player.pos.x < -WORLD_BOUND) {
    player.pos.x = -WORLD_BOUND;
    player.vel.x = Math.max(0, player.vel.x);
  } else if (player.pos.x > WORLD_BOUND) {
    player.pos.x = WORLD_BOUND;
    player.vel.x = Math.min(0, player.vel.x);
  }
  if (player.pos.z < -WORLD_BOUND) {
    player.pos.z = -WORLD_BOUND;
    player.vel.z = Math.max(0, player.vel.z);
  } else if (player.pos.z > WORLD_BOUND) {
    player.pos.z = WORLD_BOUND;
    player.vel.z = Math.min(0, player.vel.z);
  }

  if (player.pos.y < -14) {
    hooks.onVoid?.();
  }

  if (player.onGround) {
    hooks.onStep?.(Math.hypot(player.vel.x, player.vel.z));
  }
};

class GameAudio {
  private context?: AudioContext;
  private lastStep = 0;

  private getContext() {
    if (!this.context) {
      this.context = new AudioContext();
    }
    return this.context;
  }

  blip(type: "place" | "break" | "jump" | "step" | "splash") {
    const context = this.getContext();
    const now = context.currentTime;
    const osc = context.createOscillator();
    const gain = context.createGain();
    const filter = context.createBiquadFilter();

    const settings = {
      place: { frequency: 150, end: 75, volume: 0.16, duration: 0.075, filter: 900 },
      break: { frequency: 95, end: 38, volume: 0.22, duration: 0.11, filter: 550 },
      jump: { frequency: 260, end: 180, volume: 0.1, duration: 0.09, filter: 1200 },
      step: { frequency: 80, end: 55, volume: 0.045, duration: 0.055, filter: 420 },
      splash: { frequency: 190, end: 60, volume: 0.14, duration: 0.14, filter: 700 },
    }[type];

    osc.type = type === "jump" ? "triangle" : "square";
    osc.frequency.setValueAtTime(settings.frequency, now);
    osc.frequency.exponentialRampToValueAtTime(settings.end, now + settings.duration);
    filter.type = "lowpass";
    filter.frequency.value = settings.filter;
    gain.gain.setValueAtTime(settings.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + settings.duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(context.destination);
    osc.start(now);
    osc.stop(now + settings.duration);
  }

  step(speed: number) {
    const now = performance.now();
    if (speed > 0.5 && now - this.lastStep > 330) {
      this.lastStep = now;
      this.blip("step");
    }
  }
}

const App = () => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const worldRef = useRef<BlockMap>(new Map());
  const worldMaxYRef = useRef(1);
  const seedRef = useRef(20260823);
  const selectedRef = useRef<BlockId>("grass");
  const rebuildWorldRef = useRef<() => void>(() => undefined);
  const resetPlayerRef = useRef<() => void>(() => undefined);
  const [selected, setSelected] = useState<BlockId>("grass");
  const [locked, setLocked] = useState(false);
  const [showHelp, setShowHelp] = useState(true);
  const [toast, setToast] = useState<Toast>({ text: "Click the world to lock mouse and start building.", tone: "info" });
  const [stats, setStats] = useState<GameStats>({ fps: 0, mode: "Creative" });

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    const scene = new THREE.Scene();
    const skyFog = new THREE.Fog(0x8ec8ff, 45, 135);
    scene.fog = skyFog;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.className = "game-canvas";
    mount.appendChild(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 420);
    camera.rotation.order = "YXZ";

    const hemiLight = new THREE.HemisphereLight(0xbfe7ff, 0x4d392b, 2.1);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xfff3c1, 2.2);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(2048, 2048);
    sunLight.shadow.camera.left = -58;
    sunLight.shadow.camera.right = 58;
    sunLight.shadow.camera.top = 58;
    sunLight.shadow.camera.bottom = -58;
    sunLight.shadow.camera.near = 1;
    sunLight.shadow.camera.far = 260;
    sunLight.shadow.bias = -0.0004;
    sunLight.shadow.normalBias = 0.6;
    const shadowTarget = new THREE.Object3D();
    scene.add(shadowTarget);
    sunLight.target = shadowTarget;
    scene.add(sunLight);

    const sun = new THREE.Mesh(
      new THREE.SphereGeometry(4.5, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0xffdf70 }),
    );
    scene.add(sun);

    const worldGroup = new THREE.Group();
    scene.add(worldGroup);

    const solidMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const transparentMaterial = new THREE.MeshLambertMaterial({
      vertexColors: true,
      flatShading: true,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    const highlight = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.025, 1.025, 1.025)),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 }),
    );
    highlight.visible = false;
    scene.add(highlight);

    const particles: { mesh: THREE.Mesh; velocity: THREE.Vector3; life: number; maxLife: number }[] = [];
    const particleGeometry = new THREE.BoxGeometry(0.11, 0.11, 0.11);
    const audio = new GameAudio();

    // ---------- Chunk bookkeeping ----------
    const chunkMeshes = new Map<string, THREE.Mesh[]>();
    const knownChunks = new Set<string>();
    for (let cx = CHUNK_MIN; cx <= CHUNK_MAX; cx += 1) {
      for (let cz = CHUNK_MIN; cz <= CHUNK_MAX; cz += 1) {
        knownChunks.add(`${cx},${cz}`);
      }
    }

    const disposeChunk = (cx: number, cz: number) => {
      const key = `${cx},${cz}`;
      const meshes = chunkMeshes.get(key);
      if (!meshes) return;
      meshes.forEach((mesh) => {
        worldGroup.remove(mesh);
        mesh.geometry.dispose();
      });
      chunkMeshes.delete(key);
    };

    const buildChunk = (cx: number, cz: number) => {
      disposeChunk(cx, cz);
      const key = `${cx},${cz}`;
      knownChunks.add(key);
      const meshes: THREE.Mesh[] = [];

      const solidGeometry = buildChunkGeometry(worldRef.current, cx, cz, false, worldMaxYRef.current);
      if (solidGeometry) {
        const solidMesh = new THREE.Mesh(solidGeometry, solidMaterial);
        solidMesh.castShadow = true;
        solidMesh.receiveShadow = true;
        solidMesh.matrixAutoUpdate = false;
        meshes.push(solidMesh);
        worldGroup.add(solidMesh);
      }

      const transparentGeometry = buildChunkGeometry(worldRef.current, cx, cz, true, worldMaxYRef.current);
      if (transparentGeometry) {
        const transparentMesh = new THREE.Mesh(transparentGeometry, transparentMaterial);
        transparentMesh.receiveShadow = true;
        transparentMesh.matrixAutoUpdate = false;
        meshes.push(transparentMesh);
        worldGroup.add(transparentMesh);
      }

      chunkMeshes.set(key, meshes);
    };

    const rebuildWorld = () => {
      chunkMeshes.forEach((_, key) => {
        const [cx, cz] = key.split(",").map(Number);
        disposeChunk(cx, cz);
      });
      knownChunks.forEach((key) => {
        const [cx, cz] = key.split(",").map(Number);
        buildChunk(cx, cz);
      });
    };

    rebuildWorldRef.current = rebuildWorld;

    /** Rebuilds only the chunks touched by an edit (including border neighbours). */
    const rebuildChunksAround = (x: number, z: number) => {
      const cx = Math.floor(x / CHUNK_SIZE);
      const cz = Math.floor(z / CHUNK_SIZE);
      buildChunk(cx, cz);
      const lx = x - cx * CHUNK_SIZE;
      const lz = z - cz * CHUNK_SIZE;
      if (lx === 0) buildChunk(cx - 1, cz);
      if (lx === CHUNK_SIZE - 1) buildChunk(cx + 1, cz);
      if (lz === 0) buildChunk(cx, cz - 1);
      if (lz === CHUNK_SIZE - 1) buildChunk(cx, cz + 1);
    };

    // ---------- Player state ----------
    const player = createPlayer(0.5, 20, 0.5);

    let yaw = Math.PI * 0.25;
    let pitch = -0.12;
    let flyMode = false;
    let physicsAccumulator = 0;
    const keys = new Set<string>();
    const cameraDirection = new THREE.Vector3();
    const sunDirection = new THREE.Vector3();
    const deepWaterFog = new THREE.Color(0x14486e);
    let lastFrame = performance.now();
    let frames = 0;
    let fpsTime = performance.now();
    let lastUiUpdate = 0;
    let destroyed = false;

    const generated = generateWorld(seedRef.current);
    worldRef.current = generated.world;
    worldMaxYRef.current = generated.maxY;

    const showToast = (text: string, tone: Toast["tone"] = "info") => {
      setToast({ text, tone });
    };

    const syncCamera = () => {
      camera.position.set(player.pos.x, player.pos.y + EYE_HEIGHT, player.pos.z);
    };

    const resetPlayer = () => {
      const surfaceY = getSurfaceHeight(worldRef.current, 0, 0, worldMaxYRef.current);
      player.pos.set(0.5, surfaceY + 3, 0.5);
      player.vel.set(0, 0, 0);
      player.onGround = false;
      player.coyote = 0;
      yaw = Math.PI * 0.25;
      pitch = -0.12;
      syncCamera();
    };

    resetPlayerRef.current = resetPlayer;

    const saveWorld = () => {
      const payload = {
        savedAt: new Date().toISOString(),
        seed: seedRef.current,
        blocks: Array.from(worldRef.current.entries()),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      showToast("World saved locally.", "good");
    };

    const recalcMaxY = () => {
      let maxY = 1;
      worldRef.current.forEach((_, key) => {
        const y = parseKey(key)[1];
        if (y > maxY) maxY = y;
      });
      worldMaxYRef.current = maxY;
    };

    const loadWorld = () => {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        showToast("No saved world found yet.", "warn");
        return;
      }

      try {
        const parsed = JSON.parse(raw) as { seed?: number; blocks: [string, BlockId][] };
        if (typeof parsed.seed === "number") seedRef.current = parsed.seed;
        worldRef.current = new Map(parsed.blocks);
        recalcMaxY();
        // Make sure every chunk containing blocks is known.
        worldRef.current.forEach((_, key) => {
          const [x, , z] = parseKey(key);
          knownChunks.add(`${Math.floor(x / CHUNK_SIZE)},${Math.floor(z / CHUNK_SIZE)}`);
        });
        rebuildWorld();
        resetPlayer();
        showToast("Saved world loaded.", "good");
      } catch {
        showToast("Saved world data is invalid.", "warn");
      }
    };

    const newWorld = () => {
      seedRef.current = Date.now();
      const fresh = generateWorld(seedRef.current);
      worldRef.current = fresh.world;
      worldMaxYRef.current = fresh.maxY;
      rebuildWorld();
      resetPlayer();
      showToast("Generated a fresh island world.", "good");
    };

    (window as Window & { minicraftActions?: { save: () => void; load: () => void; newWorld: () => void } }).minicraftActions = {
      save: saveWorld,
      load: loadWorld,
      newWorld,
    };

    // ---------- Block targeting ----------
    const getLookTarget = () => {
      camera.getWorldDirection(cameraDirection);
      return raycastVoxel(worldRef.current, camera.position, cameraDirection, RAY_DISTANCE);
    };

    const updateHighlight = () => {
      const hit = getLookTarget();
      if (!hit) {
        highlight.visible = false;
        return undefined;
      }

      highlight.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
      highlight.visible = true;
      return hit;
    };

    const spawnParticles = (x: number, y: number, z: number, block: BlockId) => {
      const base = new THREE.Color(BLOCKS[block].colors.side);
      for (let i = 0; i < 18; i += 1) {
        const material = new THREE.MeshLambertMaterial({ color: base.clone().multiplyScalar(0.8 + Math.random() * 0.35) });
        const mesh = new THREE.Mesh(particleGeometry, material);
        mesh.position.set(x + 0.5 + (Math.random() - 0.5) * 0.5, y + 0.5 + (Math.random() - 0.5) * 0.5, z + 0.5 + (Math.random() - 0.5) * 0.5);
        scene.add(mesh);
        particles.push({
          mesh,
          velocity: new THREE.Vector3((Math.random() - 0.5) * 4, 2 + Math.random() * 3, (Math.random() - 0.5) * 4),
          life: 0.55,
          maxLife: 0.55,
        });
      }
    };

    const breakBlock = () => {
      const hit = updateHighlight();
      if (!hit) {
        showToast("Aim at a block within reach.", "warn");
        return;
      }

      if (hit.y <= 0 && hit.block === "stone") {
        showToast("Bedrock layer protected.", "warn");
        return;
      }

      worldRef.current.delete(keyOf(hit.x, hit.y, hit.z));
      spawnParticles(hit.x, hit.y, hit.z, hit.block);
      rebuildChunksAround(hit.x, hit.z);
      audio.blip("break");
      showToast(`Mined ${BLOCKS[hit.block].name}.`, "good");
    };

    const placeBlock = () => {
      const hit = updateHighlight();
      if (!hit) {
        showToast("Aim at a face to place a block.", "warn");
        return;
      }

      const px = hit.x + hit.nx;
      const py = hit.y + hit.ny;
      const pz = hit.z + hit.nz;

      if (py < 0 || py > BUILD_MAX_Y) {
        showToast("Cannot build beyond the height limit.", "warn");
        return;
      }
      if (Math.abs(px) > WORLD_BOUND || Math.abs(pz) > WORLD_BOUND) {
        showToast("Cannot build beyond the edge of the world.", "warn");
        return;
      }

      const key = keyOf(px, py, pz);
      if (worldRef.current.has(key)) {
        showToast("That space is already occupied.", "warn");
        return;
      }

      const selectedBlock = selectedRef.current;
      worldRef.current.set(key, selectedBlock);
      if (isSolid(selectedBlock) && playerCollides(worldRef.current, player.pos.x, player.pos.y, player.pos.z)) {
        worldRef.current.delete(key);
        showToast("Cannot place a block inside yourself.", "warn");
        return;
      }

      if (py > worldMaxYRef.current) worldMaxYRef.current = py;
      rebuildChunksAround(px, pz);
      audio.blip("place");
      showToast(`Placed ${BLOCKS[selectedBlock].name}.`, "good");
    };

    // ---------- Input ----------
    const onMouseMove = (event: MouseEvent) => {
      if (document.pointerLockElement !== renderer.domElement) return;
      yaw -= event.movementX * 0.0022;
      pitch -= event.movementY * 0.0022;
      pitch = Math.max(-Math.PI / 2 + 0.04, Math.min(Math.PI / 2 - 0.04, pitch));
    };

    const onMouseDown = (event: MouseEvent) => {
      if (event.button === 2) event.preventDefault();
      const clickedCanvas = event.target === renderer.domElement;
      if (document.pointerLockElement !== renderer.domElement) {
        if (clickedCanvas) {
          renderer.domElement.requestPointerLock().catch(() => showToast("Pointer lock was blocked by the browser.", "warn"));
        }
        return;
      }
      if (event.button === 0) breakBlock();
      if (event.button === 2) placeBlock();
    };

    const onContextMenu = (event: MouseEvent) => event.preventDefault();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space" && document.pointerLockElement === renderer.domElement) {
        event.preventDefault();
      }
      keys.add(event.code);

      if (event.code.startsWith("Digit")) {
        const index = Number(event.code.slice(5)) - 1;
        const block = HOTBAR[index];
        if (block) {
          setSelected(block);
          showToast(`Selected ${BLOCKS[block].name}.`, "info");
        }
      }

      if (event.code === "KeyH") setShowHelp((value) => !value);
      if (event.code === "KeyR") {
        resetPlayer();
        showToast("Player reset to spawn.", "info");
      }
      if (event.code === "KeyF") {
        flyMode = !flyMode;
        player.vel.set(0, 0, 0);
        showToast(flyMode ? "Creative flight enabled." : "Creative flight disabled.", "info");
      }
      if (event.code === "KeyP") saveWorld();
      if (event.code === "KeyL") loadWorld();
    };

    const onKeyUp = (event: KeyboardEvent) => {
      keys.delete(event.code);
    };

    const onPointerLockChange = () => {
      const isLocked = document.pointerLockElement === renderer.domElement;
      setLocked(isLocked);
      if (!isLocked) keys.clear(); // avoid stuck keys when focus is lost
    };

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
      renderer.setSize(window.innerWidth, window.innerHeight);
    };

    // ---------- Physics ----------
    const collectInput = (): PlayerInput => ({
      forward: keys.has("KeyW"),
      back: keys.has("KeyS"),
      left: keys.has("KeyA"),
      right: keys.has("KeyD"),
      jump: keys.has("Space"),
      sprint: keys.has("ShiftLeft") || keys.has("ShiftRight"),
      yaw,
      fly: flyMode,
    });

    const physicsHooks: PhysicsHooks = {
      onJump: () => audio.blip("jump"),
      onLand: () => audio.blip("step"),
      onSplash: () => audio.blip("splash"),
      onStep: (speed) => audio.step(speed),
      onVoid: () => {
        resetPlayer();
        showToast("You fell out of the world. Respawned!", "warn");
      },
    };

    const updateParticles = (dt: number) => {
      for (let i = particles.length - 1; i >= 0; i -= 1) {
        const particle = particles[i];
        particle.life -= dt;
        particle.velocity.y -= 9.8 * dt;
        particle.mesh.position.addScaledVector(particle.velocity, dt);
        particle.mesh.rotation.x += dt * 8;
        particle.mesh.rotation.y += dt * 10;
        const material = particle.mesh.material as THREE.MeshLambertMaterial;
        material.opacity = Math.max(0, particle.life / particle.maxLife);
        material.transparent = true;
        if (particle.life <= 0) {
          scene.remove(particle.mesh);
          material.dispose();
          particles.splice(i, 1);
        }
      }
    };

    const renderFrame = (now: number) => {
      if (destroyed) return;
      const dt = Math.min((now - lastFrame) / 1000, 0.1);
      lastFrame = now;
      frames += 1;

      // Fixed-timestep physics — behaves identically at any frame rate.
      physicsAccumulator = Math.min(physicsAccumulator + dt, 0.25);
      while (physicsAccumulator >= PHYSICS_STEP) {
        simulatePlayerStep(worldRef.current, player, collectInput(), PHYSICS_STEP, physicsHooks);
        physicsAccumulator -= PHYSICS_STEP;
      }
      syncCamera();

      // Day/night cycle with a shadow camera that follows the player.
      const dayCycle = now * 0.000035;
      const sunOrbX = Math.cos(dayCycle) * 58;
      const sunOrbY = Math.sin(dayCycle) * 38 + 34;
      sunDirection.set(sunOrbX, Math.max(sunOrbY, 10), 24).normalize();

      const anchorX = Math.round(player.pos.x);
      const anchorZ = Math.round(player.pos.z);
      shadowTarget.position.set(anchorX, 0, anchorZ);
      sunLight.position.set(anchorX + sunDirection.x * 110, sunDirection.y * 110, anchorZ + sunDirection.z * 110);
      sun.position.copy(player.pos).addScaledVector(sunDirection, 170);
      sunLight.intensity = THREE.MathUtils.clamp((sunOrbY - 2) / 18, 0.25, 2.35);
      hemiLight.intensity = THREE.MathUtils.clamp((sunOrbY + 20) / 26, 0.7, 2.2);

      const sky = new THREE.Color().lerpColors(
        new THREE.Color(0x17213a),
        new THREE.Color(0x8ed3ff),
        THREE.MathUtils.clamp((sunOrbY + 6) / 42, 0, 1),
      );
      renderer.setClearColor(sky);

      // Underwater view: denser, bluer fog.
      if (player.eyeInWater) {
        skyFog.color.copy(deepWaterFog);
        skyFog.near = 1;
        skyFog.far = 24;
      } else {
        skyFog.color.copy(sky);
        skyFog.near = 45;
        skyFog.far = 135;
      }

      camera.rotation.set(pitch, yaw, 0, "YXZ");
      updateHighlight();
      updateParticles(dt);
      renderer.render(scene, camera);

      if (now - fpsTime > 500) {
        const fps = Math.round((frames * 1000) / (now - fpsTime));
        frames = 0;
        fpsTime = now;
        if (now - lastUiUpdate > 220) {
          lastUiUpdate = now;
          setStats({
            fps,
            mode: flyMode ? "Creative Flight" : player.inWater ? "Swimming" : "Creative",
          });
        }
      }

      requestAnimationFrame(renderFrame);
    };

    rebuildWorld();
    resetPlayer();
    window.addEventListener("resize", onResize);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    document.addEventListener("pointerlockchange", onPointerLockChange);
    requestAnimationFrame(renderFrame);

    return () => {
      destroyed = true;
      window.removeEventListener("resize", onResize);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      document.removeEventListener("pointerlockchange", onPointerLockChange);
      mount.removeChild(renderer.domElement);
      particles.forEach((particle) => {
        scene.remove(particle.mesh);
        (particle.mesh.material as THREE.Material).dispose();
      });
      particleGeometry.dispose();
      chunkMeshes.forEach((_, key) => {
        const [cx, cz] = key.split(",").map(Number);
        disposeChunk(cx, cz);
      });
      solidMaterial.dispose();
      transparentMaterial.dispose();
      highlight.geometry.dispose();
      (highlight.material as THREE.Material).dispose();
      sun.geometry.dispose();
      (sun.material as THREE.Material).dispose();
      renderer.dispose();
      delete (window as Window & { minicraftActions?: unknown }).minicraftActions;
    };
  }, []);

  const runAction = (action: "save" | "load" | "newWorld") => {
    const actions = (window as Window & { minicraftActions?: Record<typeof action, () => void> }).minicraftActions;
    actions?.[action]?.();
  };

  return (
    <main className="app-shell">
      <div ref={mountRef} className="viewport" />

      <div className="vignette" />
      <div className="crosshair" aria-hidden="true">
        <span />
        <span />
      </div>

      {!locked && (
        <section className="start-card">
          <div className="badge">MINICRAFT PRO</div>
          <h1>Build, mine, and explore</h1>
          <p>
            A huge island world with oceans, rivers, forests, deserts, and mountains. Click the world to lock your mouse —
            left click mines blocks, right click places blocks, number keys switch materials.
          </p>
          <button type="button" onClick={() => document.querySelector<HTMLCanvasElement>(".game-canvas")?.requestPointerLock()}>
            Enter world
          </button>
        </section>
      )}

      <aside className="hud top-left">
        <span>{stats.fps} FPS</span>
        <span>Mode: {stats.mode}</span>
      </aside>

      <aside className="hud top-right">
        <button type="button" onClick={() => runAction("save")}>Save</button>
        <button type="button" onClick={() => runAction("load")}>Load</button>
        <button type="button" onClick={() => runAction("newWorld")}>New World</button>
      </aside>

      {showHelp && (
        <aside className="help-panel">
          <strong>Controls</strong>
          <span>WASD move · Mouse look · Shift sprint</span>
          <span>Space jump · swim in water · F fly</span>
          <span>Left click mine · Right click place</span>
          <span>1-9 select block · R respawn</span>
          <span>P save · L load · H hide help</span>
          <span>Walk into low ledges to auto-step up</span>
        </aside>
      )}

      <div className={`toast ${toast.tone}`}>{toast.text}</div>

      <nav className="hotbar" aria-label="Block hotbar">
        {HOTBAR.map((block, index) => (
          <button
            className={`slot ${selected === block ? "active" : ""}`}
            key={block}
            type="button"
            onClick={() => setSelected(block)}
            title={`${index + 1}. ${BLOCKS[block].name}`}
          >
            <span className="key">{index + 1}</span>
            <span className="icon">{BLOCKS[block].icon}</span>
            <small>{BLOCKS[block].name}</small>
          </button>
        ))}
      </nav>
    </main>
  );
};

export default App;
