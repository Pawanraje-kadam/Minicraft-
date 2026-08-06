import * as THREE from 'three';

export enum BlockType {
  Grass = 1,
  Dirt = 2,
  Stone = 3,
  Wood = 4,
  Planks = 5,
  Brick = 6,
  Sand = 7,
  Glass = 8,
  Water = 9,
  Cobblestone = 10,
  Leaves = 11,
  Snow = 12,
}

export interface BlockInfo {
  type: BlockType;
  name: string;
  color: number;       // Primary / top-face color
  sideColor: number;   // Side-face tint
  bottomColor: number; // Bottom-face tint
  opacity: number;
  emoji: string;
  roughness: number;
}

// Minecraft-accurate colours sourced from the actual game palette
export const BLOCK_DEFS: Record<BlockType, BlockInfo> = {
  [BlockType.Grass]: {
    type: BlockType.Grass, name: 'Grass',
    color: 0x7CBD6B,       // bright grass-green top
    sideColor: 0x6B8E3A,   // side: dirt with grass fringe
    bottomColor: 0x8B6A42,  // bottom: dirt
    opacity: 1, emoji: '🌿', roughness: 0.95,
  },
  [BlockType.Dirt]: {
    type: BlockType.Dirt, name: 'Dirt',
    color: 0x8B6A42,
    sideColor: 0x7D5E38,
    bottomColor: 0x6B4E30,
    opacity: 1, emoji: '🟫', roughness: 1.0,
  },
  [BlockType.Stone]: {
    type: BlockType.Stone, name: 'Stone',
    color: 0x7F7F7F,
    sideColor: 0x7A7A7A,
    bottomColor: 0x6E6E6E,
    opacity: 1, emoji: '🪨', roughness: 0.85,
  },
  [BlockType.Wood]: {
    type: BlockType.Wood, name: 'Oak Log',
    color: 0x9C7D4A,       // log cross-section (top)
    sideColor: 0x6B5030,    // bark side
    bottomColor: 0x9C7D4A,
    opacity: 1, emoji: '🪵', roughness: 0.9,
  },
  [BlockType.Planks]: {
    type: BlockType.Planks, name: 'Oak Planks',
    color: 0xBC9862,
    sideColor: 0xBC9862,
    bottomColor: 0xA88854,
    opacity: 1, emoji: '🪵', roughness: 0.8,
  },
  [BlockType.Brick]: {
    type: BlockType.Brick, name: 'Brick',
    color: 0x966452,
    sideColor: 0x966452,
    bottomColor: 0x845844,
    opacity: 1, emoji: '🧱', roughness: 0.75,
  },
  [BlockType.Sand]: {
    type: BlockType.Sand, name: 'Sand',
    color: 0xDBCFA3,
    sideColor: 0xD4C498,
    bottomColor: 0xC8B888,
    opacity: 1, emoji: '🏖️', roughness: 1.0,
  },
  [BlockType.Glass]: {
    type: BlockType.Glass, name: 'Glass',
    color: 0xC0D8E8,
    sideColor: 0xC0D8E8,
    bottomColor: 0xC0D8E8,
    opacity: 0.35, emoji: '🪟', roughness: 0.1,
  },
  [BlockType.Water]: {
    type: BlockType.Water, name: 'Water',
    color: 0x3F76E4,
    sideColor: 0x3468CC,
    bottomColor: 0x2856A8,
    opacity: 0.55, emoji: '💧', roughness: 0.2,
  },
  [BlockType.Cobblestone]: {
    type: BlockType.Cobblestone, name: 'Cobblestone',
    color: 0x7A7A7A,
    sideColor: 0x6F6F6F,
    bottomColor: 0x636363,
    opacity: 1, emoji: '⬛', roughness: 0.95,
  },
  [BlockType.Leaves]: {
    type: BlockType.Leaves, name: 'Oak Leaves',
    color: 0x4A7A2E,
    sideColor: 0x3E6A26,
    bottomColor: 0x365E20,
    opacity: 0.92, emoji: '🍃', roughness: 0.9,
  },
  [BlockType.Snow]: {
    type: BlockType.Snow, name: 'Snow',
    color: 0xFAFAFA,
    sideColor: 0xF0F0F0,
    bottomColor: 0xE0E0E4,
    opacity: 1, emoji: '❄️', roughness: 0.7,
  },
};

export const ALL_BLOCK_TYPES = Object.values(BLOCK_DEFS);

export const WORLD_SIZE = 100;

export interface GameState {
  isPaused: boolean;
  isStartScreen: boolean;
  isGameOver: boolean;
  score: number;
  blocksPlaced: number;
  blocksRemoved: number;
  selectedBlockIndex: number;
  gravityEnabled: boolean;
  fps: number;
}

export interface ParticleData {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  color: number;
  life: number;
  maxLife: number;
  size: number;
}
