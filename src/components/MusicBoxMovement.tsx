import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import {
  MusicBoxPin,
  SANKYO_18_TINES,
  PlayMode,
  CombScaleId,
  TineNote,
  COMB_SCALES_MAP,
} from '../types';
import {
  RotateCw,
  RefreshCw,
  ZoomIn,
  ZoomOut,
  Compass,
  Leaf,
  Keyboard,
  Sparkles,
} from 'lucide-react';

const KEYBOARD_SHORTCUTS = [
  '1', '2', '3', '4', '5', '6', '7', '8', '9', '0',
  'q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p',
  'a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';',
];

interface MusicBoxMovementProps {
  currentStep: number;
  totalSteps: number;
  pins: MusicBoxPin[];
  isPlaying: boolean;
  tempoBpm: number;
  playMode: PlayMode;
  springTension: number;
  activeTines: Set<number>;
  crankRpm?: number;
  combScaleId?: CombScaleId;
  customTines?: TineNote[];
  onPluckTine: (tineIndex: number) => void;
  onTogglePin?: (step: number, tineIndex: number) => void;
  onSubscribeStep?: (cb: (step: number) => void) => () => void;
}

type CameraPreset = 'default' | 'top' | 'comb' | 'cylinder' | 'governor' | 'side';

export const MusicBoxMovement: React.FC<MusicBoxMovementProps> = ({
  currentStep,
  totalSteps,
  pins,
  isPlaying,
  tempoBpm,
  playMode,
  springTension,
  activeTines,
  crankRpm = 0,
  combScaleId = 'sankyo-18',
  customTines,
  onPluckTine,
  onSubscribeStep,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const tineTimeoutsRef = useRef<number[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hoveredTine, setHoveredTine] = useState<number | null>(null);
  const [isAutoRotating, setIsAutoRotating] = useState(false);
  const [currentCameraPreset, setCurrentCameraPreset] = useState<CameraPreset>('default');
  const [zoomPercent, setZoomPercent] = useState<number>(100);

  const tinesList: TineNote[] = useMemo(() => {
    if (customTines && customTines.length > 0) return customTines;
    if (combScaleId && COMB_SCALES_MAP[combScaleId]) return COMB_SCALES_MAP[combScaleId].tines;
    return SANKYO_18_TINES;
  }, [customTines, combScaleId]);

  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const reqIdRef = useRef<number | null>(null);
  const lastRenderTimestampRef = useRef<number>(0);
  const needsRenderRef = useRef<boolean>(true);

  const cylinderGroupRef = useRef<THREE.Group | null>(null);
  const governorFanRef = useRef<THREE.Group | null>(null);
  const intermediateGearRef = useRef<THREE.Group | null>(null);
  const pinMeshesGroupRef = useRef<THREE.Group | null>(null);
  const tinesMeshesRef = useRef<THREE.Mesh[]>([]);
  const tineOriginalPosRef = useRef<{ x: number; y: number; z: number }[]>([]);
  const tineDeflectionRef = useRef<number[]>(new Array(tinesList.length).fill(0));
  const particleGroupRef = useRef<THREE.Group | null>(null);

  const isPlayingRef = useRef(isPlaying);
  const tempoBpmRef = useRef(tempoBpm);
  const playModeRef = useRef(playMode);
  const springTensionRef = useRef(springTension);
  const isAutoRotatingRef = useRef(isAutoRotating);
  const currentStepRef = useRef(currentStep);
  const totalStepsRef = useRef(totalSteps);
  const pinsRef = useRef(pins);
  const crankRpmRef = useRef(crankRpm);

  useEffect(() => {
    tineDeflectionRef.current = new Array(tinesList.length).fill(0);
  }, [tinesList.length]);

  useEffect(() => {
    if (!onSubscribeStep) return;
    const unsubscribe = onSubscribeStep((step) => {
      currentStepRef.current = step;
      needsRenderRef.current = true;
    });
    return unsubscribe;
  }, [onSubscribeStep]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
    tempoBpmRef.current = tempoBpm;
    playModeRef.current = playMode;
    springTensionRef.current = springTension;
    isAutoRotatingRef.current = isAutoRotating;
    currentStepRef.current = currentStep;
    totalStepsRef.current = totalSteps;
    pinsRef.current = pins;
    crankRpmRef.current = crankRpm;
    needsRenderRef.current = true;
  }, [isPlaying, tempoBpm, playMode, springTension, isAutoRotating, currentStep, totalSteps, pins, crankRpm]);

  const isDraggingRef = useRef(false);
  const dragDistanceRef = useRef(0);
  const previousMousePosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  
  // Camera calibrated to high-angle front 3/4 perspective with smooth target lerp
  const currentCameraAngleRef = useRef<{ theta: number; phi: number; distance: number }>({
    theta: 0.08,
    phi: 0.54,
    distance: 13.2,
  });
  const targetCameraAngleRef = useRef<{ theta: number; phi: number; distance: number }>({
    theta: 0.08,
    phi: 0.54,
    distance: 13.2,
  });
  const currentLookAtRef = useRef<THREE.Vector3>(new THREE.Vector3(0.1, -0.15, 0.35));
  const targetLookAtRef = useRef<THREE.Vector3>(new THREE.Vector3(0.1, -0.15, 0.35));

  const updateZoomDisplay = useCallback((dist: number) => {
    const defaultDist = 13.2;
    const pct = Math.round((defaultDist / dist) * 100);
    setZoomPercent(pct);
  }, []);

  const setCameraPreset = useCallback((preset: CameraPreset) => {
    setCurrentCameraPreset(preset);
    setIsAutoRotating(false);
    isAutoRotatingRef.current = false;
    needsRenderRef.current = true;

    switch (preset) {
      case 'default':
        targetCameraAngleRef.current = { theta: 0.08, phi: 0.54, distance: 13.2 };
        targetLookAtRef.current.set(0.1, -0.15, 0.35);
        break;
      case 'comb':
        targetCameraAngleRef.current = { theta: 0.04, phi: 0.65, distance: 9.8 };
        targetLookAtRef.current.set(0.72, -0.2, 1.2);
        break;
      case 'cylinder':
        targetCameraAngleRef.current = { theta: 0.12, phi: 0.48, distance: 8.2 };
        targetLookAtRef.current.set(0.72, 0.4, -1.35);
        break;
      case 'governor':
        targetCameraAngleRef.current = { theta: 0.85, phi: 0.62, distance: 7.8 };
        targetLookAtRef.current.set(-1.65, 0.1, 0.3);
        break;
      case 'side':
        targetCameraAngleRef.current = { theta: Math.PI / 2, phi: 0.82, distance: 12.5 };
        targetLookAtRef.current.set(0, 0, 0.35);
        break;
      case 'top':
        targetCameraAngleRef.current = { theta: 0.0, phi: 0.04, distance: 14.8 };
        targetLookAtRef.current.set(0.1, 0, 0.35);
        break;
    }
    updateZoomDisplay(targetCameraAngleRef.current.distance);
  }, [updateZoomDisplay]);

  // Zoom In Handler
  const handleZoomIn = useCallback(() => {
    targetCameraAngleRef.current.distance = Math.max(5.0, targetCameraAngleRef.current.distance - 1.8);
    needsRenderRef.current = true;
    updateZoomDisplay(targetCameraAngleRef.current.distance);
  }, [updateZoomDisplay]);

  // Zoom Out Handler
  const handleZoomOut = useCallback(() => {
    targetCameraAngleRef.current.distance = Math.min(22.0, targetCameraAngleRef.current.distance + 1.8);
    needsRenderRef.current = true;
    updateZoomDisplay(targetCameraAngleRef.current.distance);
  }, [updateZoomDisplay]);

  // Reset Zoom Handler
  const handleResetZoom = useCallback(() => {
    targetCameraAngleRef.current.distance = 13.2;
    needsRenderRef.current = true;
    updateZoomDisplay(13.2);
  }, [updateZoomDisplay]);

  const rebuildPinMeshes = useCallback((pinsList: MusicBoxPin[], stepsCount: number) => {
    const pinGroup = pinMeshesGroupRef.current;
    if (!pinGroup) return;

    while (pinGroup.children.length > 0) {
      const child = pinGroup.children[0] as THREE.Mesh;
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
        else child.material.dispose();
      }
      pinGroup.remove(child);
    }

    const combWidth = 3.35;
    const tinesCount = Math.max(1, tinesList.length);
    const tineSpacing = combWidth / tinesCount;
    const startX = -combWidth / 2 + tineSpacing / 2;
    const cylRadius = 0.96;

    const dotMat = new THREE.MeshStandardMaterial({
      color: 0xffdf78,
      emissive: 0x5a420e,
      metalness: 0.95,
      roughness: 0.14,
      envMapIntensity: 2.8,
    });

    const dotGeo = new THREE.SphereGeometry(0.065, 14, 12);
    dotGeo.translate(0, 0.036, 0);

    pinsList.forEach((pin) => {
      const pinAngle = (pin.step / stepsCount) * Math.PI * 2;
      const px = startX + pin.tineIndex * tineSpacing;

      const dotMesh = new THREE.Mesh(dotGeo, dotMat);
      dotMesh.castShadow = true;

      const py = Math.cos(pinAngle) * cylRadius;
      const pz = Math.sin(pinAngle) * cylRadius;

      dotMesh.position.set(px, py, pz);
      dotMesh.rotation.x = pinAngle - Math.PI / 2;

      pinGroup.add(dotMesh);
    });
  }, [tinesList]);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0x130e09);

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 480;
    const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 100);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'low-power',
      alpha: false,
    });
    rendererRef.current = renderer;
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.45;

    // Procedural Reflection Environment Map
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();

    const envCanvas = document.createElement('canvas');
    envCanvas.width = 512;
    envCanvas.height = 256;
    const envCtx = envCanvas.getContext('2d');
    if (envCtx) {
      const grad = envCtx.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0, '#584028');
      grad.addColorStop(0.28, '#d4af6d');
      grad.addColorStop(0.5, '#fff7de');
      grad.addColorStop(0.72, '#8b6336');
      grad.addColorStop(1, '#20150d');
      envCtx.fillStyle = grad;
      envCtx.fillRect(0, 0, 512, 256);

      envCtx.fillStyle = 'rgba(255, 250, 235, 0.95)';
      envCtx.fillRect(140, 15, 220, 85);
      envCtx.fillStyle = 'rgba(240, 215, 150, 0.75)';
      envCtx.fillRect(30, 75, 130, 95);
      envCtx.fillStyle = 'rgba(255, 235, 180, 0.6)';
      envCtx.fillRect(340, 90, 130, 80);
    }
    const envTexture = new THREE.CanvasTexture(envCanvas);
    envTexture.mapping = THREE.EquirectangularReflectionMapping;
    const envMap = pmremGenerator.fromEquirectangular(envTexture).texture;
    scene.environment = envMap;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xfff1de, 1.45);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xfff7e8, 3.9);
    keyLight.position.set(5, 15, 10);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 512;
    keyLight.shadow.mapSize.height = 512;
    keyLight.shadow.bias = -0.0008;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xdce8ff, 1.8);
    fillLight.position.set(-8, 8, -6);
    scene.add(fillLight);

    const combGleamLight = new THREE.PointLight(0xfffaee, 4.2, 16, 1.2);
    combGleamLight.position.set(0.8, 3.5, 2.8);
    scene.add(combGleamLight);

    const cylGleamLight = new THREE.PointLight(0xffeec2, 3.5, 15, 1.2);
    cylGleamLight.position.set(0.8, 3.6, -1.2);
    scene.add(cylGleamLight);

    // ==========================================
    // PROCEDURAL TEXTURES (Faithful to IMG_0110.jpeg)
    // ==========================================

    // 1. Cast Brass Stippled Bedplate Texture & Inscription "聲盒仔"
    const bedplateCanvas = document.createElement('canvas');
    bedplateCanvas.width = 1024;
    bedplateCanvas.height = 1024;
    const bpCtx = bedplateCanvas.getContext('2d');
    if (bpCtx) {
      // Golden brass sand-cast base
      bpCtx.fillStyle = '#b6955c';
      bpCtx.fillRect(0, 0, 1024, 1024);

      // Stippled cast texture
      for (let i = 0; i < 40000; i++) {
        const x = Math.random() * 1024;
        const y = Math.random() * 1024;
        const radius = Math.random() * 2.2 + 0.8;
        const brightness = Math.random() * 54 - 27;
        bpCtx.beginPath();
        bpCtx.arc(x, y, radius, 0, Math.PI * 2);
        bpCtx.fillStyle = `rgba(${182 + brightness}, ${149 + brightness * 0.85}, ${92 + brightness * 0.55}, 0.55)`;
        bpCtx.fill();
      }

      // Cast relief embossed characters: "聲 盒 仔"
      bpCtx.font = 'bold 76px "Noto Serif TC", "Songti TC", "MS Mincho", "Hiragino Mincho ProN", "Yu Mincho", serif';
      bpCtx.textAlign = 'left';
      bpCtx.textBaseline = 'middle';
      
      // Emboss highlight
      bpCtx.fillStyle = '#fce5a8';
      bpCtx.fillText('聲 盒 仔', 165, 875);
      
      // Emboss shadow
      bpCtx.fillStyle = '#6e5025';
      bpCtx.fillText('聲 盒 仔', 168, 878);

      // Small secondary mark/seal (安 Q) above the characters
      bpCtx.font = 'bold 36px serif';
      bpCtx.fillStyle = '#7a5b2e';
      bpCtx.fillText('安 Q', 220, 770);
      bpCtx.fillStyle = '#ebd196';
      bpCtx.fillText('安 Q', 218, 768);
    }
    const bedplateTex = new THREE.CanvasTexture(bedplateCanvas);
    bedplateTex.wrapS = THREE.RepeatWrapping;
    bedplateTex.wrapT = THREE.RepeatWrapping;

    // Bedplate bump map for cast metal grain
    const bedplateBumpCanvas = document.createElement('canvas');
    bedplateBumpCanvas.width = 512;
    bedplateBumpCanvas.height = 512;
    const bpbCtx = bedplateBumpCanvas.getContext('2d');
    if (bpbCtx) {
      bpbCtx.fillStyle = '#808080';
      bpbCtx.fillRect(0, 0, 512, 512);
      for (let x = 0; x < 512; x += 2) {
        for (let y = 0; y < 512; y += 2) {
          const noise = (Math.random() - 0.5) * 60;
          bpbCtx.fillStyle = `rgb(${128 + noise}, ${128 + noise}, ${128 + noise})`;
          bpbCtx.fillRect(x, y, 2, 2);
        }
      }
    }
    const bedplateBumpTex = new THREE.CanvasTexture(bedplateBumpCanvas);
    bedplateBumpTex.wrapS = THREE.RepeatWrapping;
    bedplateBumpTex.wrapT = THREE.RepeatWrapping;

    // 2. Spring Barrel Top Cap with "Sankyo" Script and Lyre Emblem
    const sankyoCapCanvas = document.createElement('canvas');
    sankyoCapCanvas.width = 512;
    sankyoCapCanvas.height = 512;
    const scCtx = sankyoCapCanvas.getContext('2d');
    if (scCtx) {
      scCtx.fillStyle = '#caa35c';
      scCtx.fillRect(0, 0, 512, 512);

      // Concentric lathe satin grooves
      for (let r = 10; r < 240; r += 2.5) {
        scCtx.beginPath();
        scCtx.arc(256, 256, r, 0, Math.PI * 2);
        scCtx.strokeStyle = `rgba(255, 235, 180, ${0.12 + Math.random() * 0.08})`;
        scCtx.lineWidth = 1.2;
        scCtx.stroke();
      }

      // Curved Sankyo text along top perimeter
      scCtx.save();
      scCtx.translate(256, 256);
      scCtx.rotate(-Math.PI * 0.58);
      scCtx.font = 'bold 52px "Cinzel", "Times New Roman", Georgia, serif';
      scCtx.fillStyle = '#593e18';
      scCtx.shadowColor = '#ffe8ab';
      scCtx.shadowOffsetX = 1.5;
      scCtx.shadowOffsetY = 1.5;
      scCtx.textAlign = 'center';
      scCtx.textBaseline = 'middle';
      scCtx.fillText('Sankyo', 0, -145);
      scCtx.restore();

      // Ornate Lyre / Harp emblem in the center (from IMG_0110.jpeg)
      scCtx.save();
      scCtx.translate(256, 260);
      scCtx.strokeStyle = '#593e18';
      scCtx.lineWidth = 4.5;
      scCtx.lineCap = 'round';
      scCtx.lineJoin = 'round';
      scCtx.shadowColor = '#ffe8ab';
      scCtx.shadowOffsetX = 1.5;
      scCtx.shadowOffsetY = 1.5;

      // Left scroll arm
      scCtx.beginPath();
      scCtx.moveTo(-45, -50);
      scCtx.bezierCurveTo(-65, -35, -55, 25, -25, 45);
      scCtx.lineTo(-10, 55);
      scCtx.stroke();

      // Left curl
      scCtx.beginPath();
      scCtx.arc(-45, -50, 10, 0, Math.PI * 2);
      scCtx.stroke();

      // Right scroll arm
      scCtx.beginPath();
      scCtx.moveTo(45, -50);
      scCtx.bezierCurveTo(65, -35, 55, 25, 25, 45);
      scCtx.lineTo(10, 55);
      scCtx.stroke();

      // Right curl
      scCtx.beginPath();
      scCtx.arc(45, -50, 10, 0, Math.PI * 2);
      scCtx.stroke();

      // Base bar
      scCtx.beginPath();
      scCtx.moveTo(-35, 55);
      scCtx.lineTo(35, 55);
      scCtx.stroke();

      // Strings
      scCtx.lineWidth = 2.5;
      [-14, 0, 14].forEach((sx) => {
        scCtx.beginPath();
        scCtx.moveTo(sx, -30);
        scCtx.lineTo(sx, 50);
        scCtx.stroke();
      });

      scCtx.restore();
    }
    const sankyoCapTex = new THREE.CanvasTexture(sankyoCapCanvas);

    // 3. Polished Brass Pin Cylinder Texture
    const cylCanvas = document.createElement('canvas');
    cylCanvas.width = 1024;
    cylCanvas.height = 512;
    const cylCtx = cylCanvas.getContext('2d');
    if (cylCtx) {
      cylCtx.fillStyle = '#caa35e';
      cylCtx.fillRect(0, 0, 1024, 512);

      // Lathe polishing marks
      for (let y = 0; y < 512; y += 2) {
        const val = Math.sin(y * 0.4) * 12 + (Math.random() - 0.5) * 10;
        cylCtx.fillStyle = `rgba(${202 + val}, ${163 + val * 0.8}, ${94 + val * 0.5}, 0.35)`;
        cylCtx.fillRect(0, y, 1024, 1.5);
      }

      // Authentic stamped number on right rim (18001 / patent mark from photo)
      cylCtx.font = 'bold 22px monospace';
      cylCtx.fillStyle = '#61461f';
      cylCtx.shadowColor = '#f2dba6';
      cylCtx.shadowOffsetX = 1;
      cylCtx.shadowOffsetY = 1;
      cylCtx.fillText('18001', 860, 260);
    }
    const cylTex = new THREE.CanvasTexture(cylCanvas);

    // 4. Brushed Steel Comb Texture (Fine vertical grinding striations)
    const combCanvas = document.createElement('canvas');
    combCanvas.width = 512;
    combCanvas.height = 512;
    const cmbCtx = combCanvas.getContext('2d');
    if (cmbCtx) {
      cmbCtx.fillStyle = '#cbd2d8';
      cmbCtx.fillRect(0, 0, 512, 512);

      // Vertical brushed metal hairline grooves
      for (let x = 0; x < 512; x += 1.5) {
        const v = (Math.random() - 0.5) * 38;
        cmbCtx.fillStyle = `rgb(${203 + v}, ${210 + v}, ${216 + v})`;
        cmbCtx.fillRect(x, 0, 1, 512);
      }
      // Top tip specular bevel highlight
      const tipGrad = cmbCtx.createLinearGradient(0, 0, 0, 80);
      tipGrad.addColorStop(0, 'rgba(255, 255, 255, 0.7)');
      tipGrad.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
      cmbCtx.fillStyle = tipGrad;
      cmbCtx.fillRect(0, 0, 512, 80);
    }
    const combTex = new THREE.CanvasTexture(combCanvas);

    // ==========================================
    // MATERIALS
    // ==========================================

    // Cast Gold/Brass Bedplate Material
    const castBrassMat = new THREE.MeshStandardMaterial({
      color: 0xb5935a,
      map: bedplateTex,
      bumpMap: bedplateBumpTex,
      bumpScale: 0.025,
      metalness: 0.88,
      roughness: 0.35,
      envMapIntensity: 1.6,
    });

    // Polished Golden Brass (Cylinder & Drum)
    const polishedGoldBrassMat = new THREE.MeshStandardMaterial({
      color: 0xcfab66,
      map: cylTex,
      metalness: 0.94,
      roughness: 0.16,
      envMapIntensity: 2.4,
    });

    // Mirror Gold (Spring Cap & Teardrop Bracket)
    const mirrorGoldMat = new THREE.MeshStandardMaterial({
      color: 0xd4b26f,
      metalness: 0.96,
      roughness: 0.12,
      envMapIntensity: 2.6,
    });

    // Brushed Silver Steel Comb (Tines & Base Clamp)
    const brushedSteelMat = new THREE.MeshStandardMaterial({
      color: 0xd8dde2,
      map: combTex,
      metalness: 0.92,
      roughness: 0.20,
      envMapIntensity: 1.9,
    });

    // Polished Chrome/Nickel for Large Screws
    const polishedChromeScrewMat = new THREE.MeshStandardMaterial({
      color: 0xe6edf2,
      metalness: 0.98,
      roughness: 0.08,
      envMapIntensity: 2.9,
    });

    // Cream / Ivory Nylon Gear
    const creamNylonGearMat = new THREE.MeshStandardMaterial({
      color: 0xf5eccb,
      metalness: 0.04,
      roughness: 0.50,
      envMapIntensity: 0.5,
    });

    // Bronze Spur Gear on Cylinder
    const bronzeCylGearMat = new THREE.MeshStandardMaterial({
      color: 0x8a6336,
      metalness: 0.88,
      roughness: 0.32,
      envMapIntensity: 1.4,
    });

    // Black Butterfly Air-Brake Fan
    const blackFanMat = new THREE.MeshStandardMaterial({
      color: 0x1c1c1f,
      metalness: 0.3,
      roughness: 0.65,
    });

    // Dark Damper Rubber Block
    const darkRubberMat = new THREE.MeshStandardMaterial({
      color: 0x18181a,
      metalness: 0.1,
      roughness: 0.9,
    });

    // Silver Screws
    const silverScrewMat = new THREE.MeshStandardMaterial({
      color: 0xced3d8,
      metalness: 0.92,
      roughness: 0.22,
    });

    // Ground Plate
    const groundMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.MeshStandardMaterial({ color: 0x0c0805, roughness: 0.95, metalness: 0.05 })
    );
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.position.y = -1.65;
    groundMesh.receiveShadow = true;
    scene.add(groundMesh);

    // ==========================================
    // 1. CAST BRASS BEDPLATE (Accurate to IMG_0110.jpeg)
    // ==========================================
    const chassisGroup = new THREE.Group();
    scene.add(chassisGroup);

    // Main baseplate with beveled corners and stepped contours
    const baseplateShape = new THREE.Shape();
    const bw = 6.8;
    const bl = 7.4;
    const br = 0.85;
    baseplateShape.moveTo(-bw / 2 + br, -bl / 2);
    baseplateShape.lineTo(bw / 2 - br, -bl / 2);
    baseplateShape.quadraticCurveTo(bw / 2, -bl / 2, bw / 2, -bl / 2 + br);
    baseplateShape.lineTo(bw / 2, bl / 2 - br);
    baseplateShape.quadraticCurveTo(bw / 2, bl / 2, bw / 2 - br, bl / 2);
    baseplateShape.lineTo(-bw / 2 + br, bl / 2);
    baseplateShape.quadraticCurveTo(-bw / 2, bl / 2, -bw / 2, bl / 2 - br);
    baseplateShape.lineTo(-bw / 2, -bl / 2 + br);
    baseplateShape.quadraticCurveTo(-bw / 2, -bl / 2, -bw / 2 + br, -bl / 2);

    const baseplateExtrude = new THREE.ExtrudeGeometry(baseplateShape, {
      depth: 0.5,
      bevelEnabled: true,
      bevelSegments: 4,
      steps: 1,
      bevelSize: 0.15,
      bevelThickness: 0.15,
    });
    const baseplateMesh = new THREE.Mesh(baseplateExtrude, castBrassMat);
    baseplateMesh.rotation.x = Math.PI / 2;
    baseplateMesh.position.set(0, -1.18, 0.40);
    baseplateMesh.castShadow = true;
    baseplateMesh.receiveShadow = true;
    chassisGroup.add(baseplateMesh);

    // Stepped shelf pedestal under comb extending to the front
    const combShelfShape = new THREE.Shape();
    const sw = 3.65;
    const sl = 5.4;
    combShelfShape.moveTo(-sw / 2, -sl / 2);
    combShelfShape.lineTo(sw / 2 - 0.5, -sl / 2);
    combShelfShape.lineTo(sw / 2, -sl / 2 + 0.5); // 45 deg beveled corner
    combShelfShape.lineTo(sw / 2, sl / 2);
    combShelfShape.lineTo(-sw / 2, sl / 2);
    combShelfShape.lineTo(-sw / 2, -sl / 2);

    const combShelfExtrude = new THREE.ExtrudeGeometry(combShelfShape, {
      depth: 0.22,
      bevelEnabled: true,
      bevelSegments: 2,
      bevelSize: 0.05,
      bevelThickness: 0.05,
    });
    const combShelfMesh = new THREE.Mesh(combShelfExtrude, castBrassMat);
    combShelfMesh.rotation.x = Math.PI / 2;
    combShelfMesh.position.set(0.72, -0.68, 1.45);
    combShelfMesh.castShadow = true;
    chassisGroup.add(combShelfMesh);

    // Bedplate Mounting Screw Holes
    const bedplateHoles = [
      { x: -2.95, z: -0.7 },
      { x: -2.85, z: 2.8 },
      { x: -0.65, z: 3.15 },
      { x: 2.95, z: 2.8 },
      { x: 2.95, z: -2.2 },
    ];
    bedplateHoles.forEach((pos) => {
      const rim = new THREE.Mesh(
        new THREE.TorusGeometry(0.22, 0.05, 12, 24),
        castBrassMat
      );
      rim.rotation.x = Math.PI / 2;
      rim.position.set(pos.x, -0.92, pos.z);
      chassisGroup.add(rim);

      const hole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.18, 0.5, 16),
        new THREE.MeshBasicMaterial({ color: 0x150e08 })
      );
      hole.position.set(pos.x, -1.15, pos.z);
      chassisGroup.add(hole);
    });

    // Helper for Slotted Screws
    const createSlottedScrew = (radius: number, height: number, material: THREE.Material) => {
      const group = new THREE.Group();
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2),
        material
      );
      group.add(head);

      const slot = new THREE.Mesh(
        new THREE.BoxGeometry(radius * 2.1, height * 1.5, radius * 0.28),
        new THREE.MeshBasicMaterial({ color: 0x101012 })
      );
      slot.position.y = radius * 0.7;
      group.add(slot);
      return group;
    };

    // Right Cylinder Axle Post (moved as back as possible: z = -1.4)
    const rightPillar = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 1.45, 0.8),
      castBrassMat
    );
    rightPillar.position.set(2.65, -0.25, -1.4);
    rightPillar.castShadow = true;
    chassisGroup.add(rightPillar);

    // Slotted machine screw on top of right pillar
    const pillarScrew = createSlottedScrew(0.18, 0.12, silverScrewMat);
    pillarScrew.position.set(2.65, 0.48, -1.4);
    chassisGroup.add(pillarScrew);

    // ==========================================
    // 2. MAINSPRING DRUM & SANKYO CAP (Moved Back to z = -1.45)
    // ==========================================
    const springGroup = new THREE.Group();
    springGroup.position.set(-1.85, -0.05, -1.45);
    scene.add(springGroup);

    // Polished gold mainspring barrel cylinder
    const drumWall = new THREE.Mesh(
      new THREE.CylinderGeometry(1.22, 1.22, 1.25, 48),
      mirrorGoldMat
    );
    drumWall.castShadow = true;
    springGroup.add(drumWall);

    // Top Cap with Sankyo Lyre Emblem
    const drumCap = new THREE.Mesh(
      new THREE.CylinderGeometry(1.25, 1.25, 0.18, 48),
      mirrorGoldMat
    );
    drumCap.position.y = 0.65;
    springGroup.add(drumCap);

    const sankyoEmblemDisc = new THREE.Mesh(
      new THREE.CircleGeometry(1.2, 36),
      new THREE.MeshStandardMaterial({
        map: sankyoCapTex,
        metalness: 0.94,
        roughness: 0.15,
        envMapIntensity: 2.2,
      })
    );
    sankyoEmblemDisc.rotation.x = -Math.PI / 2;
    sankyoEmblemDisc.position.set(0, 0.75, 0);
    springGroup.add(sankyoEmblemDisc);

    // Center silver rivet pin
    const centerPin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.2, 0.16, 20),
      silverScrewMat
    );
    centerPin.position.y = 0.8;
    springGroup.add(centerPin);

    // Left rubber stop bumper
    const stopBumper = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.65, 0.5),
      darkRubberMat
    );
    stopBumper.position.set(-1.26, 0.15, 0.1);
    stopBumper.castShadow = true;
    springGroup.add(stopBumper);

    // ==========================================
    // 3. SPEED GOVERNOR & GEAR TRAIN (Bottom-Left)
    // ==========================================
    const governorGroup = new THREE.Group();
    governorGroup.position.set(-1.75, -0.3, 0.45);
    scene.add(governorGroup);

    // Cream / Ivory Nylon Intermediate Reduction Gear
    const nylonGearGroup = new THREE.Group();
    nylonGearGroup.position.set(0.65, 0.25, -1.05);
    governorGroup.add(nylonGearGroup);
    intermediateGearRef.current = nylonGearGroup;

    const nylonGearDisc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.72, 0.72, 0.22, 36),
      creamNylonGearMat
    );
    nylonGearDisc.rotation.x = Math.PI / 2;
    nylonGearDisc.castShadow = true;
    nylonGearGroup.add(nylonGearDisc);

    for (let t = 0; t < 24; t++) {
      const toothAngle = (t / 24) * Math.PI * 2;
      const tooth = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.14, 0.2),
        creamNylonGearMat
      );
      tooth.position.set(Math.cos(toothAngle) * 0.72, Math.sin(toothAngle) * 0.72, 0);
      tooth.rotation.z = toothAngle;
      nylonGearGroup.add(tooth);
    }

    // Governor Flywheel Spindle & Black Butterfly Air-Brake Fan
    const govFanGroup = new THREE.Group();
    govFanGroup.position.set(0, 0.45, 0);
    governorFanRef.current = govFanGroup;
    governorGroup.add(govFanGroup);

    const fanSpindle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 0.7, 16),
      silverScrewMat
    );
    govFanGroup.add(fanSpindle);

    const fanBlade1 = new THREE.Mesh(
      new THREE.BoxGeometry(1.05, 0.26, 0.035),
      blackFanMat
    );
    fanBlade1.castShadow = true;
    govFanGroup.add(fanBlade1);

    const fanBlade2 = new THREE.Mesh(
      new THREE.BoxGeometry(0.035, 0.26, 1.05),
      blackFanMat
    );
    fanBlade2.castShadow = true;
    govFanGroup.add(fanBlade2);

    // Gold Teardrop Top Cover Bracket (Exact match to IMG_0110.jpeg)
    const teardropShape = new THREE.Shape();
    teardropShape.moveTo(-0.55, 0);
    teardropShape.arc(0.55, 0, 0.55, Math.PI, 0, false);
    teardropShape.lineTo(0.25, -0.75);
    teardropShape.lineTo(-0.25, -0.75);
    teardropShape.closePath();

    const teardropExtrude = new THREE.ExtrudeGeometry(teardropShape, {
      depth: 0.15,
      bevelEnabled: true,
      bevelSegments: 3,
      bevelSize: 0.06,
      bevelThickness: 0.06,
    });
    const teardropMesh = new THREE.Mesh(teardropExtrude, mirrorGoldMat);
    teardropMesh.rotation.x = Math.PI / 2;
    teardropMesh.position.set(0, 0.65, 0.15);
    teardropMesh.castShadow = true;
    governorGroup.add(teardropMesh);

    // Center white/silver pivot jewel on teardrop bracket
    const pivotJewel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 0.08, 16),
      new THREE.MeshStandardMaterial({ color: 0xfafafa, roughness: 0.2, metalness: 0.3 })
    );
    pivotJewel.position.set(0, 0.75, 0.15);
    governorGroup.add(pivotJewel);

    // Slotted mounting screws around governor plate
    const govScrew1 = createSlottedScrew(0.16, 0.1, silverScrewMat);
    govScrew1.position.set(0.65, -0.15, 0.1);
    governorGroup.add(govScrew1);

    const govScrew2 = createSlottedScrew(0.16, 0.1, silverScrewMat);
    govScrew2.position.set(-0.65, -0.15, -0.4);
    governorGroup.add(govScrew2);

    // ==========================================
    // 4. POLISHED GOLD BRASS CYLINDER (Moved as back as possible: z = -1.4)
    // ==========================================
    const cylinderGroup = new THREE.Group();
    cylinderGroup.position.set(0.72, 0.40, -1.4);
    cylinderGroupRef.current = cylinderGroup;
    scene.add(cylinderGroup);

    const cylLength = 3.65;
    const cylRadius = 0.96;
    const cylinderMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(cylRadius, cylRadius, cylLength, 64),
      polishedGoldBrassMat
    );
    cylinderMesh.rotation.z = Math.PI / 2;
    cylinderMesh.castShadow = true;
    cylinderMesh.receiveShadow = true;
    cylinderGroup.add(cylinderMesh);

    // Cylinder End Flanges
    const leftCap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.98, 0.98, 0.08, 36),
      mirrorGoldMat
    );
    leftCap.rotation.z = Math.PI / 2;
    leftCap.position.x = -cylLength / 2;
    cylinderGroup.add(leftCap);

    const rightCap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.98, 0.98, 0.08, 36),
      mirrorGoldMat
    );
    rightCap.rotation.z = Math.PI / 2;
    rightCap.position.x = cylLength / 2;
    cylinderGroup.add(rightCap);

    // Left Bronze Spur Ring Gear
    const cylGearGroup = new THREE.Group();
    cylGearGroup.position.x = -cylLength / 2 + 0.22;
    cylinderGroup.add(cylGearGroup);

    const cylGearBase = new THREE.Mesh(
      new THREE.CylinderGeometry(1.15, 1.15, 0.3, 48),
      bronzeCylGearMat
    );
    cylGearBase.rotation.z = Math.PI / 2;
    cylGearBase.castShadow = true;
    cylGearGroup.add(cylGearBase);

    for (let g = 0; g < 36; g++) {
      const toothAngle = (g / 36) * Math.PI * 2;
      const gTooth = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.06, 0.12),
        bronzeCylGearMat
      );
      gTooth.position.set(0, Math.cos(toothAngle) * 1.16, Math.sin(toothAngle) * 1.16);
      gTooth.rotation.x = toothAngle;
      cylGearGroup.add(gTooth);
    }

    // Cylinder Center Axle
    const cylAxle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, cylLength + 0.9, 20),
      silverScrewMat
    );
    cylAxle.rotation.z = Math.PI / 2;
    cylinderGroup.add(cylAxle);

    // Group holding all active 3D song pins
    const pinMeshesGroup = new THREE.Group();
    cylinderGroup.add(pinMeshesGroup);
    pinMeshesGroupRef.current = pinMeshesGroup;
    rebuildPinMeshes(pinsRef.current, totalStepsRef.current);

    // ==========================================
    // 5. 18-NOTE TUNED STEEL COMB (Front-most Base & Extra Long Tines)
    // ==========================================
    const combGroup = new THREE.Group();
    // Base centered at x = 0.72, y = -0.40, z = 0.0
    combGroup.position.set(0.72, -0.40, 0.0);
    scene.add(combGroup);

    // Solid Brushed Steel Clamp Plate with Beveled Bottom-Right Corner (Moved even further front: z = 2.75)
    const combPlateShape = new THREE.Shape();
    const pw = 3.55;
    const pl = 1.55;
    combPlateShape.moveTo(-pw / 2, -pl / 2);
    combPlateShape.lineTo(pw / 2 - 0.45, -pl / 2);
    combPlateShape.lineTo(pw / 2, -pl / 2 + 0.45); // Authentic corner chamfer from photo!
    combPlateShape.lineTo(pw / 2, pl / 2);
    combPlateShape.lineTo(-pw / 2, pl / 2);
    combPlateShape.lineTo(-pw / 2, -pl / 2);

    const combPlateExtrude = new THREE.ExtrudeGeometry(combPlateShape, {
      depth: 0.38,
      bevelEnabled: true,
      bevelSegments: 3,
      bevelSize: 0.06,
      bevelThickness: 0.06,
    });
    const combPlateMesh = new THREE.Mesh(combPlateExtrude, brushedSteelMat);
    combPlateMesh.rotation.x = Math.PI / 2;
    // Pushed even further front: z = 2.75
    combPlateMesh.position.set(0, 0.15, 2.75);
    combPlateMesh.castShadow = true;
    combPlateMesh.receiveShadow = true;
    combGroup.add(combPlateMesh);

    // Two Large Polished Chrome Slotted Dome Screws (Moved to front with base clamp)
    const createLargeSlottedScrew = (xPos: number, zPos: number) => {
      const screwGroup = new THREE.Group();
      screwGroup.position.set(xPos, 0.34, zPos);

      // Large domed head
      const domeHead = new THREE.Mesh(
        new THREE.SphereGeometry(0.38, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2),
        polishedChromeScrewMat
      );
      domeHead.castShadow = true;
      screwGroup.add(domeHead);

      // Single straight deep screwdriver slot
      const slot = new THREE.Mesh(
        new THREE.BoxGeometry(0.78, 0.22, 0.08),
        new THREE.MeshBasicMaterial({ color: 0x121214 })
      );
      slot.position.y = 0.28;
      screwGroup.add(slot);

      return screwGroup;
    };

    // Clamping screws at the front plate (matching photo)
    combGroup.add(createLargeSlottedScrew(-0.95, 2.85));
    combGroup.add(createLargeSlottedScrew(0.85, 2.65));

    // High-Carbon Tuned Spring Steel Tines (Extra long from front clamp z = 2.65 to drum z = -0.44)
    const tinesMeshes: THREE.Mesh[] = [];
    const originalPos: { x: number; y: number; z: number }[] = [];
    const combWidth = 3.35;
    const tinesCount = Math.max(1, tinesList.length);
    const tineSpacing = combWidth / tinesCount;
    const startX = -combWidth / 2 + tineSpacing / 2;

    // Contact point at drum underside/front: z = -0.44
    // Front clamp root: z = 2.65
    // Total tine length ~ 3.82 to 4.26
    for (let i = 0; i < tinesCount; i++) {
      const tx = startX + i * tineSpacing;
      // In the reference photo, bass tines have a slightly longer free span than treble tines
      const tineLen = 3.82 + ((tinesCount - 1) - i) * 0.026;
      const tineWidth = tineSpacing * 0.84;
      const tineThick = 0.075;

      const tineGeo = new THREE.BoxGeometry(tineWidth, tineThick, tineLen);
      // Anchor origin at the front clamp, extending backward to cylinder
      tineGeo.translate(0, 0, -tineLen / 2);

      const tineMesh = new THREE.Mesh(tineGeo, brushedSteelMat.clone());
      // Root positioned at z = 2.65 inside the clamp plate
      tineMesh.position.set(tx, 0.22, 2.65);
      tineMesh.castShadow = true;
      tineMesh.receiveShadow = true;
      tineMesh.userData = { tineIndex: i };

      // Lead weights under bass tines (0-6)
      if (i < 7) {
        const leadPad = new THREE.Mesh(
          new THREE.BoxGeometry(tineWidth * 0.9, 0.08, 0.32),
          new THREE.MeshStandardMaterial({ color: 0x444a52, metalness: 0.6, roughness: 0.65 })
        );
        leadPad.position.set(0, -0.058, -tineLen + 0.25);
        tineMesh.add(leadPad);
      }

      combGroup.add(tineMesh);
      tinesMeshes.push(tineMesh);
      originalPos.push({ x: tx, y: 0.22, z: 2.65 });
    }
    tinesMeshesRef.current = tinesMeshes;
    tineOriginalPosRef.current = originalPos;

    // Harmonic Sparkle Particles
    const particleGroup = new THREE.Group();
    scene.add(particleGroup);
    particleGroupRef.current = particleGroup;

    // Resize Handler
    const handleResize = () => {
      if (!container || !camera || !renderer) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);

    // Animation Loop with Idle Sleep & Visibility Handling
    let localGovernorAngle = 0;
    let localCylinderAngle = (currentStepRef.current / totalStepsRef.current) * Math.PI * 2;
    let isTabVisible = !document.hidden;

    const handleVisibilityChange = () => {
      isTabVisible = !document.hidden;
      if (isTabVisible) {
        needsRenderRef.current = true;
        lastRenderTimestampRef.current = performance.now();
        if (!reqIdRef.current) {
          reqIdRef.current = requestAnimationFrame(animate);
        }
      } else if (reqIdRef.current) {
        cancelAnimationFrame(reqIdRef.current);
        reqIdRef.current = null;
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const animate = (timestamp: number) => {
      if (!isTabVisible) {
        reqIdRef.current = null;
        return;
      }

      reqIdRef.current = requestAnimationFrame(animate);

      const fps = 24;
      const frameInterval = 1000 / fps;
      const elapsed = timestamp - lastRenderTimestampRef.current;

      if (elapsed < frameInterval) return;
      lastRenderTimestampRef.current = timestamp - (elapsed % frameInterval);

      // 1. Camera interpolation
      const dTheta = targetCameraAngleRef.current.theta - currentCameraAngleRef.current.theta;
      const dPhi = targetCameraAngleRef.current.phi - currentCameraAngleRef.current.phi;
      const dDist = targetCameraAngleRef.current.distance - currentCameraAngleRef.current.distance;
      const dLookAt = currentLookAtRef.current.distanceTo(targetLookAtRef.current);
      const isCameraInterpolating =
        Math.abs(dTheta) > 0.0003 ||
        Math.abs(dPhi) > 0.0003 ||
        Math.abs(dDist) > 0.005 ||
        dLookAt > 0.005;

      if (isCameraInterpolating) {
        if (Math.abs(dTheta) < 0.0005) currentCameraAngleRef.current.theta = targetCameraAngleRef.current.theta;
        else currentCameraAngleRef.current.theta += dTheta * 0.22;

        if (Math.abs(dPhi) < 0.0005) currentCameraAngleRef.current.phi = targetCameraAngleRef.current.phi;
        else currentCameraAngleRef.current.phi += dPhi * 0.22;

        if (Math.abs(dDist) < 0.008) currentCameraAngleRef.current.distance = targetCameraAngleRef.current.distance;
        else currentCameraAngleRef.current.distance += dDist * 0.22;

        if (dLookAt < 0.008) currentLookAtRef.current.copy(targetLookAtRef.current);
        else currentLookAtRef.current.lerp(targetLookAtRef.current, 0.22);
      }

      if (isAutoRotatingRef.current) {
        targetCameraAngleRef.current.theta += 0.003;
        currentCameraAngleRef.current.theta += 0.003;
      }

      const isCranking = playModeRef.current === 'crank' && crankRpmRef.current > 0.5;
      const shouldSpinGears = isPlayingRef.current || isCranking;
      const isRotating = isAutoRotatingRef.current;
      const isDragging = isDraggingRef.current;
      const hasParticles = (particleGroupRef.current?.children.length ?? 0) > 0;
      const hasTineDeflection = tineDeflectionRef.current.some((d) => d > 0.001);
      const isDynamic =
        shouldSpinGears ||
        isRotating ||
        isDragging ||
        isCameraInterpolating ||
        hasParticles ||
        hasTineDeflection ||
        needsRenderRef.current;

      if (!isDynamic) return;
      needsRenderRef.current = false;

      const { theta, phi, distance } = currentCameraAngleRef.current;
      const cx = currentLookAtRef.current.x + distance * Math.sin(phi) * Math.sin(theta);
      const cy = currentLookAtRef.current.y + distance * Math.cos(phi);
      const cz = currentLookAtRef.current.z + distance * Math.sin(phi) * Math.cos(theta);

      camera.position.set(cx, cy, cz);
      camera.lookAt(currentLookAtRef.current);

      // 2. Governor & gear rotation
      if (shouldSpinGears && governorFanRef.current) {
        let speed = 0;
        if (isCranking) {
          speed = (crankRpmRef.current / 65) * 0.46;
        } else {
          speed = (tempoBpmRef.current / 90) * Math.max(0.4, springTensionRef.current) * 0.48;
        }

        localGovernorAngle += speed;
        governorFanRef.current.rotation.y = localGovernorAngle;

        if (intermediateGearRef.current) {
          intermediateGearRef.current.rotation.z -= speed * 0.32;
        }
      }

      // 3. Cylinder rotation
      if (cylinderGroupRef.current) {
        const targetCylinderAngle = (currentStepRef.current / totalStepsRef.current) * Math.PI * 2;
        let angleDiff = targetCylinderAngle - localCylinderAngle;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;

        if (Math.abs(angleDiff) > 0.0001) {
          localCylinderAngle += angleDiff * 0.55;
        } else {
          localCylinderAngle = targetCylinderAngle;
        }
        cylinderGroupRef.current.rotation.x = -localCylinderAngle;
      }

      // 4. Tine vibration physics
      tinesMeshesRef.current.forEach((tine, idx) => {
        let defl = tineDeflectionRef.current[idx];
        if (defl > 0.001) {
          defl *= 0.76;
          tineDeflectionRef.current[idx] = defl;
          const orig = tineOriginalPosRef.current[idx];
          if (orig) {
            tine.position.y = orig.y - Math.sin(Date.now() * 0.09 + idx) * defl * 0.16;
          }
        } else {
          const orig = tineOriginalPosRef.current[idx];
          if (orig) {
            tine.position.y = orig.y;
          }
        }
      });

      // 5. Particles update
      if (particleGroupRef.current) {
        for (let i = particleGroupRef.current.children.length - 1; i >= 0; i--) {
          const p = particleGroupRef.current.children[i] as THREE.Mesh;
          p.position.y += 0.026;
          p.position.x += (Math.random() - 0.5) * 0.006;
          p.scale.multiplyScalar(0.94);
          const mat = p.material as THREE.MeshBasicMaterial;
          mat.opacity *= 0.90;
          if (mat.opacity < 0.04 || p.scale.x < 0.04) {
            particleGroupRef.current.remove(p);
            if (p.geometry) p.geometry.dispose();
            if (p.material) mat.dispose();
          }
        }
      }

      renderer.render(scene, camera);
    };

    reqIdRef.current = requestAnimationFrame(animate);

    return () => {
      if (reqIdRef.current) cancelAnimationFrame(reqIdRef.current);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('resize', handleResize);
      tineTimeoutsRef.current.forEach((t) => clearTimeout(t));
      tineTimeoutsRef.current = [];

      // Deep WebGL Resource Cleanup to prevent VRAM memory leaks on mobile / iPad
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          if (object.geometry) {
            object.geometry.dispose();
          }
          if (object.material) {
            if (Array.isArray(object.material)) {
              object.material.forEach((m) => m.dispose());
            } else {
              object.material.dispose();
            }
          }
        }
      });

      envTexture.dispose();
      envMap.dispose();
      bedplateTex.dispose();
      bedplateBumpTex.dispose();
      sankyoCapTex.dispose();
      cylTex.dispose();
      combTex.dispose();

      renderer.dispose();
      pmremGenerator.dispose();
    };
  }, [rebuildPinMeshes]);

  useEffect(() => {
    rebuildPinMeshes(pins, totalSteps);
  }, [pins, totalSteps, rebuildPinMeshes]);

  useEffect(() => {
    activeTines.forEach((tineIndex) => {
      tineDeflectionRef.current[tineIndex] = 1.0;

      const mesh = tinesMeshesRef.current[tineIndex];
      if (mesh) {
        const mat = mesh.material as THREE.MeshStandardMaterial;
        mat.color.setHex(0xfce28a);
        mat.emissive.setHex(0x916812);
        const tId = window.setTimeout(() => {
          mat.color.setHex(0xd8dde2);
          mat.emissive.setHex(0x000000);
        }, 150);
        tineTimeoutsRef.current.push(tId);

        if (particleGroupRef.current) {
          const sparkGeo = new THREE.SphereGeometry(0.08, 8, 8);
          const sparkMat = new THREE.MeshBasicMaterial({
            color: 0xfffae0,
            transparent: true,
            opacity: 0.95,
          });
          const spark = new THREE.Mesh(sparkGeo, sparkMat);
          const orig = tineOriginalPosRef.current[tineIndex];
          if (orig) {
            spark.position.set(orig.x + 0.72, 0.45, -0.44);
            particleGroupRef.current.add(spark);
          }
        }
      }
    });
  }, [activeTines]);

  const handlePointerDown = (e: React.PointerEvent) => {
    isDraggingRef.current = true;
    dragDistanceRef.current = 0;
    previousMousePosRef.current = { x: e.clientX, y: e.clientY };
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    needsRenderRef.current = true;
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    const deltaX = e.clientX - previousMousePosRef.current.x;
    const deltaY = e.clientY - previousMousePosRef.current.y;
    dragDistanceRef.current += Math.hypot(deltaX, deltaY);
    previousMousePosRef.current = { x: e.clientX, y: e.clientY };

    targetCameraAngleRef.current.theta -= deltaX * 0.008;
    currentCameraAngleRef.current.theta -= deltaX * 0.008;
    targetCameraAngleRef.current.phi = Math.max(
      0.05,
      Math.min(Math.PI / 2 - 0.05, targetCameraAngleRef.current.phi - deltaY * 0.008)
    );
    currentCameraAngleRef.current.phi = targetCameraAngleRef.current.phi;
    needsRenderRef.current = true;
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    isDraggingRef.current = false;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    targetCameraAngleRef.current.distance = Math.max(
      5.0,
      Math.min(22.0, targetCameraAngleRef.current.distance + e.deltaY * 0.012)
    );
    needsRenderRef.current = true;
    updateZoomDisplay(targetCameraAngleRef.current.distance);
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragDistanceRef.current > 5) return;
    const canvas = canvasRef.current;
    const camera = cameraRef.current;
    const scene = sceneRef.current;
    if (!canvas || !camera || !scene) return;

    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(x, y), camera);

    const intersects = raycaster.intersectObjects(tinesMeshesRef.current, true);
    if (intersects.length > 0) {
      let hitTine = intersects[0].object.userData.tineIndex;
      if (typeof hitTine !== 'number' && intersects[0].object.parent) {
        hitTine = intersects[0].object.parent.userData.tineIndex;
      }
      if (typeof hitTine === 'number') {
        onPluckTine(hitTine);
      }
    }
  };

  // Listen for physical computer keyboard key presses to pluck tines
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input, textarea, or contentEditable element
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const key = e.key.toLowerCase();
      const shortcutIndex = KEYBOARD_SHORTCUTS.indexOf(key);
      if (shortcutIndex !== -1 && shortcutIndex < tinesList.length) {
        e.preventDefault();
        onPluckTine(shortcutIndex);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [tinesList.length, onPluckTine]);

  return (
    <div className="relative w-full max-w-4xl mx-auto flex flex-col items-center select-none">
      {/* 3D Realistic Sankyo Mechanical Movement Card */}
      <div className="relative w-full rounded-2xl bg-[#17110a] p-4 sm:p-5 border border-[#8a6838]/60 shadow-[0_16px_40px_rgba(20,14,8,0.5)] overflow-hidden">
        <div className="absolute -top-32 -left-32 w-80 h-80 bg-[#c99f52]/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -right-32 w-80 h-80 bg-[#a67c3b]/15 rounded-full blur-3xl pointer-events-none" />

        {/* Top Status & Brand Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3 text-xs sm:text-sm text-[#caa87c]">
          <div className="flex items-center space-x-2.5">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#f0c465] shadow-sm shadow-[#f0c465]/70 animate-pulse" />
            <span className="font-serif tracking-wider uppercase text-[#faebd4] font-bold">
              Sankyo 18-Note Movement • 聲盒仔
            </span>
            <div className="flex items-center space-x-1 px-2 py-0.5 rounded-lg bg-[#27381d]/80 border border-[#486b32]/60 text-[#a3d977] text-[10px] font-mono shadow-xs">
              <Leaf className="w-3 h-3 text-[#8ce053]" />
              <span>24 FPS Eco</span>
            </div>
          </div>

          {/* 3D Camera Angles */}
          <div className="flex items-center space-x-1 sm:space-x-1.5 bg-[#241a10]/95 backdrop-blur-md p-1 rounded-xl border border-[#523c24] overflow-x-auto max-w-full">
            <span className="text-[10px] uppercase font-serif text-[#a68d72] px-1.5 hidden md:inline shrink-0">
              3D View:
            </span>
            <button
              id="camera-preset-default-btn"
              onClick={() => setCameraPreset('default')}
              title="Classic 3/4 Perspective View"
              className={`px-2 py-1 rounded-lg text-xs font-serif shrink-0 transition-all ${
                currentCameraPreset === 'default'
                  ? 'bg-[#a37943] text-[#fffdf7] font-bold shadow-xs'
                  : 'text-[#caa87c] hover:text-[#faebd4] hover:bg-[#3d2b1a]'
              }`}
            >
              Classic 3/4
            </button>
            <button
              id="camera-preset-comb-btn"
              onClick={() => setCameraPreset('comb')}
              title="Close up on Extra-Long 18-Tine Steel Comb"
              className={`px-2 py-1 rounded-lg text-xs font-serif shrink-0 transition-all ${
                currentCameraPreset === 'comb'
                  ? 'bg-[#a37943] text-[#fffdf7] font-bold shadow-xs'
                  : 'text-[#caa87c] hover:text-[#faebd4] hover:bg-[#3d2b1a]'
              }`}
            >
              Visible Comb
            </button>
            <button
              id="camera-preset-cylinder-btn"
              onClick={() => setCameraPreset('cylinder')}
              title="Close up on Polished Brass Cylinder & Pins"
              className={`px-2 py-1 rounded-lg text-xs font-serif shrink-0 transition-all ${
                currentCameraPreset === 'cylinder'
                  ? 'bg-[#a37943] text-[#fffdf7] font-bold shadow-xs'
                  : 'text-[#caa87c] hover:text-[#faebd4] hover:bg-[#3d2b1a]'
              }`}
            >
              Cylinder & Pins
            </button>
            <button
              id="camera-preset-governor-btn"
              onClick={() => setCameraPreset('governor')}
              title="Close up on Speed Governor & Gear"
              className={`px-2 py-1 rounded-lg text-xs font-serif shrink-0 transition-all ${
                currentCameraPreset === 'governor'
                  ? 'bg-[#a37943] text-[#fffdf7] font-bold shadow-xs'
                  : 'text-[#caa87c] hover:text-[#faebd4] hover:bg-[#3d2b1a]'
              }`}
            >
              Governor
            </button>
            <button
              id="camera-preset-side-btn"
              onClick={() => setCameraPreset('side')}
              title="Side Profile View"
              className={`px-2 py-1 rounded-lg text-xs font-serif shrink-0 transition-all ${
                currentCameraPreset === 'side'
                  ? 'bg-[#a37943] text-[#fffdf7] font-bold shadow-xs'
                  : 'text-[#caa87c] hover:text-[#faebd4] hover:bg-[#3d2b1a]'
              }`}
            >
              Side
            </button>
            <button
              id="camera-preset-top-btn"
              onClick={() => setCameraPreset('top')}
              title="Top-down Overview"
              className={`px-2 py-1 rounded-lg text-xs font-serif shrink-0 transition-all ${
                currentCameraPreset === 'top'
                  ? 'bg-[#a37943] text-[#fffdf7] font-bold shadow-xs'
                  : 'text-[#caa87c] hover:text-[#faebd4] hover:bg-[#3d2b1a]'
              }`}
            >
              Top
            </button>
          </div>
        </div>

        {/* 3D WebGL Canvas Viewport */}
        <div
          ref={containerRef}
          className="relative w-full aspect-[16/10] sm:aspect-[16/9] max-h-[480px] flex items-center justify-center bg-[#100b07] rounded-xl border border-[#523c24] overflow-hidden group shadow-inner cursor-grab active:cursor-grabbing"
        >
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onWheel={handleWheel}
            onClick={handleCanvasClick}
            className="w-full h-full object-cover touch-none"
          />

          {/* Quick 3D View & Zoom Controls */}
          <div className="absolute top-3 left-3 flex items-center space-x-1 sm:space-x-1.5 bg-[#241a10]/95 backdrop-blur-md px-2 py-1.5 rounded-xl border border-[#523c24] shadow-md z-10">
            <button
              id="toggle-autorotate-btn"
              onClick={() => {
                setIsAutoRotating((prev) => !prev);
                needsRenderRef.current = true;
              }}
              className={`px-2 py-1 rounded-lg text-xs transition-all flex items-center space-x-1.5 ${
                isAutoRotating
                  ? 'bg-[#a37943] text-[#fffdf7] font-bold shadow-xs'
                  : 'text-[#caa87c] hover:text-[#faebd4] hover:bg-[#3d2b1a]'
              }`}
              title={isAutoRotating ? 'Stop Turntable Rotation' : 'Auto Turntable 3D Rotation'}
            >
              <RotateCw className={`w-3.5 h-3.5 ${isAutoRotating ? 'animate-spin' : ''}`} />
              <span className="text-[11px] font-serif hidden sm:inline">Turntable</span>
            </button>

            <div className="w-[1px] h-4 bg-[#523c24]" />

            <button
              id="zoom-in-btn"
              onClick={handleZoomIn}
              className="p-1.5 rounded-lg text-[#caa87c] hover:text-[#faebd4] hover:bg-[#3d2b1a] active:scale-95 transition"
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
            </button>

            <button
              id="zoom-reset-btn"
              onClick={handleResetZoom}
              className="px-1.5 py-0.5 rounded-md text-[11px] font-mono text-[#caa87c] hover:text-[#faebd4] hover:bg-[#3d2b1a] transition"
              title="Reset Zoom to 100%"
            >
              {zoomPercent}%
            </button>

            <button
              id="zoom-out-btn"
              onClick={handleZoomOut}
              className="p-1.5 rounded-lg text-[#caa87c] hover:text-[#faebd4] hover:bg-[#3d2b1a] active:scale-95 transition"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>

            <div className="w-[1px] h-4 bg-[#523c24]" />

            <button
              id="camera-reset-view-btn"
              onClick={() => setCameraPreset('default')}
              className="p-1.5 rounded-lg text-[#caa87c] hover:text-[#faebd4] hover:bg-[#3d2b1a] active:scale-95 transition"
              title="Reset 3D View Angle"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="absolute top-3 right-3 bg-[#241a10]/90 backdrop-blur-md px-2.5 py-1 rounded-full border border-[#8a6838]/50 text-[11px] text-[#eedcc5] flex items-center space-x-1.5 pointer-events-none shadow-sm">
            <Compass className="w-3 h-3 text-[#f0c465]" />
            <span className="font-serif">Click any 3D tine or drag to rotate</span>
          </div>
        </div>

        {/* Dedicated User Keyboard Under the Music Box (No Overlap, 100% Width Fit) */}
        <div className="mt-4 pt-3.5 border-t border-[#523c24]/70 flex flex-col space-y-2 w-full">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center space-x-2">
              <Keyboard className="w-4 h-4 text-[#f0c465]" />
              <span className="font-serif text-xs sm:text-sm font-semibold text-[#faebd4]">
                Interactive Comb Keyboard
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#2b1e13] border border-[#523c24] text-[#caa87c] font-mono">
                {tinesList.length} Notes
              </span>
            </div>
            <div className="flex items-center space-x-2 text-[11px] text-[#caa87c]">
              <span className="hidden sm:inline font-serif text-[#a68d72]">
                Press keys <kbd className="px-1 py-0.5 bg-[#17110a] border border-[#523c24] rounded text-[10px] font-mono text-[#f0c465]">1-0</kbd> <kbd className="px-1 py-0.5 bg-[#17110a] border border-[#523c24] rounded text-[10px] font-mono text-[#f0c465]">Q-P</kbd> or click tines
              </span>
              <span className="sm:hidden font-serif text-[#a68d72]">
                Tap keys or press keyboard
              </span>
            </div>
          </div>

          {/* Interactive Keyboard Keys Rack - Full Width Fit with No Scroll */}
          <div className="w-full">
            <div className="w-full flex items-stretch gap-0.5 sm:gap-1 p-1 sm:p-1.5 rounded-xl bg-[#120d08] border border-[#523c24]/90 shadow-inner">
              {tinesList.map((tine, idx) => {
                const isActive = activeTines.has(idx);
                const isHovered = hoveredTine === idx;
                const shortcut = KEYBOARD_SHORTCUTS[idx]?.toUpperCase();
                const isAccidental = tine.isFlat || tine.note.includes('b') || tine.note.includes('#');

                return (
                  <button
                    key={`${tine.note}-${idx}`}
                    id={`keyboard-tine-key-${idx}`}
                    onClick={() => onPluckTine(idx)}
                    onMouseEnter={() => setHoveredTine(idx)}
                    onMouseLeave={() => setHoveredTine(null)}
                    title={`Tine #${idx + 1}: ${tine.note} (${tine.frequency ? tine.frequency.toFixed(1) + ' Hz' : ''}) • Keyboard shortcut: [${shortcut || ''}]`}
                    className={`group relative flex-1 min-w-0 flex flex-col items-center justify-between h-18 sm:h-22 md:h-24 px-0.5 sm:px-1 py-1 sm:py-1.5 rounded sm:rounded-lg border transition-all select-none cursor-pointer ${
                      isActive
                        ? 'bg-gradient-to-b from-[#ffe599] via-[#f0c465] to-[#c99432] text-[#1c1208] border-[#ffe8a3] shadow-[0_0_10px_rgba(240,196,101,0.7)] -translate-y-1 scale-105 z-10'
                        : isHovered
                        ? 'bg-gradient-to-b from-[#5c4228] to-[#3a2717] text-[#fffdf7] border-[#8a6838] shadow-xs -translate-y-0.5'
                        : isAccidental
                        ? 'bg-gradient-to-b from-[#2a1d12] via-[#20150b] to-[#160d06] text-[#dfc39e] border-[#47321e] hover:border-[#6d4d2e]'
                        : 'bg-gradient-to-b from-[#3a2818] via-[#2c1d11] to-[#1f1309] text-[#faebd4] border-[#553b22] hover:border-[#7d5732]'
                    }`}
                  >
                    {/* Top tuned comb tooth screw / pin notch accent */}
                    <div
                      className={`w-1.5 sm:w-2 h-1 rounded-full mb-0.5 transition-colors ${
                        isActive
                          ? 'bg-[#7a5416]'
                          : isHovered
                          ? 'bg-[#caa87c]'
                          : 'bg-[#523c24]'
                      }`}
                    />

                    {/* Note Label */}
                    <div className="flex flex-col items-center min-w-0 w-full overflow-hidden">
                      <span className="text-[9px] sm:text-[11px] md:text-xs font-serif font-bold tracking-tight leading-tight truncate w-full text-center">
                        {tine.note}
                      </span>
                      <span
                        className={`hidden sm:inline text-[7px] sm:text-[8px] md:text-[9px] font-mono leading-none ${
                          isActive ? 'text-[#3d2706]' : 'text-[#8a765e]'
                        }`}
                      >
                        #{idx + 1}
                      </span>
                    </div>

                    {/* Keyboard Shortcut Keycap Badge */}
                    {shortcut && (
                      <div
                        className={`mt-0.5 px-0.5 sm:px-1 py-0.5 rounded text-[7px] sm:text-[8px] md:text-[9px] font-mono font-bold uppercase transition-colors shadow-xs leading-none ${
                          isActive
                            ? 'bg-[#1c1208] text-[#f0c465]'
                            : isHovered
                            ? 'bg-[#17110a] text-[#fffdf7] border border-[#caa87c]/40'
                            : 'bg-[#19110a] text-[#9e8568] border border-[#523c24]/70'
                        }`}
                      >
                        {shortcut}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
