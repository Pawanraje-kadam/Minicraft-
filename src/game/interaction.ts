import * as THREE from 'three';
import { World } from './world';
import { BlockType } from './types';

const REACH_DISTANCE = 8;

export interface RaycastResult {
  blockPos: THREE.Vector3;
  faceNormal: THREE.Vector3;
  distance: number;
}

export class Interaction {
  /**
   * Custom voxel raycast using DDA algorithm for accuracy
   */
  raycastBlock(camera: THREE.PerspectiveCamera, world: World): RaycastResult | null {
    const origin = camera.position.clone();
    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);

    // DDA voxel traversal
    let x = Math.floor(origin.x);
    let y = Math.floor(origin.y);
    let z = Math.floor(origin.z);

    const stepX = direction.x >= 0 ? 1 : -1;
    const stepY = direction.y >= 0 ? 1 : -1;
    const stepZ = direction.z >= 0 ? 1 : -1;

    const tDeltaX = direction.x !== 0 ? Math.abs(1 / direction.x) : Infinity;
    const tDeltaY = direction.y !== 0 ? Math.abs(1 / direction.y) : Infinity;
    const tDeltaZ = direction.z !== 0 ? Math.abs(1 / direction.z) : Infinity;

    let tMaxX = direction.x !== 0 
      ? ((direction.x >= 0 ? (x + 1 - origin.x) : (origin.x - x)) / Math.abs(direction.x)) 
      : Infinity;
    let tMaxY = direction.y !== 0 
      ? ((direction.y >= 0 ? (y + 1 - origin.y) : (origin.y - y)) / Math.abs(direction.y)) 
      : Infinity;
    let tMaxZ = direction.z !== 0 
      ? ((direction.z >= 0 ? (z + 1 - origin.z) : (origin.z - z)) / Math.abs(direction.z)) 
      : Infinity;

    const faceNormal = new THREE.Vector3();
    let steps = 0;
    const maxSteps = Math.ceil(REACH_DISTANCE * 3);

    while (steps < maxSteps) {
      // Check if current voxel has a block (skip the one the player is standing in)
      if (world.hasBlock(x, y, z)) {
        const blockCenter = new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5);
        const distance = origin.distanceTo(blockCenter);
        if (distance <= REACH_DISTANCE && steps > 0) {
          return {
            blockPos: new THREE.Vector3(x, y, z),
            faceNormal: faceNormal.clone(),
            distance,
          };
        }
      }

      // Step to next voxel
      if (tMaxX < tMaxY) {
        if (tMaxX < tMaxZ) {
          x += stepX;
          tMaxX += tDeltaX;
          faceNormal.set(-stepX, 0, 0);
        } else {
          z += stepZ;
          tMaxZ += tDeltaZ;
          faceNormal.set(0, 0, -stepZ);
        }
      } else {
        if (tMaxY < tMaxZ) {
          y += stepY;
          tMaxY += tDeltaY;
          faceNormal.set(0, -stepY, 0);
        } else {
          z += stepZ;
          tMaxZ += tDeltaZ;
          faceNormal.set(0, 0, -stepZ);
        }
      }

      // Check if we've gone too far
      const currentDist = Math.min(tMaxX - tDeltaX, tMaxY - tDeltaY, tMaxZ - tDeltaZ);
      if (currentDist > REACH_DISTANCE) break;
      
      steps++;
    }

    return null;
  }

  placeBlock(world: World, hit: RaycastResult, blockType: BlockType, playerPos?: THREE.Vector3): boolean {
    const placePos = hit.blockPos.clone().add(hit.faceNormal);
    const px = Math.floor(placePos.x);
    const py = Math.floor(placePos.y);
    const pz = Math.floor(placePos.z);
    
    if (!world.inBounds(px, py, pz)) return false;
    if (world.hasBlock(px, py, pz)) return false;

    // Prevent placing blocks where the player is standing
    if (playerPos) {
      const playerBlockX = Math.floor(playerPos.x);
      const playerBlockY = Math.floor(playerPos.y);
      const playerBlockZ = Math.floor(playerPos.z);
      if (px === playerBlockX && pz === playerBlockZ && 
          (py === playerBlockY || py === playerBlockY - 1)) {
        return false;
      }
    }

    return world.setBlock(px, py, pz, blockType);
  }

  removeBlock(world: World, hit: RaycastResult): BlockType | undefined {
    const bx = Math.floor(hit.blockPos.x);
    const by = Math.floor(hit.blockPos.y);
    const bz = Math.floor(hit.blockPos.z);
    return world.removeBlock(bx, by, bz);
  }
}
