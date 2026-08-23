import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

type BlockId = "grass" | "dirt" | "stone" | "wood" | "leaves" | "sand" | "water" | "glass" | "brick";
type BlockMap = Map<string, BlockId>;
type Toast = { text: string; tone: "info" | "good" | "warn" };
type GameStats = { blocks: number; fps: number; position: string; target: string; mode: string };

type FaceName = "top" | "bottom" | "side";
type FaceDef = {
  normal: [number, number, number];
  corners: [number, number, number][];
  shade: number;
  face: FaceName;
};

const WORLD_RADIUS = 26;
const WATER_LEVEL = 5;
const PLAYER_HEIGHT = 1.74;
const PLAYER_RADIUS = 0.32;
const RAY_DISTANCE = 7;
const STORAGE_KEY = "minicraft-pro-world-v1";

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

const fract = (value: number) => value - Math.floor(value);

const hashNoise = (x: number, z: number, seed: number) => {
  const n = Math.sin(x * 127.1 + z * 311.7 + seed * 0.137) * 43758.5453123;
  return fract(n);
};

const terrainHeight = (x: number, z: number, seed: number) => {
  const rolling = Math.sin((x + seed) * 0.17) * 2.5 + Math.cos((z - seed) * 0.15) * 2.2;
  const ridge = Math.sin((x + z + seed) * 0.07) * 2.6;
  const detail = (hashNoise(x, z, seed) - 0.5) * 1.8;
  return Math.max(1, Math.floor(5 + rolling + ridge + detail));
};

const addBlock = (world: BlockMap, x: number, y: number, z: number, block: BlockId) => {
  world.set(keyOf(x, y, z), block);
};

const generateWorld = (seed = Date.now()) => {
  const world: BlockMap = new Map();

  for (let x = -WORLD_RADIUS; x <= WORLD_RADIUS; x += 1) {
    for (let z = -WORLD_RADIUS; z <= WORLD_RADIUS; z += 1) {
      const height = terrainHeight(x, z, seed);
      for (let y = 0; y <= height; y += 1) {
        const shore = height <= WATER_LEVEL + 1;
        const block: BlockId = y === height ? (shore ? "sand" : "grass") : y > height - 3 ? "dirt" : "stone";
        addBlock(world, x, y, z, block);
      }

      if (height < WATER_LEVEL) {
        for (let y = height + 1; y <= WATER_LEVEL; y += 1) {
          addBlock(world, x, y, z, "water");
        }
      }
    }
  }

  for (let x = -WORLD_RADIUS + 3; x <= WORLD_RADIUS - 3; x += 1) {
    for (let z = -WORLD_RADIUS + 3; z <= WORLD_RADIUS - 3; z += 1) {
      const height = terrainHeight(x, z, seed);
      const treeRoll = hashNoise(x * 3 + 8, z * 3 - 4, seed);
      if (height > WATER_LEVEL + 1 && treeRoll > 0.955) {
        const trunkHeight = 3 + Math.floor(hashNoise(x + 25, z - 16, seed) * 3);
        for (let y = height + 1; y <= height + trunkHeight; y += 1) {
          addBlock(world, x, y, z, "wood");
        }

        const leafCenterY = height + trunkHeight + 1;
        for (let lx = -2; lx <= 2; lx += 1) {
          for (let ly = -2; ly <= 2; ly += 1) {
            for (let lz = -2; lz <= 2; lz += 1) {
              const distance = Math.abs(lx) + Math.abs(ly) + Math.abs(lz);
              const skipCorner = Math.abs(lx) === 2 && Math.abs(lz) === 2 && ly < 1;
              if (distance <= 4 && !skipCorner) {
                const key = keyOf(x + lx, leafCenterY + ly, z + lz);
                if (!world.has(key)) {
                  world.set(key, "leaves");
                }
              }
            }
          }
        }
      }
    }
  }

  return world;
};

const getSurfaceHeight = (world: BlockMap, x: number, z: number) => {
  let best = 0;
  for (let y = 40; y >= 0; y -= 1) {
    const block = world.get(keyOf(x, y, z));
    if (block && block !== "water" && block !== "leaves") {
      best = y;
      break;
    }
  }
  return best;
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

const buildGeometry = (world: BlockMap, transparentPass: boolean) => {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  world.forEach((block, key) => {
    if (isTransparent(block) !== transparentPass) return;
    const [x, y, z] = parseKey(key);

    FACES.forEach((face) => {
      const nx = x + face.normal[0];
      const ny = y + face.normal[1];
      const nz = z + face.normal[2];
      const neighbor = world.get(keyOf(nx, ny, nz));
      if (shouldRenderFace(block, neighbor)) {
        pushQuad(positions, normals, colors, indices, x, y, z, face, block);
      }
    });
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
};

const makeWorldMesh = (world: BlockMap, transparentPass: boolean) => {
  const geometry = buildGeometry(world, transparentPass);
  const material = new THREE.MeshLambertMaterial({
    vertexColors: true,
    flatShading: true,
    transparent: transparentPass,
    opacity: transparentPass ? 0.72 : 1,
    side: transparentPass ? THREE.DoubleSide : THREE.FrontSide,
    depthWrite: !transparentPass,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = transparentPass ? "transparent-world" : "solid-world";
  mesh.castShadow = !transparentPass;
  mesh.receiveShadow = true;
  return mesh;
};

const playerHitsBlock = (world: BlockMap, eye: THREE.Vector3) => {
  const minX = Math.floor(eye.x - PLAYER_RADIUS);
  const maxX = Math.floor(eye.x + PLAYER_RADIUS);
  const minY = Math.floor(eye.y - PLAYER_HEIGHT);
  const maxY = Math.floor(eye.y - 0.05);
  const minZ = Math.floor(eye.z - PLAYER_RADIUS);
  const maxZ = Math.floor(eye.z + PLAYER_RADIUS);

  for (let x = minX; x <= maxX; x += 1) {
    for (let y = minY; y <= maxY; y += 1) {
      for (let z = minZ; z <= maxZ; z += 1) {
        const block = world.get(keyOf(x, y, z));
        if (block && isSolid(block)) {
          return true;
        }
      }
    }
  }

  return false;
};

const pointToBlock = (point: THREE.Vector3, normal: THREE.Vector3, side: "inside" | "outside") => {
  const nudge = side === "inside" ? -0.01 : 0.01;
  return {
    x: Math.floor(point.x + normal.x * nudge),
    y: Math.floor(point.y + normal.y * nudge),
    z: Math.floor(point.z + normal.z * nudge),
  };
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

  blip(type: "place" | "break" | "jump" | "step") {
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
    if (speed > 0.06 && now - this.lastStep > 390) {
      this.lastStep = now;
      this.blip("step");
    }
  }
}

const App = () => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const worldRef = useRef<BlockMap>(new Map());
  const selectedRef = useRef<BlockId>("grass");
  const rebuildWorldRef = useRef<() => void>(() => undefined);
  const resetPlayerRef = useRef<() => void>(() => undefined);
  const [selected, setSelected] = useState<BlockId>("grass");
  const [locked, setLocked] = useState(false);
  const [showHelp, setShowHelp] = useState(true);
  const [toast, setToast] = useState<Toast>({ text: "Click the world to lock mouse and start building.", tone: "info" });
  const [stats, setStats] = useState<GameStats>({ blocks: 0, fps: 0, position: "0, 0, 0", target: "None", mode: "Creative" });

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x8ec8ff, 34, 92);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.className = "game-canvas";
    mount.appendChild(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 350);
    camera.rotation.order = "YXZ";

    const hemiLight = new THREE.HemisphereLight(0xbfe7ff, 0x4d392b, 2.1);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xfff3c1, 2.2);
    sunLight.position.set(30, 55, 18);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(1024, 1024);
    scene.add(sunLight);

    const sun = new THREE.Mesh(
      new THREE.SphereGeometry(2.7, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0xffdf70 }),
    );
    scene.add(sun);

    const worldGroup = new THREE.Group();
    scene.add(worldGroup);

    const highlight = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.025, 1.025, 1.025)),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 }),
    );
    highlight.visible = false;
    scene.add(highlight);

    const particles: { mesh: THREE.Mesh; velocity: THREE.Vector3; life: number; maxLife: number }[] = [];
    const particleGeometry = new THREE.BoxGeometry(0.11, 0.11, 0.11);
    const audio = new GameAudio();
    const raycaster = new THREE.Raycaster();
    raycaster.far = RAY_DISTANCE;

    worldRef.current = generateWorld(20260823);

    let yaw = Math.PI * 0.25;
    let pitch = -0.12;
    let verticalVelocity = 0;
    let isGrounded = false;
    let flyMode = false;
    const keys = new Set<string>();
    const moveVector = new THREE.Vector3();
    const tempVector = new THREE.Vector3();
    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();
    const cameraDirection = new THREE.Vector3();
    let currentTarget = "None";
    let lastFrame = performance.now();
    let frames = 0;
    let fpsTime = performance.now();
    let lastUiUpdate = 0;
    let destroyed = false;

    const showToast = (text: string, tone: Toast["tone"] = "info") => {
      setToast({ text, tone });
    };

    const rebuildWorld = () => {
      worldGroup.children.forEach((child) => {
        const mesh = child as THREE.Mesh;
        mesh.geometry.dispose();
        const material = mesh.material;
        if (Array.isArray(material)) {
          material.forEach((item) => item.dispose());
        } else {
          material.dispose();
        }
      });
      worldGroup.clear();

      const solidMesh = makeWorldMesh(worldRef.current, false);
      const transparentMesh = makeWorldMesh(worldRef.current, true);
      worldGroup.add(solidMesh, transparentMesh);
      setStats((previous) => ({ ...previous, blocks: worldRef.current.size }));
    };

    rebuildWorldRef.current = rebuildWorld;

    const resetPlayer = () => {
      const spawnY = getSurfaceHeight(worldRef.current, 0, 0) + PLAYER_HEIGHT + 2.2;
      camera.position.set(0.5, spawnY, 0.5);
      verticalVelocity = 0;
      yaw = Math.PI * 0.25;
      pitch = -0.12;
    };

    resetPlayerRef.current = resetPlayer;

    const saveWorld = () => {
      const payload = {
        savedAt: new Date().toISOString(),
        blocks: Array.from(worldRef.current.entries()),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      showToast("World saved locally.", "good");
    };

    const loadWorld = () => {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        showToast("No saved world found yet.", "warn");
        return;
      }

      try {
        const parsed = JSON.parse(raw) as { blocks: [string, BlockId][] };
        worldRef.current = new Map(parsed.blocks);
        rebuildWorld();
        resetPlayer();
        showToast("Saved world loaded.", "good");
      } catch {
        showToast("Saved world data is invalid.", "warn");
      }
    };

    const newWorld = () => {
      worldRef.current = generateWorld(Date.now());
      rebuildWorld();
      resetPlayer();
      showToast("Generated a fresh world.", "good");
    };

    (window as Window & { minicraftActions?: { save: () => void; load: () => void; newWorld: () => void } }).minicraftActions = {
      save: saveWorld,
      load: loadWorld,
      newWorld,
    };

    const getLookIntersection = () => {
      camera.getWorldDirection(cameraDirection);
      raycaster.set(camera.position, cameraDirection);
      const intersections = raycaster.intersectObjects(worldGroup.children, false);
      return intersections[0];
    };

    const updateHighlight = () => {
      const hit = getLookIntersection();
      if (!hit || !hit.face) {
        highlight.visible = false;
        currentTarget = "None";
        return undefined;
      }

      const target = pointToBlock(hit.point, hit.face.normal, "inside");
      const block = worldRef.current.get(keyOf(target.x, target.y, target.z));
      if (!block) {
        highlight.visible = false;
        currentTarget = "None";
        return undefined;
      }

      highlight.position.set(target.x + 0.5, target.y + 0.5, target.z + 0.5);
      highlight.visible = true;
      currentTarget = `${BLOCKS[block].name} ${target.x},${target.y},${target.z}`;
      return { hit, target, block };
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
      const targetInfo = updateHighlight();
      if (!targetInfo) {
        showToast("Aim at a block within reach.", "warn");
        return;
      }

      const { target, block } = targetInfo;
      if (target.y <= 0 && block === "stone") {
        showToast("Bedrock layer protected.", "warn");
        return;
      }

      worldRef.current.delete(keyOf(target.x, target.y, target.z));
      spawnParticles(target.x, target.y, target.z, block);
      rebuildWorld();
      audio.blip("break");
      showToast(`Mined ${BLOCKS[block].name}.`, "good");
    };

    const placeBlock = () => {
      const targetInfo = updateHighlight();
      if (!targetInfo || !targetInfo.hit.face) {
        showToast("Aim at a face to place a block.", "warn");
        return;
      }

      const place = pointToBlock(targetInfo.hit.point, targetInfo.hit.face.normal, "outside");
      const key = keyOf(place.x, place.y, place.z);
      if (worldRef.current.has(key)) {
        showToast("That space is already occupied.", "warn");
        return;
      }

      const selectedBlock = selectedRef.current;
      worldRef.current.set(key, selectedBlock);
      if (isSolid(selectedBlock) && playerHitsBlock(worldRef.current, camera.position)) {
        worldRef.current.delete(key);
        showToast("Cannot place a block inside yourself.", "warn");
        return;
      }

      rebuildWorld();
      audio.blip("place");
      showToast(`Placed ${BLOCKS[selectedBlock].name}.`, "good");
    };

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
        verticalVelocity = 0;
        showToast(flyMode ? "Creative flight enabled." : "Creative flight disabled.", "info");
      }
      if (event.code === "KeyP") saveWorld();
      if (event.code === "KeyL") loadWorld();
    };

    const onKeyUp = (event: KeyboardEvent) => {
      keys.delete(event.code);
    };

    const onPointerLockChange = () => {
      setLocked(document.pointerLockElement === renderer.domElement);
    };

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
      renderer.setSize(window.innerWidth, window.innerHeight);
    };

    const tryMove = (delta: THREE.Vector3) => {
      camera.position.x += delta.x;
      if (playerHitsBlock(worldRef.current, camera.position)) camera.position.x -= delta.x;
      camera.position.z += delta.z;
      if (playerHitsBlock(worldRef.current, camera.position)) camera.position.z -= delta.z;
      camera.position.y += delta.y;
      if (playerHitsBlock(worldRef.current, camera.position)) {
        if (delta.y < 0) isGrounded = true;
        camera.position.y -= delta.y;
        verticalVelocity = 0;
      }
    };

    const updateMovement = (dt: number) => {
      forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
      right.set(Math.cos(yaw), 0, -Math.sin(yaw));
      moveVector.set(0, 0, 0);

      if (keys.has("KeyW")) moveVector.add(forward);
      if (keys.has("KeyS")) moveVector.sub(forward);
      if (keys.has("KeyD")) moveVector.add(right);
      if (keys.has("KeyA")) moveVector.sub(right);
      if (moveVector.lengthSq() > 0) moveVector.normalize();

      const sprinting = keys.has("ShiftLeft") || keys.has("ShiftRight");
      const speed = flyMode ? 11 : sprinting ? 8.2 : 5.4;
      tempVector.copy(moveVector).multiplyScalar(speed * dt);

      if (flyMode) {
        let up = 0;
        if (keys.has("Space")) up += 1;
        if (keys.has("ShiftLeft") || keys.has("ShiftRight")) up -= 1;
        tempVector.y = up * speed * dt;
        isGrounded = false;
      } else {
        const wasGrounded = isGrounded;
        isGrounded = false;
        if (keys.has("Space") && wasGrounded) {
          verticalVelocity = 8.2;
          audio.blip("jump");
        }
        verticalVelocity -= 23 * dt;
        verticalVelocity = Math.max(verticalVelocity, -38);
        tempVector.y = verticalVelocity * dt;
      }

      tryMove(tempVector);

      if (!flyMode && camera.position.y < -18) {
        resetPlayer();
        showToast("You fell out of the world. Respawned!", "warn");
      }

      if (!flyMode && isGrounded) {
        audio.step(moveVector.length());
      }
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
          particle.mesh.geometry.dispose();
          material.dispose();
          particles.splice(i, 1);
        }
      }
    };

    const renderFrame = (now: number) => {
      if (destroyed) return;
      const dt = Math.min((now - lastFrame) / 1000, 0.05);
      lastFrame = now;
      frames += 1;

      const dayCycle = now * 0.000035;
      const sunX = Math.cos(dayCycle) * 58;
      const sunY = Math.sin(dayCycle) * 38 + 34;
      sun.position.set(sunX, sunY, 24);
      sunLight.position.copy(sun.position);
      sunLight.intensity = THREE.MathUtils.clamp((sunY - 2) / 18, 0.25, 2.35);
      hemiLight.intensity = THREE.MathUtils.clamp((sunY + 20) / 26, 0.7, 2.2);
      const sky = new THREE.Color().lerpColors(new THREE.Color(0x17213a), new THREE.Color(0x8ed3ff), THREE.MathUtils.clamp((sunY + 6) / 42, 0, 1));
      renderer.setClearColor(sky);
      scene.fog?.color.copy(sky);

      camera.rotation.set(pitch, yaw, 0, "YXZ");
      updateMovement(dt);
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
            blocks: worldRef.current.size,
            fps,
            position: `${camera.position.x.toFixed(1)}, ${camera.position.y.toFixed(1)}, ${camera.position.z.toFixed(1)}`,
            target: currentTarget,
            mode: flyMode ? "Creative Flight" : "Creative",
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
        particle.mesh.geometry.dispose();
        (particle.mesh.material as THREE.Material).dispose();
      });
      particleGeometry.dispose();
      worldGroup.children.forEach((child) => {
        const mesh = child as THREE.Mesh;
        mesh.geometry.dispose();
        const material = mesh.material;
        if (Array.isArray(material)) material.forEach((item) => item.dispose());
        else material.dispose();
      });
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
            Click the world to lock your mouse. Left click mines blocks, right click places blocks, and the number keys switch materials.
          </p>
          <button type="button" onClick={() => document.querySelector<HTMLCanvasElement>(".game-canvas")?.requestPointerLock()}>
            Enter world
          </button>
        </section>
      )}

      <aside className="hud top-left">
        <strong>Stats</strong>
        <span>{stats.blocks.toLocaleString()} blocks rendered</span>
        <span>{stats.fps} FPS</span>
        <span>Mode: {stats.mode}</span>
        <span>Pos: {stats.position}</span>
        <span>Target: {stats.target}</span>
      </aside>

      <aside className="hud top-right">
        <button type="button" onClick={() => runAction("save")}>Save</button>
        <button type="button" onClick={() => runAction("load")}>Load</button>
        <button type="button" onClick={() => runAction("newWorld")}>New World</button>
      </aside>

      {showHelp && (
        <aside className="help-panel">
          <strong>Controls</strong>
          <span>WASD move · Mouse look</span>
          <span>Left click mine · Right click place</span>
          <span>1-9 select block · Space jump</span>
          <span>Shift sprint · F fly · R respawn</span>
          <span>P save · L load · H hide help</span>
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
