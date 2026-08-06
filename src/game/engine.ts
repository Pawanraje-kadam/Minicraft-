import { World } from './world';
import { GameRenderer } from './renderer';
import { Player } from './player';
import { Interaction, RaycastResult } from './interaction';
import { BLOCK_DEFS, ALL_BLOCK_TYPES, GameState, WORLD_SIZE } from './types';

export class GameEngine {
  world: World;
  renderer: GameRenderer;
  player: Player;
  interaction: Interaction;
  
  state: GameState = {
    isPaused: false,
    isStartScreen: true,
    isGameOver: false,
    score: 0,
    blocksPlaced: 0,
    blocksRemoved: 0,
    selectedBlockIndex: 0,
    gravityEnabled: false,
    fps: 60,
  };

  currentHit: RaycastResult | null = null;
  
  private animationId: number = 0;
  private lastTime: number = 0;
  private frameCount = 0;
  private fpsTimer = 0;
  private pointerLocked = false;
  private dirty = true;
  private autoSaveTimer = 0;
  private totalTime = 0;
  
  // Callbacks for UI updates
  onStateChange: ((state: GameState) => void) | null = null;
  onHitChange: ((hit: RaycastResult | null) => void) | null = null;

  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.world = new World();
    this.renderer = new GameRenderer(canvas);
    this.player = new Player(this.renderer.camera);
    this.interaction = new Interaction();
    
    // Generate a preview world for the start screen
    this.world.generateFlatWorld();
    this.renderer.updateBlocks(this.world);
    
    this.setupInputs();
    this.player.setupTouchControls(canvas);
  }

  private setupInputs() {
    // Keyboard
    document.addEventListener('keydown', (e) => {
      if (this.state.isStartScreen) return;
      
      const key = e.key.toLowerCase();
      this.player.keys.add(key);
      
      // Number keys for block selection
      const num = parseInt(e.key);
      if (num >= 1 && num <= 9) {
        const idx = num - 1;
        if (idx < ALL_BLOCK_TYPES.length) {
          this.state.selectedBlockIndex = idx;
          this.notifyState();
        }
      }

      // ESC to pause
      if (key === 'escape') {
        if (this.pointerLocked) {
          document.exitPointerLock();
        }
        this.state.isPaused = !this.state.isPaused;
        this.notifyState();
      }

      // G to toggle gravity
      if (key === 'g') {
        this.state.gravityEnabled = !this.state.gravityEnabled;
        this.player.gravityEnabled = this.state.gravityEnabled;
        this.notifyState();
      }

      // Prevent default for game keys
      if (['w', 'a', 's', 'd', ' ', 'shift'].includes(key) || e.key === ' ') {
        e.preventDefault();
      }
    });

    document.addEventListener('keyup', (e) => {
      this.player.keys.delete(e.key.toLowerCase());
    });

    // Mouse
    this.canvas.addEventListener('mousedown', (e) => {
      if (this.state.isStartScreen || this.state.isPaused) return;
      
      if (!this.pointerLocked) {
        this.canvas.requestPointerLock();
        return;
      }

      if (e.button === 0) {
        this.removeTargetBlock();
      } else if (e.button === 2) {
        this.placeBlock();
      }
    });

    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.canvas;
      if (!this.pointerLocked && !this.state.isStartScreen && !this.state.isPaused) {
        // Auto-pause when pointer lock is lost
        this.state.isPaused = true;
        this.notifyState();
      }
    });

    document.addEventListener('mousemove', (e) => {
      if (this.pointerLocked && !this.state.isPaused) {
        this.player.onMouseMove(e.movementX, e.movementY);
      }
    });

    // Scroll wheel for block selection
    this.canvas.addEventListener('wheel', (e) => {
      if (this.state.isStartScreen || this.state.isPaused) return;
      e.preventDefault();
      const dir = e.deltaY > 0 ? 1 : -1;
      let idx = this.state.selectedBlockIndex + dir;
      if (idx < 0) idx = ALL_BLOCK_TYPES.length - 1;
      if (idx >= ALL_BLOCK_TYPES.length) idx = 0;
      this.state.selectedBlockIndex = idx;
      this.notifyState();
    }, { passive: false });
  }

  removeTargetBlock() {
    if (!this.currentHit) return;
    const type = this.interaction.removeBlock(this.world, this.currentHit);
    if (type !== undefined) {
      this.state.blocksRemoved++;
      this.state.score += 1;
      this.dirty = true;
      
      const pos = this.currentHit.blockPos.clone().addScalar(0.5);
      this.renderer.spawnParticles(pos, BLOCK_DEFS[type].color, 12);
      this.renderer.triggerShake(0.1);
      this.notifyState();
    }
  }

  placeBlock() {
    if (!this.currentHit) return;
    const blockType = ALL_BLOCK_TYPES[this.state.selectedBlockIndex].type;
    if (this.interaction.placeBlock(this.world, this.currentHit, blockType, this.renderer.camera.position)) {
      this.state.blocksPlaced++;
      this.state.score += 2;
      this.dirty = true;
      
      const placePos = this.currentHit.blockPos.clone().add(this.currentHit.faceNormal).addScalar(0.5);
      this.renderer.spawnParticles(placePos, BLOCK_DEFS[blockType].color, 6);
      this.renderer.triggerShake(0.05);
      this.notifyState();
    }
  }

  startGame(loadSave: boolean = false) {
    if (loadSave && this.world.hasSave()) {
      this.world.load();
    } else {
      this.world.generateFlatWorld();
    }
    
    // Reset player position — stand near center
    this.player.camera.position.set(WORLD_SIZE / 2, 4, WORLD_SIZE / 2 + 8);
    
    this.state.isStartScreen = false;
    this.state.isPaused = false;
    this.state.isGameOver = false;
    this.state.score = 0;
    this.state.blocksPlaced = 0;
    this.state.blocksRemoved = 0;
    this.dirty = true;
    this.notifyState();
    
    // Request pointer lock
    this.canvas.requestPointerLock();
  }

  saveWorld() {
    this.world.save();
  }

  clearWorld() {
    this.world.clear();
    this.dirty = true;
    this.state.score = 0;
    this.state.blocksPlaced = 0;
    this.state.blocksRemoved = 0;
    this.notifyState();
  }

  private notifyState() {
    this.onStateChange?.(this.state);
  }

  start() {
    this.lastTime = performance.now();
    this.gameLoop();
  }

  stop() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
  }

  private gameLoop() {
    this.animationId = requestAnimationFrame(() => this.gameLoop());
    
    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;
    this.totalTime += dt;

    // FPS counter
    this.frameCount++;
    this.fpsTimer += dt;
    if (this.fpsTimer >= 0.5) {
      this.state.fps = Math.round(this.frameCount / this.fpsTimer);
      this.frameCount = 0;
      this.fpsTimer = 0;
      this.notifyState();
    }

    if (this.state.isStartScreen) {
      // Animate camera orbit for start screen — wider orbit over the big world
      const center = WORLD_SIZE / 2;
      const radius = 50;
      const speed = 0.12;
      this.renderer.camera.position.set(
        center + Math.cos(this.totalTime * speed) * radius,
        22 + Math.sin(this.totalTime * speed * 0.4) * 5,
        center + Math.sin(this.totalTime * speed) * radius
      );
      this.renderer.camera.lookAt(center, 2, center);
      
      this.renderer.render(dt);
      return;
    }

    if (this.state.isPaused) {
      this.renderer.render(dt);
      return;
    }

    // Update player
    this.player.update(dt, this.world);

    // Raycast for block targeting
    this.currentHit = this.interaction.raycastBlock(this.renderer.camera, this.world);
    if (this.currentHit) {
      const bp = this.currentHit.blockPos;
      this.renderer.setHighlight(bp.x, bp.y, bp.z, true);
    } else {
      this.renderer.setHighlight(0, 0, 0, false);
    }

    // Update rendering if world changed
    if (this.dirty) {
      this.renderer.updateBlocks(this.world);
      this.dirty = false;
    }

    // Auto-save every 60 seconds
    this.autoSaveTimer += dt;
    if (this.autoSaveTimer >= 60) {
      this.autoSaveTimer = 0;
      this.world.save();
    }

    // Render
    this.renderer.render(dt);
  }
}
