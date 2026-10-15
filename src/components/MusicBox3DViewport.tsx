import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MusicBoxPin, PlayMode, TineNote, SoundChamberPreset } from '../types';
import {
  Eye,
  Layers,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Box,
  Sparkles,
  Play,
  Pause,
  RotateCw,
  Disc,
  Zap,
} from 'lucide-react';
import { musicBoxAudio } from '../audio/musicBoxAudio';

export type CameraPresetId = 'isometric' | 'macro-strike' | 'governor' | 'top-ortho' | 'front-crank';
export type CaseDisplayMode = 'open-lid' | 'closed-lid' | 'chassis-only';

interface MusicBox3DViewportProps {
  currentStep: number;
  totalSteps: number;
  pins: MusicBoxPin[];
  tinesList: TineNote[];
  isPlaying: boolean;
  tempoBpm: number;
  playMode: PlayMode;
  springTension: number;
  activeTines: Set<number>;
  crankRpm: number;
  isEco: boolean;
  soundPreset?: SoundChamberPreset;
  onPluckTine: (tineIndex: number) => void;
  onSubscribeStep?: (cb: (step: number) => void) => () => void;
  onTogglePlay?: () => void;
  onWindSpring?: (addedTension: number) => void;
  onChangePlayMode?: (mode: PlayMode) => void;
  onManualCrankAdvance?: (deltaAngle: number, currentRpm: number) => void;
  onSwitchTo2D?: () => void;
}

// Pre-allocated math helpers at module scope to prevent GC in the render loop
const _dummyObj = new THREE.Object3D();
const _vec3A = new THREE.Vector3();
const _vec3B = new THREE.Vector3();
const _color = new THREE.Color();

const CAMERA_PRESETS: Record<
  CameraPresetId,
  { label: string; pos: [number, number, number]; target: [number, number, number] }
> = {
  isometric: {
    label: 'Studio 3D',
    pos: [0.4, 5.4, 6.2],
    target: [0, 0.4, 0.1],
  },
  'macro-strike': {
    label: 'Comb Strike',
    pos: [1.4, 2.1, 3.1],
    target: [0.7, 0.65, 0.15],
  },
  governor: {
    label: 'Escapement',
    pos: [-3.4, 2.6, 3.3],
    target: [-1.85, 0.55, 0.3],
  },
  'top-ortho': {
    label: 'Top Plan',
    pos: [0, 7.6, 0.01],
    target: [0, 0.2, 0],
  },
  'front-crank': {
    label: 'Drive & Key',
    pos: [-4.4, 2.2, 4.1],
    target: [-1.6, 0.45, 0.2],
  },
};

function createProceduralWoodTexture(maxAnisotropy: number, preset?: SoundChamberPreset | string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // Base rich burl walnut / mahogany tone
    let baseDark = '#241309';
    let baseMid = '#3d2110';
    let baseHighlight = '#5e3419';
    if (preset === 'crystal-bell') {
      baseDark = '#16202a';
      baseMid = '#243447';
      baseHighlight = '#364d68';
    } else if (preset === 'vintage-antique') {
      baseDark = '#1c140c';
      baseMid = '#2f2215';
      baseHighlight = '#4a3621';
    }

    const grad = ctx.createLinearGradient(0, 0, 512, 512);
    grad.addColorStop(0, baseDark);
    grad.addColorStop(0.5, baseMid);
    grad.addColorStop(1, baseDark);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);

    // Organic wood grain striations and burl knots
    for (let i = 0; i < 140; i++) {
      const y = (i / 140) * 512;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= 512; x += 16) {
        const wave =
          Math.sin(x * 0.018 + i * 0.25) * 9 +
          Math.cos(x * 0.045 - i * 0.12) * 4;
        ctx.lineTo(x, y + wave);
      }
      ctx.strokeStyle = i % 3 === 0 ? baseHighlight : baseDark;
      ctx.globalAlpha = 0.14 + (i % 5) * 0.03;
      ctx.lineWidth = 1.2 + (i % 3) * 0.8;
      ctx.stroke();
    }

    // Burl figure swirls
    for (let k = 0; k < 14; k++) {
      const kx = ((k * 137) % 440) + 36;
      const ky = ((k * 223) % 440) + 36;
      const r = 18 + (k % 4) * 12;
      const rGrad = ctx.createRadialGradient(kx, ky, 2, kx, ky, r);
      rGrad.addColorStop(0, 'rgba(18, 8, 3, 0.35)');
      rGrad.addColorStop(0.6, 'rgba(94, 52, 25, 0.18)');
      rGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = rGrad;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.arc(kx, ky, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createLatheBrassTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, '#d8b467');
    grad.addColorStop(0.25, '#f4dc96');
    grad.addColorStop(0.5, '#c89f4b');
    grad.addColorStop(0.75, '#f2d88c');
    grad.addColorStop(1, '#b88e39');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);

    // Fine circumferential lathe lines
    for (let x = 0; x < 512; x += 2) {
      ctx.fillStyle = x % 4 === 0 ? 'rgba(255, 248, 220, 0.18)' : 'rgba(72, 48, 12, 0.14)';
      ctx.fillRect(x, 0, 1, 512);
    }

  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createBedplatePlaqueTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#36230d';
    ctx.fillRect(0, 0, 256, 64);
    ctx.strokeStyle = '#e0b865';
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, 248, 56);

    ctx.fillStyle = '#f8e3a3';
    ctx.font = 'bold 28px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('聲 盒 仔', 128, 33);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

/**
 * Generates an extruded gear geometry with involute-like tooth profiles
 */
function createSpurGearGeometry(
  pitchRadius: number,
  teeth: number,
  thickness: number,
  toothHeight = 0.06,
  holeRadius = 0.08
): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  const step = (Math.PI * 2) / teeth;
  const innerR = pitchRadius - toothHeight * 0.55;
  const outerR = pitchRadius + toothHeight * 0.45;

  for (let i = 0; i < teeth; i++) {
    const a0 = i * step;
    const a1 = a0 + step * 0.22;
    const a2 = a0 + step * 0.35;
    const a3 = a0 + step * 0.65;
    const a4 = a0 + step * 0.78;

    const p0x = Math.cos(a0) * innerR;
    const p0y = Math.sin(a0) * innerR;
    if (i === 0) shape.moveTo(p0x, p0y);
    else shape.lineTo(p0x, p0y);

    shape.lineTo(Math.cos(a1) * innerR, Math.sin(a1) * innerR);
    shape.lineTo(Math.cos(a2) * outerR, Math.sin(a2) * outerR);
    shape.lineTo(Math.cos(a3) * outerR, Math.sin(a3) * outerR);
    shape.lineTo(Math.cos(a4) * innerR, Math.sin(a4) * innerR);
  }
  shape.closePath();

  if (holeRadius > 0) {
    const hole = new THREE.Path();
    hole.absarc(0, 0, holeRadius, 0, Math.PI * 2, true);
    shape.holes.push(hole);
  }

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: Math.min(0.015, thickness * 0.15),
    bevelSize: Math.min(0.012, toothHeight * 0.2),
    bevelSegments: 2,
  });
  geo.center();
  return geo;
}

/**
 * Generates an asymmetric saw-tooth ratchet wheel for the mainspring winding arbor
 */
function createRatchetWheelGeometry(
  radius: number,
  teeth: number,
  thickness: number
): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  const step = (Math.PI * 2) / teeth;
  const innerR = radius * 0.78;
  const outerR = radius;

  for (let i = 0; i < teeth; i++) {
    const a0 = i * step;
    const aTip = a0 + step * 0.18; // Steep locking face
    const aRoot = a0 + step * 0.92; // Gentle ramp face

    if (i === 0) {
      shape.moveTo(Math.cos(a0) * innerR, Math.sin(a0) * innerR);
    } else {
      shape.lineTo(Math.cos(a0) * innerR, Math.sin(a0) * innerR);
    }
    shape.lineTo(Math.cos(aTip) * outerR, Math.sin(aTip) * outerR);
    shape.lineTo(Math.cos(aRoot) * innerR, Math.sin(aRoot) * innerR);
  }
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: 0.008,
    bevelSize: 0.008,
    bevelSegments: 1,
  });
  geo.center();
  return geo;
}

export const MusicBox3DViewport: React.FC<MusicBox3DViewportProps> = React.memo(({
  currentStep,
  totalSteps,
  pins,
  tinesList,
  isPlaying,
  tempoBpm,
  playMode,
  springTension,
  activeTines,
  crankRpm,
  isEco,
  soundPreset = 'gold-sankyo',
  onPluckTine,
  onSubscribeStep,
  onTogglePlay,
  onWindSpring,
  onChangePlayMode,
  onManualCrankAdvance,
  onSwitchTo2D,
}) => {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);

  // HUD UI Controls State
  const [cameraPreset, setCameraPreset] = useState<CameraPresetId>('isometric');
  const [explodedAmount, setExplodedAmount] = useState<number>(0); // 0 to 1
  const [caseMode, setCaseMode] = useState<CaseDisplayMode>('open-lid');
  const [isHudCollapsed, setIsHudCollapsed] = useState<boolean>(false);
  const [hoveredPartLabel, setHoveredPartLabel] = useState<string | null>(null);
  const [webglFallback, setWebglFallback] = useState<boolean>(false);

  // Mutable state refs for zero-reinit animation loop access
  const smoothStepRef = useRef<number>(currentStep);
  const totalStepsRef = useRef<number>(totalSteps);
  const isPlayingRef = useRef<boolean>(isPlaying);
  const tempoBpmRef = useRef<number>(tempoBpm);
  const playModeRef = useRef<PlayMode>(playMode);
  const springTensionRef = useRef<number>(springTension);
  const crankRpmRef = useRef<number>(crankRpm);
  const explodedTargetRef = useRef<number>(0);
  const explodedCurrentRef = useRef<number>(0);
  const caseModeRef = useRef<CaseDisplayMode>('open-lid');
  const cameraPresetTargetRef = useRef<{ pos: THREE.Vector3; target: THREE.Vector3 } | null>(null);
  const activeTineTimestampsRef = useRef<Map<number, number>>(new Map());
  const pinsRef = useRef<MusicBoxPin[]>(pins);
  const tinesListRef = useRef<TineNote[]>(tinesList);

  const onPluckTineRef = useRef(onPluckTine);
  const onTogglePlayRef = useRef(onTogglePlay);
  const onWindSpringRef = useRef(onWindSpring);
  const onManualCrankAdvanceRef = useRef(onManualCrankAdvance);

  useEffect(() => {
    onPluckTineRef.current = onPluckTine;
    onTogglePlayRef.current = onTogglePlay;
    onWindSpringRef.current = onWindSpring;
    onManualCrankAdvanceRef.current = onManualCrankAdvance;
  }, [onPluckTine, onTogglePlay, onWindSpring, onManualCrankAdvance]);

  useEffect(() => {
    totalStepsRef.current = totalSteps;
    isPlayingRef.current = isPlaying;
    tempoBpmRef.current = tempoBpm;
    playModeRef.current = playMode;
    springTensionRef.current = springTension;
    crankRpmRef.current = crankRpm;
    pinsRef.current = pins;
    tinesListRef.current = tinesList;
  }, [totalSteps, isPlaying, tempoBpm, playMode, springTension, crankRpm, pins, tinesList]);

  useEffect(() => {
    explodedTargetRef.current = explodedAmount;
  }, [explodedAmount]);

  useEffect(() => {
    caseModeRef.current = caseMode;
  }, [caseMode]);

  // Track newly plucked tines for 3D flexural oscillation
  useEffect(() => {
    const now = performance.now();
    activeTines.forEach((idx) => {
      const prev = activeTineTimestampsRef.current.get(idx) || 0;
      if (now - prev > 90) {
        activeTineTimestampsRef.current.set(idx, now);
      }
    });
  }, [activeTines]);

  // Subscribe to sub-step updates
  useEffect(() => {
    if (!onSubscribeStep) return;
    return onSubscribeStep((step) => {
      smoothStepRef.current = step;
    });
  }, [onSubscribeStep]);

  useEffect(() => {
    smoothStepRef.current = currentStep;
  }, [currentStep]);

  // Scene object references for dynamic updates when pins or comb scale change
  const sceneRefs = useRef<{
    cylinderGroup: THREE.Group | null;
    pinsInstancedMesh: THREE.InstancedMesh | null;
    combTinesGroup: THREE.Group | null;
    tineMeshes: {
      group: THREE.Group;
      beamMesh: THREE.Mesh;
      mat: THREE.MeshPhysicalMaterial;
      baseColor: number;
      tineIndex: number;
    }[];
    springCoilMesh: THREE.Mesh | null;
    butterflyKeyGroup: THREE.Group | null;
    handCrankGroup: THREE.Group | null;
    electricMotorGroup: THREE.Group | null;
    clickableObjects: THREE.Object3D[];
    woodMaterial: THREE.MeshPhysicalMaterial | null;
    renderer: THREE.WebGLRenderer | null;
  }>({
    cylinderGroup: null,
    pinsInstancedMesh: null,
    combTinesGroup: null,
    tineMeshes: [],
    springCoilMesh: null,
    butterflyKeyGroup: null,
    handCrankGroup: null,
    electricMotorGroup: null,
    clickableObjects: [],
    woodMaterial: null,
    renderer: null,
  });

  // Helper to rebuild the 3D cylinder pins InstancedMesh whenever `pins`, `totalSteps`, or `tinesList` changes
  const rebuildPinsInstances = useCallback(() => {
    const mesh = sceneRefs.current.pinsInstancedMesh;
    if (!mesh) return;

    const tinesCount = Math.max(1, tinesList.length);
    const drumLength = 2.85; // X span from -1.425 to +1.425
    const drumRadius = 0.52;
    const slotW = drumLength / tinesCount;
    const startX = -drumLength / 2;

    const validPins = pins.filter((p) => p.tineIndex >= 0 && p.tineIndex < tinesCount);
    const count = Math.min(validPins.length, mesh.instanceMatrix.count);
    mesh.count = count;

    for (let i = 0; i < count; i++) {
      const pin = validPins[i];
      const px = startX + (pin.tineIndex + 0.5) * slotW;
      // Pin angular position around cylinder (X-axis rotation)
      // At smoothStep === pin.step, the pin hits the comb tine tip at angle = 0 (pointing +Z toward comb)
      const angle = -(pin.step / Math.max(1, totalSteps)) * Math.PI * 2;

      const r = drumRadius + 0.032;
      const py = Math.sin(angle) * r;
      const pz = Math.cos(angle) * r;

      _dummyObj.position.set(px, py, pz);
      // Point radially outward from cylinder X axis
      _dummyObj.rotation.set(Math.PI / 2 - angle, 0, 0);
      _dummyObj.scale.set(1, 1, 1);
      _dummyObj.updateMatrix();
      mesh.setMatrixAt(i, _dummyObj.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [pins, totalSteps, tinesList.length]);

  // Helper to rebuild the 3D Steel Comb Tines when `tinesList` changes
  const rebuildCombTines = useCallback(() => {
    const combTinesGroup = sceneRefs.current.combTinesGroup;
    if (!combTinesGroup) return;

    // Clear old tines
    while (combTinesGroup.children.length > 0) {
      const child = combTinesGroup.children[0];
      combTinesGroup.remove(child);
    }
    sceneRefs.current.tineMeshes = [];

    // Filter out old tine clickables
    sceneRefs.current.clickableObjects = sceneRefs.current.clickableObjects.filter(
      (obj) => obj.userData?.type !== 'tine'
    );

    const tinesCount = Math.max(1, tinesList.length);
    const drumLength = 2.85;
    const slotW = drumLength / tinesCount;
    const startX = -drumLength / 2;

    const leadMat = new THREE.MeshStandardMaterial({
      color: 0x2c3038,
      metalness: 0.65,
      roughness: 0.65,
    });
    const damperMat = new THREE.MeshStandardMaterial({
      color: 0xf5ebd6,
      metalness: 0.05,
      roughness: 0.85,
    });

    tinesList.forEach((tine, idx) => {
      // Local X inside combAssemblyGroup (centered at 0, while combAssemblyGroup is at X = 0.65 in world)
      // This matches the drum's px = startX + (idx + 0.5) * slotW for 100% pin-to-tine collinearity across all comb types!
      const tx = startX + (idx + 0.5) * slotW;
      const frac = idx / Math.max(1, tinesCount - 1); // 0 = lowest bass, 1 = highest treble
      const isAccidental = Boolean(tine.isFlat || tine.note.includes('b') || tine.note.includes('#'));
      const isBass = frac < 0.36;

      // In authentic horological movements, all tine TIPS meet the cylinder strike line tangent (Z = 0.202, Y = 0.638)
      // while the comb base has an angled undercut so bass tines have a longer free cantilever beam!
      const tineWidth = Math.max(0.024, slotW * (0.84 - frac * 0.22));
      const tineLength = 0.86 - frac * 0.30; // Bass tines: 0.86, Treble: 0.56
      const tineThickness = 0.026 + (1 - frac) * 0.010;

      const baseColor = isAccidental ? 0x2b4263 : 0xdce3ec;
      const tineMat = new THREE.MeshPhysicalMaterial({
        color: baseColor,
        metalness: 0.92,
        roughness: isAccidental ? 0.26 : 0.16,
        clearcoat: 0.6,
        clearcoatRoughness: 0.15,
        anisotropy: 0.7,
      });

      // Pin strike tangent is at Z = 0.202 in world/comb coordinates (cylinder at Z = -0.35 + 0.552)
      // Tip reaches Z = 0.202 at rest, directly above pin rotation path
      const tipZ = 0.202;
      const rootZ = tipZ + tineLength;

      const tineGroup = new THREE.Group();
      tineGroup.position.set(tx, 0.640, rootZ);

      // Tine beam extending from root (z = 0 in local) toward cylinder (z = -tineLength)
      const beamGeo = new THREE.BoxGeometry(tineWidth, tineThickness, tineLength);
      beamGeo.translate(0, 0, -tineLength / 2);
      const beamMesh = new THREE.Mesh(beamGeo, tineMat);
      beamMesh.castShadow = true;
      beamMesh.receiveShadow = true;
      beamMesh.userData = {
        type: 'tine',
        tineIndex: idx,
        label: `Tine #${idx + 1} (${tine.note} · ${tine.frequency.toFixed(1)} Hz)`,
      };
      tineGroup.add(beamMesh);
      sceneRefs.current.clickableObjects.push(beamMesh);

      // Tapered / Beveled strike tip nib
      const tipGeo = new THREE.ConeGeometry(tineWidth * 0.55, 0.045, 4);
      tipGeo.rotateX(-Math.PI / 2);
      tipGeo.rotateZ(Math.PI / 4);
      tipGeo.translate(0, 0, -tineLength - 0.014);
      const tipMesh = new THREE.Mesh(tipGeo, tineMat);
      tineGroup.add(tipMesh);

      // Authentic Lead Tuning Mass Block soldered underneath bass tines
      if (isBass) {
        const weightLen = 0.18 + (0.36 - frac) * 0.28;
        const weightHeight = 0.055 + (0.36 - frac) * 0.04;
        const weightGeo = new THREE.BoxGeometry(tineWidth * 0.88, weightHeight, weightLen);
        weightGeo.translate(0, -tineThickness / 2 - weightHeight / 2, -tineLength * 0.55);
        const weightMesh = new THREE.Mesh(weightGeo, leadMat);
        weightMesh.castShadow = true;
        tineGroup.add(weightMesh);
      }

      // Delicate Sub-Tine Feather Damper strip under the tip
      const damperGeo = new THREE.BoxGeometry(tineWidth * 0.45, 0.016, 0.07);
      damperGeo.translate(0, -tineThickness / 2 - 0.009, -tineLength + 0.038);
      const damperMesh = new THREE.Mesh(damperGeo, damperMat);
      tineGroup.add(damperMesh);

      combTinesGroup.add(tineGroup);
      sceneRefs.current.tineMeshes.push({
        group: tineGroup,
        beamMesh,
        mat: tineMat,
        baseColor,
        tineIndex: idx,
      });
    });
  }, [tinesList]);

  // Update pins and comb tines when props change
  useEffect(() => {
    rebuildPinsInstances();
  }, [rebuildPinsInstances]);

  useEffect(() => {
    rebuildCombTines();
  }, [rebuildCombTines]);

  // Update wood cabinet texture when soundPreset changes
  useEffect(() => {
    const { woodMaterial, renderer } = sceneRefs.current;
    if (!woodMaterial || !renderer) return;
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const newTex = createProceduralWoodTexture(maxAniso, soundPreset);
    if (woodMaterial.map) woodMaterial.map.dispose();
    woodMaterial.map = newTex;
    woodMaterial.needsUpdate = true;
  }, [soundPreset]);

  // Switch camera preset smoothly
  const handleSelectCameraPreset = (presetId: CameraPresetId) => {
    setCameraPreset(presetId);
    const p = CAMERA_PRESETS[presetId];
    cameraPresetTargetRef.current = {
      pos: new THREE.Vector3(...p.pos),
      target: new THREE.Vector3(...p.target),
    };
  };

  // Main Three.js WebGL Initialization (runs once on mount)
  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isEco,
        powerPreference: isEco ? 'low-power' : 'high-performance',
        alpha: false,
      });
    } catch (e) {
      console.warn('WebGL unavailable, falling back:', e);
      setWebglFallback(true);
      return;
    }

    const isHeadless = navigator.webdriver || /HeadlessChrome/i.test(navigator.userAgent);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.setPixelRatio(isHeadless ? 1 : Math.min(window.devicePixelRatio, isEco ? 1.25 : 2));
    renderer.shadowMap.enabled = !isHeadless;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const width = container.clientWidth || 780;
    const height = container.clientHeight || 420;
    renderer.setSize(width, height);
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    sceneRefs.current.renderer = renderer;

    // WebGL Context Loss Safety
    const handleContextLost = (e: Event) => {
      e.preventDefault();
    };
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x110b06);
    scene.fog = new THREE.FogExp2(0x110b06, 0.042);

    // Studio Environment Reflection (Mandatory for realistic PBR brass, steel & crystal)
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 100);
    camera.position.set(...CAMERA_PRESETS.isometric.pos);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.target.set(...CAMERA_PRESETS.isometric.target);
    controls.minDistance = 2.2;
    controls.maxDistance = 14.0;
    controls.maxPolarAngle = Math.PI * 0.49;

    // Stop camera preset lerp if user manually orbits
    const onControlsStart = () => {
      cameraPresetTargetRef.current = null;
    };
    controls.addEventListener('start', onControlsStart);

    // ---------------------------------------------------------
    // 3-POINT HOROLOGICAL STUDIO LIGHTING RIG
    // ---------------------------------------------------------
    const hemiLight = new THREE.HemisphereLight(0xfff4dc, 0x26170a, 0.85);
    hemiLight.position.set(0, 10, 0);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xffe9ba, 2.4);
    keyLight.position.set(4.5, 7.5, 5.0);
    keyLight.castShadow = !isHeadless;
    keyLight.shadow.mapSize.width = isEco ? 1024 : 2048;
    keyLight.shadow.mapSize.height = isEco ? 1024 : 2048;
    const d = 4.2;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.camera.near = 1.0;
    keyLight.shadow.camera.far = 18.0;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x9ec5ff, 0.9);
    fillLight.position.set(-5.0, 4.0, 3.5);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xffd27d, 1.35);
    rimLight.position.set(0.5, 5.0, -5.5);
    scene.add(rimLight);

    // Contact Shadow Grounding Plane
    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = 256;
    shadowCanvas.height = 256;
    const sCtx = shadowCanvas.getContext('2d');
    if (sCtx) {
      const sGrad = sCtx.createRadialGradient(128, 128, 16, 128, 128, 124);
      sGrad.addColorStop(0, 'rgba(0,0,0,0.85)');
      sGrad.addColorStop(0.65, 'rgba(0,0,0,0.35)');
      sGrad.addColorStop(1, 'rgba(0,0,0,0)');
      sCtx.fillStyle = sGrad;
      sCtx.fillRect(0, 0, 256, 256);
    }
    const contactShadowTex = new THREE.CanvasTexture(shadowCanvas);
    const contactShadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(9.5, 6.8),
      new THREE.MeshBasicMaterial({
        map: contactShadowTex,
        transparent: true,
        depthWrite: false,
        opacity: 0.75,
      })
    );
    contactShadowPlane.rotation.x = -Math.PI / 2;
    contactShadowPlane.position.y = -0.58;
    scene.add(contactShadowPlane);

    // ---------------------------------------------------------
    // PROCEDURAL PBR MATERIALS LIBRARY
    // ---------------------------------------------------------
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const woodTex = createProceduralWoodTexture(maxAniso, soundPreset);
    const latheBrassTex = createLatheBrassTexture(maxAniso);
    const plaqueTex = createBedplatePlaqueTexture(maxAniso);

    const woodMat = new THREE.MeshPhysicalMaterial({
      map: woodTex,
      metalness: 0.05,
      roughness: 0.28,
      clearcoat: 0.85,
      clearcoatRoughness: 0.14,
    });
    sceneRefs.current.woodMaterial = woodMat;

    const velvetMat = new THREE.MeshPhysicalMaterial({
      color: 0x3b0d16,
      metalness: 0.0,
      roughness: 0.92,
      sheen: 0.85,
      sheenRoughness: 0.5,
      sheenColor: new THREE.Color(0x8a1c30),
    });

    const castBrassMat = new THREE.MeshPhysicalMaterial({
      color: 0xc89d4c,
      metalness: 0.88,
      roughness: 0.34,
      clearcoat: 0.25,
    });

    const polishedBrassMat = new THREE.MeshPhysicalMaterial({
      map: latheBrassTex,
      color: 0xf5d77f,
      metalness: 0.95,
      roughness: 0.14,
      anisotropy: 0.8,
      clearcoat: 0.4,
    });

    const bronzeGearMat = new THREE.MeshPhysicalMaterial({
      color: 0xb58338,
      metalness: 0.9,
      roughness: 0.25,
      anisotropy: 0.6,
    });

    const chromeSteelMat = new THREE.MeshPhysicalMaterial({
      color: 0xeaf0f6,
      metalness: 0.96,
      roughness: 0.12,
      clearcoat: 0.5,
    });

    const brushedSteelCombMat = new THREE.MeshPhysicalMaterial({
      color: 0xcfd7e0,
      metalness: 0.9,
      roughness: 0.28,
      anisotropy: 0.75,
    });

    const bluedSteelMat = new THREE.MeshPhysicalMaterial({
      color: 0x1e3352,
      metalness: 0.88,
      roughness: 0.22,
      clearcoat: 0.65,
    });

    const nylonGearMat = new THREE.MeshPhysicalMaterial({
      color: 0xf7f1df,
      metalness: 0.05,
      roughness: 0.38,
      clearcoat: 0.3,
    });

    const rubyJewelMat = new THREE.MeshPhysicalMaterial({
      color: 0xe11d48,
      metalness: 0.05,
      roughness: 0.05,
      transmission: 0.88,
      ior: 1.77,
      thickness: 0.3,
      clearcoat: 1.0,
    });

    const crystalGlassMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0.0,
      roughness: 0.04,
      transmission: 0.93,
      ior: 1.52,
      thickness: 0.35,
      transparent: true,
      depthWrite: false,
      clearcoat: 1.0,
    });

    const rosewoodKnobMat = new THREE.MeshPhysicalMaterial({
      color: 0x4a1f0e,
      metalness: 0.05,
      roughness: 0.22,
      clearcoat: 0.9,
    });

    // ---------------------------------------------------------
    // BUILD 7 HIERARCHICAL MECHANICAL ASSEMBLIES
    // ---------------------------------------------------------
    const rootGroup = new THREE.Group();
    scene.add(rootGroup);

    // 1. HEIRLOOM BURL-WALNUT ACOUSTIC CABINET & HINGED CRYSTAL LID
    const cabinetGroup = new THREE.Group();
    rootGroup.add(cabinetGroup);

    // Base acoustic soundboard floor
    const baseBoard = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.26, 4.1), woodMat);
    baseBoard.position.set(0, -0.32, 0);
    baseBoard.castShadow = true;
    baseBoard.receiveShadow = true;
    cabinetGroup.add(baseBoard);

    // Velvet interior soundboard lining
    const velvetFloor = new THREE.Mesh(new THREE.BoxGeometry(5.56, 0.04, 3.46), velvetMat);
    velvetFloor.position.set(0, -0.17, 0);
    velvetFloor.receiveShadow = true;
    cabinetGroup.add(velvetFloor);

    // 4 Mitered Walnut Walls
    const wallH = 1.38;
    const wallY = -0.19 + wallH / 2;
    const frontWall = new THREE.Mesh(new THREE.BoxGeometry(6.1, wallH, 0.24), woodMat);
    frontWall.position.set(0, wallY, 1.9);
    frontWall.castShadow = true;
    frontWall.receiveShadow = true;
    cabinetGroup.add(frontWall);

    const backWall = new THREE.Mesh(new THREE.BoxGeometry(6.1, wallH, 0.24), woodMat);
    backWall.position.set(0, wallY, -1.9);
    backWall.castShadow = true;
    backWall.receiveShadow = true;
    cabinetGroup.add(backWall);

    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.24, wallH, 3.56), woodMat);
    leftWall.position.set(-2.93, wallY, 0);
    leftWall.castShadow = true;
    leftWall.receiveShadow = true;
    cabinetGroup.add(leftWall);

    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.24, wallH, 3.56), woodMat);
    rightWall.position.set(2.93, wallY, 0);
    rightWall.castShadow = true;
    rightWall.receiveShadow = true;
    cabinetGroup.add(rightWall);

    // 4 Turned Brass Ball Feet + Corner Brackets
    const footGeo = new THREE.SphereGeometry(0.18, 20, 16);
    const cornerBracketGeo = new THREE.BoxGeometry(0.42, wallH + 0.04, 0.42);
    [
      [-2.85, 1.82],
      [2.85, 1.82],
      [-2.85, -1.82],
      [2.85, -1.82],
    ].forEach(([cx, cz]) => {
      const foot = new THREE.Mesh(footGeo, polishedBrassMat);
      foot.position.set(cx, -0.46, cz);
      foot.scale.set(1, 0.72, 1);
      cabinetGroup.add(foot);

      const bracket = new THREE.Mesh(cornerBracketGeo, castBrassMat);
      bracket.position.set(cx, wallY, cz);
      cabinetGroup.add(bracket);
    });

    // Interior Soundhole Acoustic Brass Rosette Ring
    const rosetteRing = new THREE.Mesh(
      new THREE.RingGeometry(0.32, 0.46, 32),
      polishedBrassMat
    );
    rosetteRing.rotation.x = -Math.PI / 2;
    rosetteRing.position.set(0.65, -0.145, 0);
    cabinetGroup.add(rosetteRing);

    // Hinged Beveled Crystal Glass Lid (pivots along back wall Z = -1.9, Y = 1.19)
    const lidPivotGroup = new THREE.Group();
    lidPivotGroup.position.set(0, 1.19, -1.9);
    cabinetGroup.add(lidPivotGroup);

    // Wooden outer lid frame around the glass pane
    const lidFrameF = new THREE.Mesh(new THREE.BoxGeometry(6.1, 0.14, 0.28), woodMat);
    lidFrameF.position.set(0, 0.07, 3.8);
    lidPivotGroup.add(lidFrameF);
    const lidFrameB = new THREE.Mesh(new THREE.BoxGeometry(6.1, 0.14, 0.28), woodMat);
    lidFrameB.position.set(0, 0.07, 0);
    lidPivotGroup.add(lidFrameB);
    const lidFrameL = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.14, 3.56), woodMat);
    lidFrameL.position.set(-2.91, 0.07, 1.9);
    lidPivotGroup.add(lidFrameL);
    const lidFrameR = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.14, 3.56), woodMat);
    lidFrameR.position.set(2.91, 0.07, 1.9);
    lidPivotGroup.add(lidFrameR);

    // Brass Hinge Barrels
    [-1.8, 1.8].forEach((hx) => {
      const hinge = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, 0.45, 16),
        polishedBrassMat
      );
      hinge.rotation.z = Math.PI / 2;
      hinge.position.set(hx, 0.02, 0);
      lidPivotGroup.add(hinge);
    });

    // Crystal Exhibition Glass Pane
    const glassPane = new THREE.Mesh(new THREE.BoxGeometry(5.54, 0.06, 3.52), crystalGlassMat);
    glassPane.position.set(0, 0.07, 1.9);
    glassPane.renderOrder = 10;
    lidPivotGroup.add(glassPane);

    // ---------------------------------------------------------
    // 2. CAST-BRASS BEDPLATE CHASSIS (`bedplateGroup`)
    // ---------------------------------------------------------
    const bedplateGroup = new THREE.Group();
    rootGroup.add(bedplateGroup);

    // Main heavy cast-brass bedplate
    const bedplateMain = new THREE.Mesh(new THREE.BoxGeometry(5.1, 0.18, 3.0), castBrassMat);
    bedplateMain.position.set(0, 0.02, 0);
    bedplateMain.castShadow = true;
    bedplateMain.receiveShadow = true;
    bedplateGroup.add(bedplateMain);

    // Raised comb mounting shelf on bedplate
    const combShelf = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.42, 0.78), castBrassMat);
    combShelf.position.set(0.65, 0.23, 1.05);
    combShelf.castShadow = true;
    combShelf.receiveShadow = true;
    bedplateGroup.add(combShelf);

    // Left & Right Cylinder Journal Pillow Blocks (Bearing Stands)
    const leftPillow = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.72, 0.42), castBrassMat);
    leftPillow.position.set(-0.98, 0.42, -0.35);
    leftPillow.castShadow = true;
    bedplateGroup.add(leftPillow);

    const rightPillow = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.76, 0.44), castBrassMat);
    rightPillow.position.set(2.26, 0.44, -0.35);
    rightPillow.castShadow = true;
    bedplateGroup.add(rightPillow);

    // Right Journal Ruby Endstone & Chrome Cap Screw
    const rightJournalCap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.11, 0.08, 20),
      chromeSteelMat
    );
    rightJournalCap.rotation.z = Math.PI / 2;
    rightJournalCap.position.set(2.39, 0.62, -0.35);
    bedplateGroup.add(rightJournalCap);

    // Maker's Plaque ("聲 盒 仔")
    const plaqueMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1.15, 0.04, 0.32),
      new THREE.MeshStandardMaterial({ map: plaqueTex, metalness: 0.5, roughness: 0.4 })
    );
    plaqueMesh.position.set(-1.72, 0.12, 1.18);
    bedplateGroup.add(plaqueMesh);

    // 4 Slotted Chrome Bedplate Corner Mounting Bolts + Brass Bushings
    const screwDomeGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.06, 20);
    const screwSlotGeo = new THREE.BoxGeometry(0.16, 0.03, 0.025);
    const slotDarkMat = new THREE.MeshBasicMaterial({ color: 0x14100c });
    [
      [-2.32, -1.28],
      [2.32, -1.28],
      [-2.32, 1.28],
      [2.32, 1.28],
    ].forEach(([sx, sz], i) => {
      const boltGroup = new THREE.Group();
      boltGroup.position.set(sx, 0.14, sz);
      const dome = new THREE.Mesh(screwDomeGeo, chromeSteelMat);
      const slot = new THREE.Mesh(screwSlotGeo, slotDarkMat);
      slot.position.y = 0.025;
      slot.rotation.y = i * 0.7;
      boltGroup.add(dome, slot);
      bedplateGroup.add(boltGroup);
    });

    // ---------------------------------------------------------
    // 3. MAINSPRING BARREL, COILED SPRING & RATCHET PAWL (`springBarrelGroup`)
    // ---------------------------------------------------------
    const springBarrelGroup = new THREE.Group();
    springBarrelGroup.position.set(-1.78, 0.45, -0.38);
    rootGroup.add(springBarrelGroup);

    // Lathe-turned stepped brass mainspring housing barrel
    const barrelPoints = [
      new THREE.Vector2(0, -0.32),
      new THREE.Vector2(0.58, -0.32),
      new THREE.Vector2(0.62, -0.28),
      new THREE.Vector2(0.62, 0.22),
      new THREE.Vector2(0.56, 0.28),
      new THREE.Vector2(0.46, 0.28),
      new THREE.Vector2(0.46, 0.18),
      new THREE.Vector2(0.0, 0.18),
    ];
    const barrelLatheGeo = new THREE.LatheGeometry(barrelPoints, 40);
    const barrelMesh = new THREE.Mesh(barrelLatheGeo, polishedBrassMat);
    barrelMesh.castShadow = true;
    barrelMesh.receiveShadow = true;
    barrelMesh.userData = {
      type: 'spring-barrel',
      label: 'Mainspring Barrel & Ratchet Click (Click to Wind)',
    };
    springBarrelGroup.add(barrelMesh);
    sceneRefs.current.clickableObjects.push(barrelMesh);

    // Visible Coiled Blued-Steel Mainspring Spiral inside recessed barrel top
    const spiralCurvePoints: THREE.Vector3[] = [];
    const spiralTurns = 4.5;
    const spiralSamples = 140;
    for (let i = 0; i <= spiralSamples; i++) {
      const t = i / spiralSamples;
      const a = t * spiralTurns * Math.PI * 2;
      const r = 0.12 + t * 0.31;
      spiralCurvePoints.push(new THREE.Vector3(Math.cos(a) * r, 0.21, Math.sin(a) * r));
    }
    const spiralCurve = new THREE.CatmullRomCurve3(spiralCurvePoints);
    const springCoilGeo = new THREE.TubeGeometry(spiralCurve, 120, 0.018, 6, false);
    const springCoilMesh = new THREE.Mesh(springCoilGeo, bluedSteelMat);
    springBarrelGroup.add(springCoilMesh);
    sceneRefs.current.springCoilMesh = springCoilMesh;

    // Mainspring Center Winding Arbor Shaft
    const arborShaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 0.85, 20),
      chromeSteelMat
    );
    arborShaft.position.set(0, 0.18, 0);
    springBarrelGroup.add(arborShaft);

    // 16-Tooth Asymmetric Steel Ratchet Wheel on Winding Arbor
    const ratchetGeo = createRatchetWheelGeometry(0.28, 16, 0.05);
    ratchetGeo.rotateX(Math.PI / 2);
    const ratchetWheelMesh = new THREE.Mesh(ratchetGeo, chromeSteelMat);
    ratchetWheelMesh.position.set(0, 0.32, 0);
    springBarrelGroup.add(ratchetWheelMesh);

    // Pivoting Steel Click Pawl (Detent Dog) & Brass Recoil Wire Spring
    const clickPawlGroup = new THREE.Group();
    clickPawlGroup.position.set(0.34, 0.32, 0.16);
    springBarrelGroup.add(clickPawlGroup);

    const pawlBody = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.045, 0.065), bluedSteelMat);
    pawlBody.position.set(-0.08, 0, -0.04);
    pawlBody.rotation.y = 0.45;
    const pawlPin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 0.08, 12),
      polishedBrassMat
    );
    clickPawlGroup.add(pawlBody, pawlPin);

    // ---------------------------------------------------------
    // 4. REVOLVING BRASS CYLINDER & INSTANCED 3D PINS (`cylinderAssemblyGroup`)
    // ---------------------------------------------------------
    const cylinderAssemblyGroup = new THREE.Group();
    cylinderAssemblyGroup.position.set(0.65, 0.62, -0.35);
    rootGroup.add(cylinderAssemblyGroup);

    const cylinderRotatingGroup = new THREE.Group();
    cylinderAssemblyGroup.add(cylinderRotatingGroup);
    sceneRefs.current.cylinderGroup = cylinderRotatingGroup;

    // Main Lathe-Turned Brass Drum (aligned along X axis, length 2.85, radius 0.52)
    const drumGeo = new THREE.CylinderGeometry(0.52, 0.52, 2.85, 48, 1, false);
    drumGeo.rotateZ(Math.PI / 2);
    const drumMesh = new THREE.Mesh(drumGeo, polishedBrassMat);
    drumMesh.castShadow = true;
    drumMesh.receiveShadow = true;
    cylinderRotatingGroup.add(drumMesh);

    // Recessed Dark End Caps & Center Steel Axle Rod
    const axleRod = new THREE.Mesh(
      new THREE.CylinderGeometry(0.075, 0.075, 3.35, 20),
      chromeSteelMat
    );
    axleRod.rotateZ(Math.PI / 2);
    cylinderRotatingGroup.add(axleRod);

    // Left 32-Tooth Involute Bronze Drive Spur Gear (mounted on left end of cylinder)
    const mainSpurGearGeo = createSpurGearGeometry(0.58, 32, 0.12, 0.065, 0.08);
    mainSpurGearGeo.rotateY(Math.PI / 2);
    const mainSpurGearMesh = new THREE.Mesh(mainSpurGearGeo, bronzeGearMat);
    mainSpurGearMesh.position.set(-1.49, 0, 0);
    mainSpurGearMesh.castShadow = true;
    cylinderRotatingGroup.add(mainSpurGearMesh);

    // InstancedMesh for up to 1024 3D Brass Song Pins on the cylinder
    const pinGeo = new THREE.CylinderGeometry(0.016, 0.022, 0.085, 8);
    const pinsInstanced = new THREE.InstancedMesh(pinGeo, polishedBrassMat, 1024);
    pinsInstanced.castShadow = true;
    pinsInstanced.frustumCulled = false;
    cylinderRotatingGroup.add(pinsInstanced);
    sceneRefs.current.pinsInstancedMesh = pinsInstanced;

    // ---------------------------------------------------------
    // 5. TUNED SPRING-STEEL COMB & CLAMPING BLOCK (`combAssemblyGroup`)
    // ---------------------------------------------------------
    const combAssemblyGroup = new THREE.Group();
    combAssemblyGroup.position.set(0.65, 0, 0);
    rootGroup.add(combAssemblyGroup);

    // Heavy Tempered Spring-Steel Comb Base Block with angled clamping bevel
    // Front clamping edge follows the tine root line (from X = -1.54, Z = 1.074 to X = +1.54, Z = 0.750)
    const combBaseShape = new THREE.Shape();
    combBaseShape.moveTo(-1.54, 1.074);
    combBaseShape.lineTo(1.54, 0.750);
    combBaseShape.lineTo(1.54, 1.340);
    combBaseShape.lineTo(-1.54, 1.340);
    combBaseShape.closePath();

    const combBlockGeo = new THREE.ExtrudeGeometry(combBaseShape, {
      depth: 0.16,
      bevelEnabled: true,
      bevelThickness: 0.02,
      bevelSize: 0.02,
      bevelSegments: 2,
    });
    combBlockGeo.rotateX(Math.PI / 2);
    const combBlockMesh = new THREE.Mesh(combBlockGeo, brushedSteelCombMat);
    combBlockMesh.position.set(0, 0.68, 0);
    combBlockMesh.castShadow = true;
    combBlockMesh.receiveShadow = true;
    combAssemblyGroup.add(combBlockMesh);

    // 2 Large Slotted Dome Comb Clamping Screws + Belleville Washers
    [-1.15, 1.15].forEach((cx, idx) => {
      const clampBoltGroup = new THREE.Group();
      clampBoltGroup.position.set(cx, 0.70, 1.18);

      const washer = new THREE.Mesh(
        new THREE.CylinderGeometry(0.20, 0.22, 0.03, 24),
        bronzeGearMat
      );
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.55),
        chromeSteelMat
      );
      head.position.y = 0.01;
      const slot = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.05, 0.035), slotDarkMat);
      slot.position.y = 0.14;
      slot.rotation.y = idx === 0 ? 0.25 : -0.35;

      clampBoltGroup.add(washer, head, slot);
      combAssemblyGroup.add(clampBoltGroup);
    });

    // Dynamic Tines Container Group
    const combTinesGroup = new THREE.Group();
    combAssemblyGroup.add(combTinesGroup);
    sceneRefs.current.combTinesGroup = combTinesGroup;

    // ---------------------------------------------------------
    // 6. ESCAPEMENT GEAR TRAIN, HELICAL WORM, RUBY JEWELS & BRAKE LEVER (`governorGroup`)
    // ---------------------------------------------------------
    const governorGroup = new THREE.Group();
    governorGroup.position.set(-1.55, 0.36, 0.52);
    rootGroup.add(governorGroup);

    // Intermediate Step-Up Gear (Ivory Nylon Crown Wheel + Brass Pinion)
    const interGearGroup = new THREE.Group();
    interGearGroup.position.set(0.38, 0.08, -0.22);
    governorGroup.add(interGearGroup);

    const nylonGearGeo = createSpurGearGeometry(0.34, 22, 0.06, 0.04, 0.06);
    nylonGearGeo.rotateX(Math.PI / 2);
    const nylonGearMesh = new THREE.Mesh(nylonGearGeo, nylonGearMat);
    nylonGearMesh.castShadow = true;
    const brassHubMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 0.14, 20),
      polishedBrassMat
    );
    const interPinionGeo = createSpurGearGeometry(0.14, 10, 0.22, 0.03, 0.04);
    interPinionGeo.rotateX(Math.PI / 2);
    const interPinionMesh = new THREE.Mesh(interPinionGeo, bronzeGearMat);
    interPinionMesh.position.y = 0.12;
    interGearGroup.add(nylonGearMesh, brassHubMesh, interPinionMesh);

    // Vertical Helical Worm Spindle + Dual-Vane Air-Friction Butterfly Governor
    const wormSpindleGroup = new THREE.Group();
    wormSpindleGroup.position.set(-0.12, 0.24, 0.15);
    governorGroup.add(wormSpindleGroup);

    const wormShaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.032, 0.032, 0.72, 16),
      chromeSteelMat
    );
    wormSpindleGroup.add(wormShaft);

    // 3D Helical Worm Screw Thread
    const helixPts: THREE.Vector3[] = [];
    for (let i = 0; i <= 60; i++) {
      const t = i / 60;
      const a = t * Math.PI * 2 * 5;
      helixPts.push(
        new THREE.Vector3(Math.cos(a) * 0.055, -0.18 + t * 0.28, Math.sin(a) * 0.055)
      );
    }
    const helixGeo = new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(helixPts),
      64,
      0.016,
      8,
      false
    );
    const helixMesh = new THREE.Mesh(helixGeo, polishedBrassMat);
    wormSpindleGroup.add(helixMesh);

    // Centrifugal Air-Friction Butterfly Vane Fan
    const vaneLeft = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.18, 0.018), polishedBrassMat);
    const vaneHub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.065, 0.065, 0.22, 16),
      bronzeGearMat
    );
    vaneLeft.position.y = 0.18;
    vaneHub.position.y = 0.18;
    wormSpindleGroup.add(vaneLeft, vaneHub);

    // Horological Teardrop Top Cock Bracket & Synthetic Ruby Jewel Bearing
    const cockBridge = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.06, 0.24), castBrassMat);
    cockBridge.position.set(-0.24, 0.62, 0.15);
    const cockPillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.08, 0.64, 16),
      castBrassMat
    );
    cockPillar.position.set(-0.42, 0.3, 0.15);
    const upperRubyChaton = new THREE.Mesh(
      new THREE.CylinderGeometry(0.065, 0.065, 0.075, 20),
      polishedBrassMat
    );
    upperRubyChaton.position.set(-0.12, 0.63, 0.15);
    const upperRubyJewel = new THREE.Mesh(
      new THREE.SphereGeometry(0.048, 16, 12),
      rubyJewelMat
    );
    upperRubyJewel.position.set(-0.12, 0.66, 0.15);
    const lowerRubyJewel = new THREE.Mesh(
      new THREE.SphereGeometry(0.045, 16, 12),
      rubyJewelMat
    );
    lowerRubyJewel.position.set(-0.12, -0.12, 0.15);
    governorGroup.add(cockBridge, cockPillar, upperRubyChaton, upperRubyJewel, lowerRubyJewel);

    // MECHANICAL STOP-ARM / WHIP BRAKE LEVER (Engages Governor Fan when Paused!)
    const brakeAssemblyGroup = new THREE.Group();
    brakeAssemblyGroup.position.set(-0.12, 0.12, 0.56);
    governorGroup.add(brakeAssemblyGroup);

    // Sliding Brass Switch Knob & Whip Wire Finger
    const brakeThumbKnob = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.12, 0.18, 20),
      polishedBrassMat
    );
    brakeThumbKnob.position.set(0, 0.12, 0.18);
    brakeThumbKnob.userData = {
      type: 'brake-lever',
      label: 'Mechanical Governor Stop-Arm Brake (Click to Release / Lock)',
    };
    sceneRefs.current.clickableObjects.push(brakeThumbKnob);

    // Spring-steel whip wire extending from knob to the governor fan blade path
    const whipWirePts = [
      new THREE.Vector3(0, 0.16, 0.18),
      new THREE.Vector3(0.08, 0.3, 0.02),
      new THREE.Vector3(0.04, 0.32, -0.24),
    ];
    const whipWireGeo = new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(whipWirePts),
      20,
      0.014,
      8,
      false
    );
    const whipWireMesh = new THREE.Mesh(whipWireGeo, chromeSteelMat);
    brakeAssemblyGroup.add(brakeThumbKnob, whipWireMesh);

    // ---------------------------------------------------------
    // 7. ATTACHED 3D DRIVE MECHANISM (KEY / HAND CRANK / MOTOR) (`driveGroup`)
    // ---------------------------------------------------------
    const driveGroup = new THREE.Group();
    driveGroup.position.set(-1.78, 0.92, -0.38);
    rootGroup.add(driveGroup);

    // 7A: Cast-Brass Double-Winged Butterfly Winding Key (Spring Mode)
    const butterflyKeyGroup = new THREE.Group();
    driveGroup.add(butterflyKeyGroup);
    sceneRefs.current.butterflyKeyGroup = butterflyKeyGroup;

    const keyHub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.12, 0.36, 20),
      polishedBrassMat
    );
    butterflyKeyGroup.add(keyHub);

    [-1, 1].forEach((dir) => {
      const wingRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.24, 0.045, 14, 28),
        polishedBrassMat
      );
      wingRing.position.set(dir * 0.28, 0.12, 0);
      wingRing.scale.set(1.15, 0.85, 1);
      wingRing.userData = {
        type: 'winding-key',
        label: 'Butterfly Winding Key (Click to Wind +1 Round)',
      };
      butterflyKeyGroup.add(wingRing);
      sceneRefs.current.clickableObjects.push(wingRing);
    });

    // 7B: Forged Brass S-Arm Hand Crank with Turned Rosewood Knob (Crank Mode)
    const handCrankGroup = new THREE.Group();
    driveGroup.add(handCrankGroup);
    sceneRefs.current.handCrankGroup = handCrankGroup;

    const crankArmCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.08, 0),
      new THREE.Vector3(0.32, 0.14, 0.08),
      new THREE.Vector3(0.68, 0.24, -0.05),
      new THREE.Vector3(0.92, 0.28, 0),
    ]);
    const crankArmGeo = new THREE.TubeGeometry(crankArmCurve, 28, 0.055, 12, false);
    const crankArmMesh = new THREE.Mesh(crankArmGeo, polishedBrassMat);
    const crankPin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 0.42, 16),
      chromeSteelMat
    );
    crankPin.position.set(0.92, 0.48, 0);
    const rosewoodKnob = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.11, 0.26, 12, 20),
      rosewoodKnobMat
    );
    rosewoodKnob.position.set(0.92, 0.56, 0);
    rosewoodKnob.userData = {
      type: 'hand-crank',
      label: 'Turned Rosewood Hand Crank (Click/Spin to Advance Cylinder)',
    };
    sceneRefs.current.clickableObjects.push(rosewoodKnob);
    handCrankGroup.add(crankArmMesh, crankPin, rosewoodKnob);

    // 7C: Synchronous Electric Clockwork Drive Motor (Continuous Mode)
    const electricMotorGroup = new THREE.Group();
    driveGroup.add(electricMotorGroup);
    sceneRefs.current.electricMotorGroup = electricMotorGroup;

    const motorCan = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.28, 0.34, 24),
      bronzeGearMat
    );
    const flywheelRim = new THREE.Mesh(
      new THREE.TorusGeometry(0.34, 0.04, 14, 32),
      polishedBrassMat
    );
    flywheelRim.rotation.x = Math.PI / 2;
    flywheelRim.position.y = 0.22;
    electricMotorGroup.add(motorCan, flywheelRim);

    // Populate initial pins & comb tines
    rebuildPinsInstances();
    rebuildCombTines();

    // Pre-warm shaders once
    renderer.compile(scene, camera);

    // ---------------------------------------------------------
    // HIGH-PERFORMANCE RAYCASTING & GLISSANDO INTERACTION
    // ---------------------------------------------------------
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let isPointerDownOnTines = false;
    let lastPluckedIdx: number | null = null;
    let pointerDownPos = { x: 0, y: 0 };
    let lastHoverTime = 0;

    const getIntersectedActionObject = (clientX: number, clientY: number) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(sceneRefs.current.clickableObjects, false);
      return hits.length > 0 ? hits[0].object : null;
    };

    const handlePointerDown = (e: PointerEvent) => {
      pointerDownPos = { x: e.clientX, y: e.clientY };
      const hitObj = getIntersectedActionObject(e.clientX, e.clientY);
      if (hitObj && hitObj.userData?.type === 'tine') {
        // Disable orbit while glissando plucking across tines
        controls.enabled = false;
        isPointerDownOnTines = true;
        const idx = hitObj.userData.tineIndex;
        lastPluckedIdx = idx;
        onPluckTineRef.current(idx);
        activeTineTimestampsRef.current.set(idx, performance.now());
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (isPointerDownOnTines) {
        const hitObj = getIntersectedActionObject(e.clientX, e.clientY);
        if (hitObj && hitObj.userData?.type === 'tine') {
          const idx = hitObj.userData.tineIndex;
          if (idx !== lastPluckedIdx) {
            lastPluckedIdx = idx;
            onPluckTineRef.current(idx);
            activeTineTimestampsRef.current.set(idx, performance.now());
          }
        }
        return;
      }

      // Throttled hover inspection (20fps max)
      const now = performance.now();
      if (now - lastHoverTime < 50) return;
      lastHoverTime = now;

      const hitObj = getIntersectedActionObject(e.clientX, e.clientY);
      if (hitObj && hitObj.userData?.label) {
        renderer.domElement.style.cursor = 'pointer';
        setHoveredPartLabel(hitObj.userData.label);
      } else {
        renderer.domElement.style.cursor = 'grab';
        setHoveredPartLabel(null);
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (isPointerDownOnTines) {
        isPointerDownOnTines = false;
        lastPluckedIdx = null;
        controls.enabled = true;
        return;
      }

      const dist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
      if (dist < 6) {
        const hitObj = getIntersectedActionObject(e.clientX, e.clientY);
        if (hitObj) {
          const type = hitObj.userData?.type;
          if (type === 'brake-lever') {
            musicBoxAudio.playLeverClick(!isPlayingRef.current);
            onTogglePlayRef.current?.();
          } else if (type === 'winding-key' || type === 'spring-barrel') {
            musicBoxAudio.playRatchetClick(1.0);
            onWindSpringRef.current?.(0.334);
          } else if (type === 'hand-crank') {
            onManualCrankAdvanceRef.current?.(0.35, 42);
          }
        }
      }
    };

    const domElem = renderer.domElement;
    domElem.addEventListener('pointerdown', handlePointerDown);
    domElem.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    // ---------------------------------------------------------
    // ANIMATION & KINEMATICS LOOP
    // ---------------------------------------------------------
    let animFrameId: number | null = null;
    let lastTime = performance.now();
    let governorSpinAngle = 0;
    let driveKeySpinAngle = 0;
    let brakeBlend = isPlayingRef.current ? 1 : 0;
    let lidAngleBlend = 1.05; // Open lid angle in radians

    const animate = (now: number) => {
      animFrameId = requestAnimationFrame(animate);
      if (document.hidden) return;

      const dt = Math.min(0.1, (now - lastTime) / 1000);
      lastTime = now;

      // 1. Smoothly damp Exploded View separation
      explodedCurrentRef.current = THREE.MathUtils.damp(
        explodedCurrentRef.current,
        explodedTargetRef.current,
        6.5,
        dt
      );
      const exp = explodedCurrentRef.current;

      cabinetGroup.position.y = -exp * 0.85;
      bedplateGroup.position.y = 0;
      springBarrelGroup.position.set(-1.78 - exp * 0.55, 0.45 + exp * 0.45, -0.38);
      cylinderAssemblyGroup.position.set(0.65, 0.62 + exp * 0.95, -0.35 - exp * 0.25);
      combAssemblyGroup.position.set(0.65, exp * 0.55, exp * 0.65);
      governorGroup.position.set(-1.55 - exp * 0.35, 0.36 + exp * 0.8, 0.52 + exp * 0.4);
      driveGroup.position.set(-1.78 - exp * 0.55, 0.92 + exp * 1.45, -0.38);

      // 2. Case & Hinged Glass Lid Visibility / Angle
      const currentCaseMode = caseModeRef.current;
      cabinetGroup.visible = currentCaseMode !== 'chassis-only';
      const targetLidAngle = currentCaseMode === 'open-lid' ? -1.12 : 0.0;
      lidAngleBlend = THREE.MathUtils.damp(lidAngleBlend, targetLidAngle, 7.0, dt);
      lidPivotGroup.rotation.x = lidAngleBlend;

      // 3. Drive Mode Visibility (Spring Key vs Hand Crank vs Continuous Motor)
      const mode = playModeRef.current;
      if (sceneRefs.current.butterflyKeyGroup) {
        sceneRefs.current.butterflyKeyGroup.visible = mode === 'spring';
      }
      if (sceneRefs.current.handCrankGroup) {
        sceneRefs.current.handCrankGroup.visible = mode === 'crank';
      }
      if (sceneRefs.current.electricMotorGroup) {
        sceneRefs.current.electricMotorGroup.visible = mode === 'continuous';
      }

      // 4. Cylinder Rotation synchronized with `smoothStepRef`
      const stepFrac = smoothStepRef.current / Math.max(1, totalStepsRef.current);
      const cylAngle = stepFrac * Math.PI * 2;
      cylinderRotatingGroup.rotation.x = cylAngle;

      // 5. Governor & Gear Train Kinematics + Mechanical Brake Lever
      const isCranking = mode === 'crank' && crankRpmRef.current > 0.5;
      const shouldSpin = isPlayingRef.current || isCranking;

      // Smoothly move the mechanical governor stop-arm brake lever
      const targetBrake = shouldSpin ? 1.0 : 0.0;
      brakeBlend = THREE.MathUtils.damp(brakeBlend, targetBrake, 12.0, dt);
      // When brakeBlend === 0 (LOCKED), whip wire rests against fan; when 1 (RELEASED), swings clear
      brakeAssemblyGroup.position.x = -0.12 - brakeBlend * 0.14;
      brakeAssemblyGroup.rotation.y = brakeBlend * 0.38;

      if (shouldSpin) {
        let govVel = 0;
        if (isCranking) {
          govVel = (crankRpmRef.current / 60) * Math.PI * 14.0;
        } else {
          const factor = mode === 'spring' ? Math.max(0.4, springTensionRef.current) : 1.0;
          govVel = (tempoBpmRef.current / 88) * factor * Math.PI * 12.0;
        }
        governorSpinAngle += govVel * dt;
        driveKeySpinAngle += govVel * 0.08 * dt;
      }

      wormSpindleGroup.rotation.y = governorSpinAngle;
      interGearGroup.rotation.y = -governorSpinAngle * 0.18;

      // Ratchet wheel and click pawl motion
      ratchetWheelMesh.rotation.y = driveKeySpinAngle;
      const toothPhase = ((driveKeySpinAngle * 16) / (Math.PI * 2)) % 1;
      clickPawlGroup.rotation.y = Math.max(0, Math.sin(toothPhase * Math.PI)) * 0.22;

      if (mode === 'spring' && sceneRefs.current.butterflyKeyGroup) {
        sceneRefs.current.butterflyKeyGroup.rotation.y = springTensionRef.current * Math.PI * 6;
      } else if (mode === 'crank' && sceneRefs.current.handCrankGroup) {
        sceneRefs.current.handCrankGroup.rotation.y = cylAngle * 4.0;
      } else if (mode === 'continuous' && sceneRefs.current.electricMotorGroup) {
        sceneRefs.current.electricMotorGroup.rotation.y = governorSpinAngle * 0.35;
      }

      // Mainspring coil tightens as `springTension` increases
      if (sceneRefs.current.springCoilMesh) {
        const sScale = 1.0 - springTensionRef.current * 0.22;
        sceneRefs.current.springCoilMesh.scale.set(sScale, 1, sScale);
      }

      // 6. Real-Time Tine Pre-Pluck Lift & Flexural Harmonic Vibration
      const total = Math.max(1, totalStepsRef.current);
      const currStep = smoothStepRef.current;
      const currentPins = pinsRef.current;

      for (let i = 0; i < sceneRefs.current.tineMeshes.length; i++) {
        const tm = sceneRefs.current.tineMeshes[i];
        const idx = tm.tineIndex;

        // Check if a pin is currently lifting this tine right before the strike point
        let liftDeflection = 0;
        for (let p = 0; p < currentPins.length; p++) {
          const pin = currentPins[p];
          if (pin.tineIndex !== idx) continue;
          let delta = (pin.step - currStep) % total;
          if (delta < -total / 2) delta += total;
          if (delta > total / 2) delta -= total;
          // As pin approaches from stepDelta = 0.55 down to 0, it lifts the tine tip upward
          if (delta >= 0 && delta <= 0.55) {
            const liftProgress = 1.0 - delta / 0.55;
            liftDeflection = Math.max(liftDeflection, liftProgress * 0.055);
          }
        }

        // Check post-strike damped harmonic oscillation
        const pluckTime = activeTineTimestampsRef.current.get(idx);
        let vibAngle = 0;
        let glowAmount = 0;
        if (pluckTime !== undefined) {
          const ageSec = (now - pluckTime) / 1000;
          if (ageSec < 0.65) {
            const env = Math.exp(-ageSec * 7.5);
            vibAngle = Math.sin(ageSec * 68.0) * 0.065 * env;
            glowAmount = env;
          } else {
            activeTineTimestampsRef.current.delete(idx);
          }
        }

        tm.group.rotation.x = liftDeflection + vibAngle;

        if (glowAmount > 0.02) {
          _color.setHex(tm.baseColor).lerp(_color.setHex(0xffd66b), glowAmount * 0.75);
          tm.mat.color.copy(_color);
          tm.mat.emissive.setHex(0xd4942a);
          tm.mat.emissiveIntensity = glowAmount * 0.55;
        } else {
          tm.mat.color.setHex(tm.baseColor);
          tm.mat.emissiveIntensity = 0;
        }
      }

      // 7. Smooth Camera Preset Interpolation
      if (cameraPresetTargetRef.current) {
        camera.position.lerp(cameraPresetTargetRef.current.pos, 1 - Math.exp(-6.5 * dt));
        controls.target.lerp(cameraPresetTargetRef.current.target, 1 - Math.exp(-6.5 * dt));
        if (
          camera.position.distanceTo(cameraPresetTargetRef.current.pos) < 0.02 &&
          controls.target.distanceTo(cameraPresetTargetRef.current.target) < 0.02
        ) {
          cameraPresetTargetRef.current = null;
        }
      }

      controls.update();
      renderer.render(scene, camera);
    };

    animFrameId = requestAnimationFrame(animate);

    // Responsive ResizeObserver
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        const h = entry.contentRect.height;
        if (w > 0 && h > 0) {
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h);
        }
      }
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      if (animFrameId) cancelAnimationFrame(animFrameId);
      controls.removeEventListener('start', onControlsStart);
      controls.dispose();
      domElem.removeEventListener('pointerdown', handlePointerDown);
      domElem.removeEventListener('pointermove', handlePointerMove);
      domElem.removeEventListener('webglcontextlost', handleContextLost);
      window.removeEventListener('pointerup', handlePointerUp);
      renderer.dispose();
    };
  }, [isEco]);

  if (webglFallback) {
    return null;
  }

  return (
    <div className="relative w-full aspect-[780/410] sm:aspect-[780/390] bg-[#110b06] rounded-2xl border-2 border-[#6e4f26] overflow-hidden shadow-[inset_0_4px_24px_rgba(0,0,0,0.9),0_8px_28px_rgba(0,0,0,0.6)] ring-1 ring-[#d4af62]/40 select-none">
      {/* Dedicated Isolated WebGL Mount Container */}
      <div ref={canvasMountRef} className="w-full h-full block" />

      {/* Top-Left Spec & Hovered Mechanical Component Inspection Readout */}
      <div className="absolute top-2.5 left-3 z-10 pointer-events-none flex flex-wrap items-center gap-2">
        <div className="px-2.5 py-1 rounded-lg bg-[#160f08]/90 border border-[#6e4f26]/80 text-[11px] font-serif text-[#faebd4] shadow-md flex items-center gap-2">
          <Box className="w-3.5 h-3.5 text-[#f0c465]" />
          <span className="font-semibold tracking-wide">3D Horological Movement</span>
          <span className="text-[#9e8260]" aria-hidden="true">·</span>
          <span className="text-[#caa87c] font-mono text-[10px]">
            Drag to Orbit · Click Tines to Pluck
          </span>
        </div>

        {hoveredPartLabel && (
          <div className="px-2.5 py-1 rounded-lg bg-[#261a0e]/95 border border-[#dfc282] text-[11px] font-serif text-[#fff3c4] shadow-md">
            {hoveredPartLabel}
          </div>
        )}
      </div>

      {/* Top-Right View Mode Switcher (Switch to 2D Orthographic Blueprint) */}
      {onSwitchTo2D && (
        <div className="absolute top-2.5 right-3 z-10 flex items-center gap-1.5">
          <button
            onClick={onSwitchTo2D}
            className="px-2.5 py-1 rounded-lg bg-[#1c130a]/95 hover:bg-[#2e2011] border border-[#8a6838] hover:border-[#f0c465] text-[11px] font-serif font-semibold text-[#faebd4] shadow-md transition-colors cursor-pointer flex items-center gap-1.5"
            title="Switch to 2D Top-View Horological Blueprint"
          >
            <Layers className="w-3.5 h-3.5 text-[#f0c465]" />
            <span>2D Blueprint View</span>
          </button>
        </div>
      )}

      {/* UNIFIED COLLAPSIBLE BOTTOM CONTROL DOCK (Zero Viewport Occlusion, No backdrop-filter) */}
      <div
        className={`absolute bottom-2.5 left-1/2 -translate-x-1/2 z-10 w-[95%] max-w-[820px] transition-transform duration-200 ${
          isHudCollapsed ? 'translate-y-[calc(100%-26px)]' : 'translate-y-0'
        }`}
      >
        {/* Collapse / Expand Zen Mode Tab */}
        <div className="flex justify-center mb-1">
          <button
            onClick={() => setIsHudCollapsed((prev) => !prev)}
            className="px-3 py-0.5 rounded-t-lg bg-[#181008]/95 hover:bg-[#281b0e] border-t border-x border-[#6e4f26] text-[10px] font-serif text-[#dfc282] flex items-center gap-1 cursor-pointer shadow-sm"
            title={isHudCollapsed ? 'Show 3D Inspection Controls' : 'Hide Controls (Zen Mode)'}
          >
            {isHudCollapsed ? (
              <>
                <ChevronUp className="w-3 h-3" />
                <span>Show 3D Controls</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-3 h-3" />
                <span>Hide Controls</span>
              </>
            )}
          </button>
        </div>

        {/* Main Bottom Dock Bar (Solid high-contrast dark walnut surface, zero backdrop-blur) */}
        <div className="w-full rounded-xl bg-[#160f08]/95 border border-[#735329] px-3 py-2 shadow-[0_8px_24px_rgba(0,0,0,0.85)] flex flex-wrap items-center justify-between gap-2.5 text-xs text-[#faebd4]">
          {/* 1. Camera Angle Presets */}
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-[10px] font-serif text-[#b89972] mr-1 hidden sm:inline">
              Camera:
            </span>
            {(Object.keys(CAMERA_PRESETS) as CameraPresetId[]).map((presetKey) => {
              const isSelected = cameraPreset === presetKey;
              return (
                <button
                  key={presetKey}
                  onClick={() => handleSelectCameraPreset(presetKey)}
                  className={`px-2 py-1 rounded-md text-[10px] font-serif transition-colors cursor-pointer whitespace-nowrap ${
                    isSelected
                      ? 'bg-[#d4af62] text-[#170f06] font-bold shadow-2xs'
                      : 'bg-[#24180c] hover:bg-[#362412] text-[#d8be98] border border-[#4a341b]'
                  }`}
                >
                  {CAMERA_PRESETS[presetKey].label}
                </button>
              );
            })}
          </div>

          {/* 2. Exploded View Mechanical Inspection Slider */}
          <div className="flex items-center gap-2 bg-[#21160b] px-2.5 py-1 rounded-lg border border-[#4a341b]">
            <Layers className="w-3.5 h-3.5 text-[#f0c465] shrink-0" />
            <span className="text-[10px] font-serif text-[#d8be98] whitespace-nowrap">
              Explode:
            </span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.02"
              value={explodedAmount}
              onChange={(e) => setExplodedAmount( parseFloat(e.target.value) )}
              className="w-20 sm:w-24 accent-[#f0c465] cursor-pointer h-1.5 bg-[#3b2814] rounded-lg"
              title="Separate 3D mechanical layers to inspect internal mainspring, ratchet pawl, lead bass weights, and ruby bearings"
            />
            <span className="text-[10px] font-mono text-[#f0c465] w-8 text-right tabular-nums">
              {Math.round(explodedAmount * 100)}%
            </span>
          </div>

          {/* 3. Cabinet & Crystal Lid Toggle */}
          <div className="flex items-center gap-1">
            {(
              [
                { id: 'open-lid', label: 'Lid Open' },
                { id: 'closed-lid', label: 'Glass Closed' },
                { id: 'chassis-only', label: 'Chassis Only' },
              ] as { id: CaseDisplayMode; label: string }[]
            ).map((item) => (
              <button
                key={item.id}
                onClick={() => setCaseMode(item.id)}
                className={`px-2 py-1 rounded-md text-[10px] font-serif transition-colors cursor-pointer whitespace-nowrap ${
                  caseMode === item.id
                    ? 'bg-[#4a341b] text-[#fff2c2] border border-[#c9a050] font-semibold'
                    : 'bg-[#21160b] hover:bg-[#302010] text-[#b89972] border border-[#3d2a15]'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
});
