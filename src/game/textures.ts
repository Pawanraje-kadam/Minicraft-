import * as THREE from 'three';
import { BlockType, BLOCK_DEFS } from './types';

// Deterministic seeded random for consistent textures
function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function hexToRgb(hex: number): [number, number, number] {
  return [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff];
}

function colorShift(r: number, g: number, b: number, amount: number, rng: () => number): [number, number, number] {
  return [
    Math.max(0, Math.min(255, r + (rng() - 0.5) * amount)),
    Math.max(0, Math.min(255, g + (rng() - 0.5) * amount)),
    Math.max(0, Math.min(255, b + (rng() - 0.5) * amount)),
  ];
}

function fillNoisy(
  ctx: CanvasRenderingContext2D,
  size: number,
  baseR: number, baseG: number, baseB: number,
  noiseAmount: number,
  pixelSize: number,
  rng: () => number,
) {
  for (let py = 0; py < size; py += pixelSize) {
    for (let px = 0; px < size; px += pixelSize) {
      const [r, g, b] = colorShift(baseR, baseG, baseB, noiseAmount, rng);
      ctx.fillStyle = `rgb(${r|0},${g|0},${b|0})`;
      ctx.fillRect(px, py, pixelSize, pixelSize);
    }
  }
}

function createBlockTexture(type: BlockType, face: 'top' | 'side' | 'bottom'): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rng = seededRandom(type * 1000 + (face === 'top' ? 1 : face === 'side' ? 2 : 3));

  const def = BLOCK_DEFS[type];
  const faceColor = face === 'top' ? def.color : face === 'side' ? def.sideColor : def.bottomColor;
  const [br, bg, bb] = hexToRgb(faceColor);

  switch (type) {
    case BlockType.Grass: {
      if (face === 'top') {
        // Lush grass top with pixel variation
        fillNoisy(ctx, size, br, bg, bb, 28, 4, rng);
        // Darker grass patches
        for (let i = 0; i < 40; i++) {
          const x = (rng() * size) | 0;
          const y = (rng() * size) | 0;
          ctx.fillStyle = `rgba(50,90,30,${0.15 + rng() * 0.15})`;
          ctx.fillRect(x, y, 4 + (rng() * 4) | 0, 4);
        }
        // Bright highlights
        for (let i = 0; i < 25; i++) {
          const x = (rng() * size) | 0;
          const y = (rng() * size) | 0;
          ctx.fillStyle = `rgba(150,210,90,${0.1 + rng() * 0.12})`;
          ctx.fillRect(x, y, 2 + (rng() * 3) | 0, 2);
        }
      } else if (face === 'side') {
        // Dirt with a strip of grass on top
        const [dr, dg, db] = hexToRgb(0x8B6A42);
        fillNoisy(ctx, size, dr, dg, db, 20, 4, rng);
        // Grass fringe at top ~20%
        for (let py = 0; py < size * 0.22; py += 4) {
          for (let px = 0; px < size; px += 4) {
            const fade = 1 - py / (size * 0.22);
            if (rng() < fade * 0.85) {
              const [r, g, b] = colorShift(br, bg, bb, 20, rng);
              ctx.fillStyle = `rgb(${r|0},${g|0},${b|0})`;
              ctx.fillRect(px, py, 4, 4);
            }
          }
        }
        // Dirt speckles
        for (let i = 0; i < 20; i++) {
          const x = (rng() * size) | 0;
          const y = (size * 0.2 + rng() * size * 0.8) | 0;
          ctx.fillStyle = `rgba(100,70,40,${0.2 + rng() * 0.2})`;
          ctx.fillRect(x, y, 3, 3);
        }
      } else {
        // Bottom is plain dirt
        const [dr, dg, db] = hexToRgb(def.bottomColor);
        fillNoisy(ctx, size, dr, dg, db, 18, 4, rng);
      }
      break;
    }

    case BlockType.Dirt: {
      fillNoisy(ctx, size, br, bg, bb, 22, 4, rng);
      // Darker clumps
      for (let i = 0; i < 25; i++) {
        const x = (rng() * size) | 0;
        const y = (rng() * size) | 0;
        ctx.fillStyle = `rgba(80,55,30,${0.2 + rng() * 0.2})`;
        ctx.fillRect(x, y, 4 + (rng() * 6) | 0, 3 + (rng() * 4) | 0);
      }
      // Small pebble highlights
      for (let i = 0; i < 12; i++) {
        const x = (rng() * size) | 0;
        const y = (rng() * size) | 0;
        ctx.fillStyle = `rgba(160,130,90,${0.15 + rng() * 0.1})`;
        ctx.fillRect(x, y, 2, 2);
      }
      break;
    }

    case BlockType.Stone: {
      fillNoisy(ctx, size, br, bg, bb, 18, 4, rng);
      // Large irregular grey patches
      for (let i = 0; i < 8; i++) {
        const x = (rng() * size) | 0;
        const y = (rng() * size) | 0;
        const shade = 90 + (rng() * 50) | 0;
        ctx.fillStyle = `rgba(${shade},${shade},${shade},0.25)`;
        const w = 8 + (rng() * 20) | 0;
        const h = 6 + (rng() * 14) | 0;
        ctx.fillRect(x, y, w, h);
      }
      // Thin crack lines
      ctx.strokeStyle = 'rgba(50,50,50,0.18)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(rng() * size, rng() * size);
        ctx.lineTo(rng() * size, rng() * size);
        ctx.stroke();
      }
      break;
    }

    case BlockType.Wood: {
      if (face === 'top' || face === 'bottom') {
        // Cross-section — rings
        const [cr, cg, cb] = hexToRgb(def.color);
        fillNoisy(ctx, size, cr, cg, cb, 15, 4, rng);
        // Concentric rings
        const cx = size / 2, cy = size / 2;
        ctx.strokeStyle = 'rgba(90,60,30,0.3)';
        ctx.lineWidth = 2;
        for (let r = 6; r < size / 2; r += 6 + (rng() * 4) | 0) {
          ctx.beginPath();
          ctx.arc(cx + (rng()-0.5)*4, cy + (rng()-0.5)*4, r, 0, Math.PI * 2);
          ctx.stroke();
        }
        // Dark center
        ctx.fillStyle = 'rgba(60,35,15,0.4)';
        ctx.beginPath();
        ctx.arc(cx, cy, 4, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Bark side
        const [sr, sg, sb] = hexToRgb(def.sideColor);
        fillNoisy(ctx, size, sr, sg, sb, 18, 4, rng);
        // Vertical bark lines
        ctx.strokeStyle = 'rgba(45,28,12,0.3)';
        ctx.lineWidth = 2;
        for (let x = 4; x < size; x += 7 + (rng() * 5) | 0) {
          ctx.beginPath();
          ctx.moveTo(x + (rng()-0.5)*3, 0);
          ctx.bezierCurveTo(
            x + (rng()-0.5)*6, size*0.33,
            x + (rng()-0.5)*6, size*0.66,
            x + (rng()-0.5)*3, size
          );
          ctx.stroke();
        }
        // Horizontal knot marks
        for (let i = 0; i < 3; i++) {
          const x = (rng() * size) | 0;
          const y = (rng() * size) | 0;
          ctx.fillStyle = `rgba(80,50,25,${0.2 + rng()*0.15})`;
          ctx.fillRect(x, y, 8 + (rng()*6)|0, 2);
        }
      }
      break;
    }

    case BlockType.Planks: {
      fillNoisy(ctx, size, br, bg, bb, 16, 4, rng);
      // Horizontal plank lines
      ctx.strokeStyle = 'rgba(100,70,35,0.35)';
      ctx.lineWidth = 2;
      const plankH = size / 4;
      for (let i = 1; i < 4; i++) {
        const y = i * plankH;
        ctx.beginPath();
        ctx.moveTo(0, y + (rng()-0.5)*2);
        ctx.lineTo(size, y + (rng()-0.5)*2);
        ctx.stroke();
      }
      // Vertical joins – staggered
      for (let row = 0; row < 4; row++) {
        const offset = row % 2 === 0 ? size * 0.4 : size * 0.65;
        ctx.beginPath();
        ctx.moveTo(offset, row * plankH + 1);
        ctx.lineTo(offset, (row + 1) * plankH - 1);
        ctx.stroke();
      }
      // Wood grain
      ctx.strokeStyle = 'rgba(140,100,55,0.12)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 10; i++) {
        const y = rng() * size;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(size, y + (rng()-0.5)*4);
        ctx.stroke();
      }
      break;
    }

    case BlockType.Brick: {
      // Mortar base
      fillNoisy(ctx, size, 185, 175, 160, 10, 4, rng);
      // Draw bricks in a staggered pattern
      const brickH = size / 4;
      const brickW = size / 2;
      const mortar = 3;
      for (let row = 0; row < 4; row++) {
        const offset = row % 2 === 0 ? 0 : -brickW / 2;
        for (let col = -1; col < 3; col++) {
          const x = offset + col * brickW + mortar / 2;
          const y = row * brickH + mortar / 2;
          const w = brickW - mortar;
          const h = brickH - mortar;
          // Each brick with slight colour variation
          const [r, g, b] = colorShift(br, bg, bb, 20, rng);
          ctx.fillStyle = `rgb(${r|0},${g|0},${b|0})`;
          ctx.fillRect(x, y, w, h);
          // Subtle highlight on top edge
          ctx.fillStyle = 'rgba(255,200,180,0.08)';
          ctx.fillRect(x, y, w, 2);
          // Shadow on bottom edge
          ctx.fillStyle = 'rgba(0,0,0,0.1)';
          ctx.fillRect(x, y + h - 2, w, 2);
        }
      }
      break;
    }

    case BlockType.Sand: {
      fillNoisy(ctx, size, br, bg, bb, 20, 2, rng);
      // Scattered darker grains
      for (let i = 0; i < 100; i++) {
        const x = (rng() * size) | 0;
        const y = (rng() * size) | 0;
        const shade = rng() > 0.5 ? 'rgba(180,160,110,0.3)' : 'rgba(230,215,175,0.25)';
        ctx.fillStyle = shade;
        ctx.fillRect(x, y, 2, 2);
      }
      break;
    }

    case BlockType.Glass: {
      // Very light transparent tinted base
      ctx.fillStyle = `rgba(192,216,232,0.15)`;
      ctx.fillRect(0, 0, size, size);
      // Border frame
      ctx.strokeStyle = 'rgba(160,200,220,0.5)';
      ctx.lineWidth = 3;
      ctx.strokeRect(3, 3, size - 6, size - 6);
      // Inner cross-brace (like Minecraft glass)
      ctx.strokeStyle = 'rgba(160,200,220,0.25)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(3, 3); ctx.lineTo(size - 3, size - 3);
      ctx.moveTo(size - 3, 3); ctx.lineTo(3, size - 3);
      ctx.stroke();
      // Corner highlight
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath();
      ctx.moveTo(6, 6); ctx.lineTo(28, 6); ctx.lineTo(6, 28); ctx.closePath();
      ctx.fill();
      break;
    }

    case BlockType.Water: {
      fillNoisy(ctx, size, br, bg, bb, 25, 4, rng);
      // Wave-like lighter strips
      ctx.strokeStyle = 'rgba(100,160,255,0.3)';
      ctx.lineWidth = 3;
      for (let row = 0; row < 6; row++) {
        const y = row * (size / 6) + 8;
        ctx.beginPath();
        for (let x = 0; x <= size; x += 4) {
          const wave = Math.sin(x * 0.08 + row * 1.2) * 5;
          if (x === 0) ctx.moveTo(x, y + wave);
          else ctx.lineTo(x, y + wave);
        }
        ctx.stroke();
      }
      // Bright sparkle spots
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = 'rgba(180,220,255,0.2)';
        const x = (rng() * size) | 0;
        const y = (rng() * size) | 0;
        ctx.fillRect(x, y, 3, 3);
      }
      break;
    }

    case BlockType.Cobblestone: {
      // Base grey
      fillNoisy(ctx, size, br, bg, bb, 15, 4, rng);
      // Irregular cobble shapes with depth
      for (let i = 0; i < 18; i++) {
        const cx = (rng() * size) | 0;
        const cy = (rng() * size) | 0;
        const w = 8 + (rng() * 16) | 0;
        const h = 6 + (rng() * 12) | 0;
        const shade = 70 + (rng() * 60) | 0;
        // Stone body
        ctx.fillStyle = `rgb(${shade},${shade},${shade + 5 | 0})`;
        ctx.fillRect(cx, cy, w, h);
        // Top highlight
        ctx.fillStyle = `rgba(255,255,255,0.06)`;
        ctx.fillRect(cx, cy, w, 2);
        // Bottom shadow
        ctx.fillStyle = `rgba(0,0,0,0.12)`;
        ctx.fillRect(cx, cy + h - 2, w, 2);
      }
      // Mortar cracks
      ctx.strokeStyle = 'rgba(50,50,50,0.12)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.moveTo(rng()*size, rng()*size);
        ctx.lineTo(rng()*size, rng()*size);
        ctx.stroke();
      }
      break;
    }

    case BlockType.Leaves: {
      fillNoisy(ctx, size, br, bg, bb, 30, 4, rng);
      // Leafy cluster blobs
      for (let i = 0; i < 35; i++) {
        const x = (rng() * size) | 0;
        const y = (rng() * size) | 0;
        const dark = rng() > 0.5;
        ctx.fillStyle = dark
          ? `rgba(30,80,20,${0.2 + rng()*0.15})`
          : `rgba(90,160,50,${0.15 + rng()*0.12})`;
        const r = 3 + (rng() * 5) | 0;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      // Tiny gaps / sky-through holes
      for (let i = 0; i < 10; i++) {
        ctx.fillStyle = 'rgba(120,185,232,0.08)';
        const x = (rng() * size) | 0;
        const y = (rng() * size) | 0;
        ctx.fillRect(x, y, 2, 2);
      }
      break;
    }

    case BlockType.Snow: {
      fillNoisy(ctx, size, br, bg, bb, 8, 2, rng);
      // Subtle blue shadows
      for (let i = 0; i < 15; i++) {
        ctx.fillStyle = `rgba(200,210,240,${0.08 + rng()*0.06})`;
        const x = (rng() * size) | 0;
        const y = (rng() * size) | 0;
        ctx.fillRect(x, y, 6 + (rng()*8)|0, 4 + (rng()*4)|0);
      }
      // Bright sparkle
      for (let i = 0; i < 12; i++) {
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        const x = (rng() * size) | 0;
        const y = (rng() * size) | 0;
        ctx.fillRect(x, y, 1, 1);
      }
      break;
    }

    default: {
      ctx.fillStyle = `rgb(${br},${bg},${bb})`;
      ctx.fillRect(0, 0, size, size);
    }
  }

  // Subtle ambient occlusion edge vignette for all faces
  // Top/bottom edges
  const edgeGradV = ctx.createLinearGradient(0, 0, 0, size);
  edgeGradV.addColorStop(0, 'rgba(255,255,255,0.04)');
  edgeGradV.addColorStop(0.15, 'rgba(0,0,0,0)');
  edgeGradV.addColorStop(0.85, 'rgba(0,0,0,0)');
  edgeGradV.addColorStop(1, 'rgba(0,0,0,0.06)');
  ctx.fillStyle = edgeGradV;
  ctx.fillRect(0, 0, size, size);
  // Left/right edges
  const edgeGradH = ctx.createLinearGradient(0, 0, size, 0);
  edgeGradH.addColorStop(0, 'rgba(0,0,0,0.03)');
  edgeGradH.addColorStop(0.15, 'rgba(0,0,0,0)');
  edgeGradH.addColorStop(0.85, 'rgba(0,0,0,0)');
  edgeGradH.addColorStop(1, 'rgba(0,0,0,0.03)');
  ctx.fillStyle = edgeGradH;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Cache: blockType -> { top, side, bottom }
const textureCache: Map<BlockType, { top: THREE.CanvasTexture; side: THREE.CanvasTexture; bottom: THREE.CanvasTexture }> = new Map();

export function getBlockTextures(type: BlockType): { top: THREE.CanvasTexture; side: THREE.CanvasTexture; bottom: THREE.CanvasTexture } {
  if (!textureCache.has(type)) {
    textureCache.set(type, {
      top: createBlockTexture(type, 'top'),
      side: createBlockTexture(type, 'side'),
      bottom: createBlockTexture(type, 'bottom'),
    });
  }
  return textureCache.get(type)!;
}
