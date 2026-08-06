import * as THREE from 'three';
import { WORLD_SIZE } from './types';
import { World } from './world';

const MOVE_SPEED = 10;
const FLY_SPEED = 8;
const MOUSE_SENSITIVITY = 0.002;
const GRAVITY = 20;
const JUMP_SPEED = 8;
const PLAYER_HEIGHT = 1.7;
const PLAYER_RADIUS = 0.3;

export class Player {
  camera: THREE.PerspectiveCamera;
  
  private yaw = 0;
  private pitch = 0;
  private velocity = new THREE.Vector3();
  private onGround = false;

  // Input state
  keys: Set<string> = new Set();
  gravityEnabled = false;

  // Mobile controls
  private touchMoveId: number | null = null;
  private touchLookId: number | null = null;
  private touchMoveStart = { x: 0, y: 0 };
  private touchLookStart = { x: 0, y: 0 };
  touchMoveDir = { x: 0, y: 0 };
  touchLookDelta = { x: 0, y: 0 };

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.camera.position.set(WORLD_SIZE / 2, 4, WORLD_SIZE / 2 + 8);
    this.yaw = 0;
    this.pitch = 0;
    this.updateCameraRotation();
  }

  onMouseMove(dx: number, dy: number) {
    this.yaw -= dx * MOUSE_SENSITIVITY;
    this.pitch -= dy * MOUSE_SENSITIVITY;
    this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch));
    this.updateCameraRotation();
  }

  private updateCameraRotation() {
    const euler = new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(euler);
  }

  update(dt: number, world: World) {
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();

    const right = new THREE.Vector3();
    right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

    let moveX = 0;
    let moveZ = 0;
    let moveY = 0;

    // Keyboard
    if (this.keys.has('w') || this.keys.has('arrowup')) { moveX += forward.x; moveZ += forward.z; }
    if (this.keys.has('s') || this.keys.has('arrowdown')) { moveX -= forward.x; moveZ -= forward.z; }
    if (this.keys.has('a') || this.keys.has('arrowleft')) { moveX -= right.x; moveZ -= right.z; }
    if (this.keys.has('d') || this.keys.has('arrowright')) { moveX += right.x; moveZ += right.z; }

    // Mobile touch
    if (this.touchMoveDir.x !== 0 || this.touchMoveDir.y !== 0) {
      moveX += forward.x * (-this.touchMoveDir.y) + right.x * this.touchMoveDir.x;
      moveZ += forward.z * (-this.touchMoveDir.y) + right.z * this.touchMoveDir.x;
    }

    // Touch look
    if (this.touchLookDelta.x !== 0 || this.touchLookDelta.y !== 0) {
      this.onMouseMove(this.touchLookDelta.x * 0.5, this.touchLookDelta.y * 0.5);
      this.touchLookDelta.x = 0;
      this.touchLookDelta.y = 0;
    }

    // Normalize horizontal movement
    const horizLen = Math.sqrt(moveX * moveX + moveZ * moveZ);
    if (horizLen > 0) {
      moveX /= horizLen;
      moveZ /= horizLen;
    }

    if (this.gravityEnabled) {
      // Gravity mode
      this.velocity.x = moveX * MOVE_SPEED;
      this.velocity.z = moveZ * MOVE_SPEED;
      this.velocity.y -= GRAVITY * dt;

      if (this.onGround && (this.keys.has(' ') || this.keys.has('space'))) {
        this.velocity.y = JUMP_SPEED;
        this.onGround = false;
      }

      // Move with collision
      const newPos = this.camera.position.clone();
      newPos.x += this.velocity.x * dt;
      newPos.y += this.velocity.y * dt;
      newPos.z += this.velocity.z * dt;

      // Simple collision check
      this.onGround = false;
      const feetY = Math.floor(newPos.y - PLAYER_HEIGHT);
      const blockX = Math.floor(newPos.x);
      const blockZ = Math.floor(newPos.z);

      if (feetY >= 0 && world.hasBlock(blockX, feetY, blockZ)) {
        newPos.y = feetY + 1 + PLAYER_HEIGHT;
        this.velocity.y = 0;
        this.onGround = true;
      }

      // Horizontal collision
      for (let dy = 0; dy < 2; dy++) {
        const checkY = Math.floor(newPos.y - PLAYER_HEIGHT + dy);
        if (world.hasBlock(Math.floor(newPos.x + PLAYER_RADIUS), checkY, blockZ) ||
            world.hasBlock(Math.floor(newPos.x - PLAYER_RADIUS), checkY, blockZ)) {
          newPos.x = this.camera.position.x;
        }
        if (world.hasBlock(blockX, checkY, Math.floor(newPos.z + PLAYER_RADIUS)) ||
            world.hasBlock(blockX, checkY, Math.floor(newPos.z - PLAYER_RADIUS))) {
          newPos.z = this.camera.position.z;
        }
      }

      this.camera.position.copy(newPos);
    } else {
      // Free-fly mode
      if (this.keys.has(' ') || this.keys.has('space')) moveY += 1;
      if (this.keys.has('shift') || this.keys.has('shiftleft') || this.keys.has('shiftright')) moveY -= 1;

      this.camera.position.x += moveX * MOVE_SPEED * dt;
      this.camera.position.y += moveY * FLY_SPEED * dt;
      this.camera.position.z += moveZ * MOVE_SPEED * dt;
    }

    // Clamp to world bounds
    this.camera.position.x = Math.max(0, Math.min(WORLD_SIZE, this.camera.position.x));
    this.camera.position.y = Math.max(0.5, Math.min(WORLD_SIZE + 10, this.camera.position.y));
    this.camera.position.z = Math.max(0, Math.min(WORLD_SIZE, this.camera.position.z));
  }

  setupTouchControls(canvas: HTMLCanvasElement) {
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.clientX < window.innerWidth / 2) {
          // Left side = movement
          this.touchMoveId = touch.identifier;
          this.touchMoveStart = { x: touch.clientX, y: touch.clientY };
        } else {
          // Right side = look
          this.touchLookId = touch.identifier;
          this.touchLookStart = { x: touch.clientX, y: touch.clientY };
        }
      }
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier === this.touchMoveId) {
          const dx = touch.clientX - this.touchMoveStart.x;
          const dy = touch.clientY - this.touchMoveStart.y;
          const maxDist = 50;
          this.touchMoveDir.x = Math.max(-1, Math.min(1, dx / maxDist));
          this.touchMoveDir.y = Math.max(-1, Math.min(1, dy / maxDist));
        } else if (touch.identifier === this.touchLookId) {
          this.touchLookDelta.x = touch.clientX - this.touchLookStart.x;
          this.touchLookDelta.y = touch.clientY - this.touchLookStart.y;
          this.touchLookStart = { x: touch.clientX, y: touch.clientY };
        }
      }
    }, { passive: false });

    const onTouchEnd = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier === this.touchMoveId) {
          this.touchMoveId = null;
          this.touchMoveDir = { x: 0, y: 0 };
        } else if (touch.identifier === this.touchLookId) {
          this.touchLookId = null;
          this.touchLookDelta = { x: 0, y: 0 };
        }
      }
    };
    canvas.addEventListener('touchend', onTouchEnd);
    canvas.addEventListener('touchcancel', onTouchEnd);
  }
}
