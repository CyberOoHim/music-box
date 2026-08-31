import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import { MusicBoxPin, SANKYO_18_TINES, PlayMode } from '../types';
import {
  Sparkles,
  Info,
  RotateCw,
  ZoomIn,
  ZoomOut,
  Compass,
  Layers,
  Sparkle,
  Zap,
  Leaf,
  Battery,
} from 'lucide-react';

interface MusicBoxMovementProps {
  currentStep: number;
  totalSteps: number;
  pins: MusicBoxPin[];
  isPlaying: boolean;
  tempoBpm: number;
  playMode: PlayMode;
  springTension: number; // 0 to 1
  activeTines: Set<number>;
  crankRpm?: number;
  onPluckTine: (tineIndex: number) => void;
  onTogglePin?: (step: number, tineIndex: number) => void;
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
  onPluckTine,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hoveredTine, setHoveredTine] = useState<number | null>(null);
  const [isAutoRotating, setIsAutoRotating] = useState(false);
  const [currentCameraPreset, setCurrentCameraPreset] = useState<CameraPreset>('default');
  const [targetFps, setTargetFps] = useState<number>(24); // 24 FPS maximum as instructed

  // Animation & Three.js references
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const reqIdRef = useRef<number | null>(null);
  const lastRenderTimestampRef = useRef<number>(0);
  const needsRenderRef = useRef<boolean>(true);
  const targetFpsRef = useRef<number>(targetFps);

  // Mesh references for dynamic animation
  const cylinderGroupRef = useRef<THREE.Group | null>(null);
  const governorFanRef = useRef<THREE.Group | null>(null);
  const intermediateGearRef = useRef<THREE.Group | null>(null);
  const pinMeshesGroupRef = useRef<THREE.Group | null>(null);
  const tinesMeshesRef = useRef<THREE.Mesh[]>([]);
  const tineOriginalPosRef = useRef<{ x: number; y: number; z: number }[]>([]);
  const tineDeflectionRef = useRef<number[]>(new Array(18).fill(0));
  const particleGroupRef = useRef<THREE.Group | null>(null);

  // Dynamic state refs for 24fps render loop (prevents re-mounting Three.js scene)
  const isPlayingRef = useRef(isPlaying);
  const tempoBpmRef = useRef(tempoBpm);
  const playModeRef = useRef(playMode);
  const springTensionRef = useRef(springTension);
  const isAutoRotatingRef = useRef(isAutoRotating);
  const currentStepRef = useRef(currentStep);
  const totalStepsRef = useRef(totalSteps);
  const pinsRef = useRef(pins);
  const crankRpmRef = useRef(crankRpm);

  // Synchronize state refs
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
    targetFpsRef.current = targetFps;
    needsRenderRef.current = true;
  }, [isPlaying, tempoBpm, playMode, springTension, isAutoRotating, currentStep, totalSteps, pins, crankRpm, targetFps]);

  // Orbit state
  const isDraggingRef = useRef(false);
  const previousMousePosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const cameraAngleRef = useRef<{ theta: number; phi: number; distance: number }>({
    theta: 0.36, // authentic 3/4 isometric viewpoint from IMG_0105.jpeg
    phi: 0.84,
    distance: 13.8,
  });
  const targetLookAtRef = useRef<THREE.Vector3>(new THREE.Vector3(0, -0.1, 0));

  // Current cylinder rotation in radians
  const cylinderAngle = useMemo(() => {
    return (currentStep / totalSteps) * Math.PI * 2;
  }, [currentStep, totalSteps]);

  // Set camera view preset
  const setCameraPreset = useCallback((preset: CameraPreset) => {
    setCurrentCameraPreset(preset);
    setIsAutoRotating(false);
    switch (preset) {
      case 'default': // Classic 3/4 Sankyo angle matching reference photo
        cameraAngleRef.current = { theta: 0.36, phi: 0.84, distance: 13.8 };
        targetLookAtRef.current.set(0, -0.1, 0);
        break;
      case 'cylinder': // Close up on patinated bronze cylinder & glowing brass pins
        cameraAngleRef.current = { theta: 0.18, phi: 0.68, distance: 8.8 };
        targetLookAtRef.current.set(0.6, 0.3, -0.1);
        break;
      case 'comb': // Close up on 18 tempered steel tines & bronze Phillips screws
        cameraAngleRef.current = { theta: 0.04, phi: 1.12, distance: 9.2 };
        targetLookAtRef.current.set(0.3, -0.4, 0.9);
        break;
      case 'governor': // Close up on spinning air-brake governor and bone-nylon gear train
        cameraAngleRef.current = { theta: 1.15, phi: 0.78, distance: 8.5 };
        targetLookAtRef.current.set(-2.0, 0.7, -0.1);
        break;
      case 'side': // Profile view showing gear mesh & comb clamping
        cameraAngleRef.current = { theta: Math.PI / 2, phi: 0.95, distance: 12.0 };
        targetLookAtRef.current.set(0, 0, 0);
        break;
      case 'top': // Direct top-down view showing pin layout
        cameraAngleRef.current = { theta: 0.0, phi: 0.04, distance: 14.5 };
        targetLookAtRef.current.set(0, 0, 0);
        break;
    }
  }, []);

  // Helper to re-generate the 3D high-visibility pins on the drum
  const rebuildPinMeshes = useCallback((pinsList: MusicBoxPin[], stepsCount: number) => {
    const pinGroup = pinMeshesGroupRef.current;
    if (!pinGroup) return;

    // Clear existing pins
    while (pinGroup.children.length > 0) {
      const child = pinGroup.children[0];
      pinGroup.remove(child);
    }

    const combWidth = 3.25;
    const tineSpacing = combWidth / 18;
    const startX = -combWidth / 2 + tineSpacing / 2;
    const cylRadius = 0.96;

    // High-visibility, polished golden brass dot material with subtle warm specular sheen
    const dotMat = new THREE.MeshStandardMaterial({
      color: 0xffe890,
      emissive: 0x4a3810,
      metalness: 0.98,
      roughness: 0.12,
      envMapIntensity: 2.6,
    });

    // Dot geometry: A compact spherical brass pip/stud sitting raised on the drum surface
    const dotGeo = new THREE.SphereGeometry(0.062, 16, 14);
    dotGeo.translate(0, 0.038, 0);

    pinsList.forEach((pin) => {
      const pinAngle = (pin.step / stepsCount) * Math.PI * 2;
      const px = startX + pin.tineIndex * tineSpacing;

      const dotMesh = new THREE.Mesh(dotGeo, dotMat);
      dotMesh.castShadow = true;

      // Position along cylinder circumference
      const py = Math.cos(pinAngle) * cylRadius;
      const pz = Math.sin(pinAngle) * cylRadius;

      dotMesh.position.set(px, py, pz);
      // Point normal outward from cylinder axis
      dotMesh.rotation.x = pinAngle - Math.PI / 2;

      pinGroup.add(dotMesh);
    });
  }, []);

  // Initialize Three.js 3D Scene (Runs ONCE on mount so scene is never destroyed during playback)
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    // 1. Scene setup
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0x0e0a07); // Rich dark antique velvet background

    // 2. Camera setup
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 480;
    const camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 100);
    cameraRef.current = camera;

    // 3. Power-efficient Renderer setup for Mobile & iPad (prevents GPU overheating & battery drain)
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'low-power',
      alpha: false,
    });
    rendererRef.current = renderer;
    renderer.setSize(width, height);
    // Clamp DPR to 1.25 on high-density iPad Retina screens for massive thermal & GPU power savings
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.38;

    // 4. Procedural Studio Environment Reflection Map for Antique Bronze & Polished Pins
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();

    const envCanvas = document.createElement('canvas');
    envCanvas.width = 512;
    envCanvas.height = 256;
    const envCtx = envCanvas.getContext('2d');
    if (envCtx) {
      // Warm antique bronze & dark studio reflection
      const grad = envCtx.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0, '#3e2a18');
      grad.addColorStop(0.3, '#c29759');
      grad.addColorStop(0.5, '#fff4d6');
      grad.addColorStop(0.7, '#7a542b');
      grad.addColorStop(1, '#18100a');
      envCtx.fillStyle = grad;
      envCtx.fillRect(0, 0, 512, 256);

      // Studio softbox highlights for metallic glints on pins
      envCtx.fillStyle = 'rgba(255, 245, 220, 0.9)';
      envCtx.fillRect(160, 15, 180, 75);
      envCtx.fillStyle = 'rgba(230, 200, 140, 0.65)';
      envCtx.fillRect(30, 70, 110, 90);
      envCtx.fillStyle = 'rgba(255, 220, 160, 0.5)';
      envCtx.fillRect(360, 90, 100, 70);
    }
    const envTexture = new THREE.CanvasTexture(envCanvas);
    envTexture.mapping = THREE.EquirectangularReflectionMapping;
    const envMap = pmremGenerator.fromEquirectangular(envTexture).texture;
    scene.environment = envMap;

    // 5. Studio Lighting Setup (Warm Bronze Depth & Pin Specular Highlights)
    const ambientLight = new THREE.AmbientLight(0xffecd6, 1.25);
    scene.add(ambientLight);

    // Warm key light with power-optimized 512x512 shadow map
    const keyLight = new THREE.DirectionalLight(0xffeed1, 3.6);
    keyLight.position.set(7, 13, 9);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 512;
    keyLight.shadow.mapSize.height = 512;
    keyLight.shadow.bias = -0.0008;
    scene.add(keyLight);

    // Cool fill light (soft pewter-blue rim for steel comb & bronze edge definition)
    const fillLight = new THREE.DirectionalLight(0xd5e2f7, 1.7);
    fillLight.position.set(-9, 7, -6);
    scene.add(fillLight);

    // Specular Point light positioned directly over the cylinder to make the pins gleam
    const cylPointLight = new THREE.PointLight(0xfff3c4, 3.4, 18, 1.2);
    cylPointLight.position.set(0.6, 3.8, 2.8);
    scene.add(cylPointLight);

    // Comb Point light for tempered steel tines
    const combPointLight = new THREE.PointLight(0xffedd4, 2.2, 12, 1.4);
    combPointLight.position.set(0.4, 2.0, 2.8);
    scene.add(combPointLight);

    // Under-chassis warm bronze bounce light
    const bounceLight = new THREE.DirectionalLight(0x8f5e2d, 0.85);
    bounceLight.position.set(0, -6, 2);
    scene.add(bounceLight);

    // 6. GENERATE HIGH-RESOLUTION PROCEDURAL RETRO DIE-CAST BRONZE TEXTURES

    // (A) Die-Cast Sand Bronze Texture & Bump Map with Sand-Cast Stippling & Lathe Turn Lines
    const bronzeCylCanvas = document.createElement('canvas');
    bronzeCylCanvas.width = 1024;
    bronzeCylCanvas.height = 512;
    const cCtx = bronzeCylCanvas.getContext('2d');
    if (cCtx) {
      // Dark antique retro bronze base
      cCtx.fillStyle = '#6b4e2b';
      cCtx.fillRect(0, 0, 1024, 512);

      // Antique lathe turn lines & bronze grain
      for (let y = 0; y < 512; y += 2) {
        const val = Math.sin(y * 0.35) * 16 + (Math.random() - 0.5) * 14;
        cCtx.fillStyle = `rgba(${95 + val}, ${72 + val * 0.8}, ${40 + val * 0.5}, 0.45)`;
        cCtx.fillRect(0, y, 1024, 1.5);
      }

      // Vertical micro-patina striations and oxidization flecks
      for (let x = 0; x < 1024; x += 3) {
        const darkPatina = Math.random() * 0.12;
        cCtx.fillStyle = `rgba(35, 25, 12, ${darkPatina})`;
        cCtx.fillRect(x, 0, 2, 512);
      }

      // Subtle antique verdigris patina speckles
      for (let i = 0; i < 400; i++) {
        const px = Math.random() * 1024;
        const py = Math.random() * 512;
        cCtx.fillStyle = 'rgba(74, 110, 88, 0.08)';
        cCtx.fillRect(px, py, 2.5, 2.5);
      }

      // Authentic Stamped Sankyo Quality Mark "8-□" with dark recessed patina etching
      cCtx.font = 'bold 24px monospace';
      cCtx.fillStyle = '#2c1e0e';
      cCtx.shadowColor = '#8c6b3e';
      cCtx.shadowOffsetX = 1;
      cCtx.shadowOffsetY = 1;
      cCtx.fillText('8-□', 835, 260);
    }
    const bronzeCylTexture = new THREE.CanvasTexture(bronzeCylCanvas);
    bronzeCylTexture.wrapS = THREE.RepeatWrapping;
    bronzeCylTexture.wrapT = THREE.RepeatWrapping;

    // Bronze Sand-Cast & Lathe Bump Map
    const bronzeBumpCanvas = document.createElement('canvas');
    bronzeBumpCanvas.width = 512;
    bronzeBumpCanvas.height = 256;
    const bbCtx = bronzeBumpCanvas.getContext('2d');
    if (bbCtx) {
      bbCtx.fillStyle = '#808080';
      bbCtx.fillRect(0, 0, 512, 256);
      // Sand cast grain
      for (let x = 0; x < 512; x += 2) {
        for (let y = 0; y < 256; y += 2) {
          const noise = (Math.random() - 0.5) * 45;
          bbCtx.fillStyle = `rgb(${128 + noise}, ${128 + noise}, ${128 + noise})`;
          bbCtx.fillRect(x, y, 2, 2);
        }
      }
      // Concentric lathe grooves
      for (let y = 0; y < 256; y += 3) {
        const groove = Math.sin(y * 0.9) * 35;
        bbCtx.fillStyle = `rgba(${128 + groove}, ${128 + groove}, ${128 + groove}, 0.5)`;
        bbCtx.fillRect(0, y, 512, 1.5);
      }
    }
    const bronzeBumpTexture = new THREE.CanvasTexture(bronzeBumpCanvas);

    // (B) Antique Die-Cast Bronze Baseplate Sand-Cast Bump Map
    const sandCastBumpCanvas = document.createElement('canvas');
    sandCastBumpCanvas.width = 256;
    sandCastBumpCanvas.height = 256;
    const scCtx = sandCastBumpCanvas.getContext('2d');
    if (scCtx) {
      scCtx.fillStyle = '#808080';
      scCtx.fillRect(0, 0, 256, 256);
      for (let x = 0; x < 256; x += 2) {
        for (let y = 0; y < 256; y += 2) {
          const grain = (Math.random() - 0.5) * 55;
          scCtx.fillStyle = `rgb(${128 + grain}, ${128 + grain}, ${128 + grain})`;
          scCtx.fillRect(x, y, 2, 2);
        }
      }
    }
    const sandCastBumpTexture = new THREE.CanvasTexture(sandCastBumpCanvas);
    sandCastBumpTexture.wrapS = THREE.RepeatWrapping;
    sandCastBumpTexture.wrapT = THREE.RepeatWrapping;
    sandCastBumpTexture.repeat.set(4, 4);

    // (C) Embossed "Sankyo" Script Seal on Antique Patinated Spring Dome
    const sankyoDomeCanvas = document.createElement('canvas');
    sankyoDomeCanvas.width = 512;
    sankyoDomeCanvas.height = 256;
    const sCtx = sankyoDomeCanvas.getContext('2d');
    if (sCtx) {
      sCtx.clearRect(0, 0, 512, 256);
      // Antique bronze background matching dome
      sCtx.fillStyle = '#634727';
      sCtx.fillRect(0, 0, 512, 256);

      // Radial satin lathe grooves on dome top
      for (let r = 10; r < 240; r += 3) {
        sCtx.beginPath();
        sCtx.arc(256, 128, r, 0, Math.PI * 2);
        sCtx.strokeStyle = `rgba(180, 140, 80, ${0.09 + Math.random() * 0.08})`;
        sCtx.lineWidth = 1.5;
        sCtx.stroke();
      }

      // Curved "Sankyo" font relief stamp in antique bronze with dark patina shadow
      sCtx.font = 'bold 54px "Cinzel", "Times New Roman", Georgia, serif';
      sCtx.textAlign = 'center';
      sCtx.textBaseline = 'middle';
      sCtx.fillStyle = '#221508';
      sCtx.shadowColor = '#c99d63';
      sCtx.shadowOffsetX = 1.5;
      sCtx.shadowOffsetY = 1.5;
      sCtx.shadowBlur = 3;
      sCtx.fillText('Sankyo', 256, 75);
    }
    const sankyoDomeTex = new THREE.CanvasTexture(sankyoDomeCanvas);

    // (D) Tempered Spring Steel Comb Texture (Blued steel with ground bevels)
    const combCanvas = document.createElement('canvas');
    combCanvas.width = 512;
    combCanvas.height = 512;
    const cmbCtx = combCanvas.getContext('2d');
    if (cmbCtx) {
      // Tempered blued-grey steel base
      cmbCtx.fillStyle = '#545d68';
      cmbCtx.fillRect(0, 0, 512, 512);

      // Fine parallel grinding marks along the tines
      for (let y = 0; y < 512; y += 2) {
        const v = (Math.random() - 0.5) * 28;
        cmbCtx.fillStyle = `rgb(${84 + v}, ${93 + v}, ${104 + v})`;
        cmbCtx.fillRect(0, y, 512, 1);
      }
      // Bevel highlight at tip
      const tipGrad = cmbCtx.createLinearGradient(0, 0, 0, 90);
      tipGrad.addColorStop(0, 'rgba(235, 240, 255, 0.45)');
      tipGrad.addColorStop(1, 'rgba(235, 240, 255, 0.0)');
      cmbCtx.fillStyle = tipGrad;
      cmbCtx.fillRect(0, 0, 512, 90);
    }
    const combTexture = new THREE.CanvasTexture(combCanvas);

    // 7. MATERIAL PALETTE (Antique Die-Cast Bronze & Retro Finishes)
    const antiqueCastBronzeMat = new THREE.MeshStandardMaterial({
      color: 0x6e4e2a,
      bumpMap: sandCastBumpTexture,
      bumpScale: 0.035,
      metalness: 0.85,
      roughness: 0.38,
      envMapIntensity: 1.35,
    });

    const antiquePolishedBronzeMat = new THREE.MeshStandardMaterial({
      color: 0x8a6538,
      metalness: 0.90,
      roughness: 0.22,
      envMapIntensity: 1.6,
    });

    const antiqueCylinderBronzeMat = new THREE.MeshStandardMaterial({
      color: 0x684c2a,
      map: bronzeCylTexture,
      bumpMap: bronzeBumpTexture,
      bumpScale: 0.03,
      metalness: 0.89,
      roughness: 0.26,
      envMapIntensity: 1.45,
    });

    const temperedSteelCombMat = new THREE.MeshStandardMaterial({
      color: 0x5b6570,
      map: combTexture,
      metalness: 0.92,
      roughness: 0.24,
      envMapIntensity: 1.3,
    });

    const darkSteelClampBlockMat = new THREE.MeshStandardMaterial({
      color: 0x33383e,
      metalness: 0.88,
      roughness: 0.36,
      envMapIntensity: 1.1,
    });

    const agedBoneNylonGearMat = new THREE.MeshStandardMaterial({
      color: 0xe8dcbe,
      metalness: 0.06,
      roughness: 0.56,
      envMapIntensity: 0.5,
    });

    const blackenedGovernorFanMat = new THREE.MeshStandardMaterial({
      color: 0x18181b,
      metalness: 0.4,
      roughness: 0.6,
      envMapIntensity: 0.8,
    });

    const agedSilverScrewMat = new THREE.MeshStandardMaterial({
      color: 0xb5babf,
      metalness: 0.92,
      roughness: 0.25,
      envMapIntensity: 1.4,
    });

    const darkDamperMat = new THREE.MeshStandardMaterial({
      color: 0x141416,
      metalness: 0.15,
      roughness: 0.85,
    });

    const knurledAntiqueBronzeMat = new THREE.MeshStandardMaterial({
      color: 0x76542d,
      metalness: 0.88,
      roughness: 0.42,
      envMapIntensity: 1.3,
    });

    // 8. Ground Shadow Receiver Plate & Velvet Tabletop
    const groundGeo = new THREE.PlaneGeometry(36, 36);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x0a0704,
      roughness: 0.92,
      metalness: 0.05,
    });
    const groundMesh = new THREE.Mesh(groundGeo, groundMat);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.position.y = -1.65;
    groundMesh.receiveShadow = true;
    scene.add(groundMesh);

    // 9. BUILD AUTHENTIC SANKYO CHASSIS (Die-cast antique bronze base with fillets & mountings)
    const chassisGroup = new THREE.Group();
    scene.add(chassisGroup);

    // Main baseplate shape
    const baseplateShape = new THREE.Shape();
    const bw = 6.4;
    const bl = 5.4;
    const br = 0.65;
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
      depth: 0.48,
      bevelEnabled: true,
      bevelSegments: 4,
      steps: 1,
      bevelSize: 0.14,
      bevelThickness: 0.14,
    });
    const baseplateMesh = new THREE.Mesh(baseplateExtrude, antiqueCastBronzeMat);
    baseplateMesh.rotation.x = Math.PI / 2;
    baseplateMesh.position.set(0, -1.2, 0);
    baseplateMesh.castShadow = true;
    baseplateMesh.receiveShadow = true;
    chassisGroup.add(baseplateMesh);

    // Center Recessed Chassis Cavity underneath cylinder (darker patinated cavity)
    const cavityMesh = new THREE.Mesh(
      new THREE.BoxGeometry(4.0, 0.25, 2.2),
      new THREE.MeshStandardMaterial({
        color: 0x412e1a,
        metalness: 0.82,
        roughness: 0.55,
      })
    );
    cavityMesh.position.set(0.5, -0.96, -0.4);
    chassisGroup.add(cavityMesh);

    // Chassis Mounting Holes with Internal Threading Grooves
    const holePositions = [
      { x: -2.65, z: -2.15 },
      { x: 2.65, z: -2.15 },
      { x: -2.65, z: 2.15 },
      { x: 2.65, z: 2.15 },
    ];
    holePositions.forEach((pos) => {
      // Counterbored Rim
      const holeRim = new THREE.Mesh(
        new THREE.TorusGeometry(0.26, 0.07, 12, 28),
        antiquePolishedBronzeMat
      );
      holeRim.rotation.x = Math.PI / 2;
      holeRim.position.set(pos.x, -0.96, pos.z);
      chassisGroup.add(holeRim);

      // Threaded Hole Cavity with dark interior
      const holeDark = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.22, 0.55, 16),
        new THREE.MeshBasicMaterial({ color: 0x110a05 })
      );
      holeDark.position.set(pos.x, -1.18, pos.z);
      chassisGroup.add(holeDark);

      // Internal thread spiral ring
      const threadRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.21, 0.02, 6, 16),
        antiquePolishedBronzeMat
      );
      threadRing.rotation.x = Math.PI / 2;
      threadRing.position.set(pos.x, -1.05, pos.z);
      chassisGroup.add(threadRing);
    });

    // Cylinder Right Axle Pillar (Vertical Antique Bronze Bracket)
    const rightPillarGeo = new THREE.BoxGeometry(0.58, 1.45, 0.8);
    const rightPillar = new THREE.Mesh(rightPillarGeo, antiqueCastBronzeMat);
    rightPillar.position.set(2.5, -0.28, -0.4);
    rightPillar.castShadow = true;
    chassisGroup.add(rightPillar);

    // Knurled Antique Bronze Axle Bushing on Right Pillar
    const knurledBushing = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.24, 0.38, 24),
      knurledAntiqueBronzeMat
    );
    knurledBushing.rotation.z = Math.PI / 2;
    knurledBushing.position.set(2.5, 0.25, -0.4);
    knurledBushing.castShadow = true;
    chassisGroup.add(knurledBushing);

    // Center Set-Screw on Bushing
    const bushingSetScrew = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 0.42, 12),
      agedSilverScrewMat
    );
    bushingSetScrew.position.set(2.5, 0.48, -0.4);
    chassisGroup.add(bushingSetScrew);

    // 10. SPRING HOUSING CASING (Antique Bronze dome with embossed Sankyo signature)
    const springGroup = new THREE.Group();
    springGroup.position.set(-1.85, -0.08, -0.85);
    scene.add(springGroup);

    // Antique Bronze Spring Drum Cylindrical Wall
    const drumWall = new THREE.Mesh(
      new THREE.CylinderGeometry(1.22, 1.22, 1.15, 48),
      antiquePolishedBronzeMat
    );
    drumWall.castShadow = true;
    springGroup.add(drumWall);

    // Top Dome with beveled rim
    const drumCap = new THREE.Mesh(
      new THREE.CylinderGeometry(1.24, 1.24, 0.2, 48),
      antiquePolishedBronzeMat
    );
    drumCap.position.y = 0.6;
    springGroup.add(drumCap);

    // Stamped Sankyo Logo Decal Plate directly on the bronze cap
    const sankyoDecal = new THREE.Mesh(
      new THREE.CircleGeometry(1.15, 36),
      new THREE.MeshStandardMaterial({
        map: sankyoDomeTex,
        metalness: 0.86,
        roughness: 0.32,
        envMapIntensity: 1.4,
      })
    );
    sankyoDecal.rotation.x = -Math.PI / 2;
    sankyoDecal.position.set(0, 0.71, 0);
    springGroup.add(sankyoDecal);

    // Center Aged Rivet Washer & Pin on Spring Housing
    const springWasher = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.3, 0.06, 24),
      agedSilverScrewMat
    );
    springWasher.position.y = 0.72;
    springGroup.add(springWasher);

    const springRivet = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.16, 0.18, 16),
      agedSilverScrewMat
    );
    springRivet.position.y = 0.78;
    springGroup.add(springRivet);

    // Black Rubber Stop Buffer Block on Left Side of Spring Housing
    const stopBuffer = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.7, 0.55),
      darkDamperMat
    );
    stopBuffer.position.set(-1.25, 0.2, 0.2);
    stopBuffer.castShadow = true;
    springGroup.add(stopBuffer);

    // 11. GOVERNOR & GEAR TRAIN (Front-Left Mechanism)
    const governorGroup = new THREE.Group();
    governorGroup.position.set(-2.2, -0.2, 1.1);
    scene.add(governorGroup);

    // Stepped Bone-Nylon Governor Reduction Gear
    const intermediateGearGroup = new THREE.Group();
    intermediateGearGroup.position.set(0.65, -0.08, -0.4);
    governorGroup.add(intermediateGearGroup);
    intermediateGearRef.current = intermediateGearGroup;

    // Main Gear Disc
    const nylonGearDisc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.68, 0.68, 0.24, 32),
      agedBoneNylonGearMat
    );
    nylonGearDisc.rotation.x = Math.PI / 2;
    nylonGearDisc.castShadow = true;
    intermediateGearGroup.add(nylonGearDisc);

    // Stepped Small Pinion Gear
    const nylonPinion = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.35, 0.38, 20),
      agedBoneNylonGearMat
    );
    nylonPinion.rotation.x = Math.PI / 2;
    nylonPinion.position.z = 0.15;
    nylonPinion.castShadow = true;
    intermediateGearGroup.add(nylonPinion);

    // 24 radial spur gear teeth around the nylon gear perimeter
    for (let t = 0; t < 24; t++) {
      const toothAngle = (t / 24) * Math.PI * 2;
      const tooth = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.12, 0.22),
        agedBoneNylonGearMat
      );
      tooth.position.set(
        Math.cos(toothAngle) * 0.68,
        Math.sin(toothAngle) * 0.68,
        0
      );
      tooth.rotation.z = toothAngle;
      intermediateGearGroup.add(tooth);
    }

    // Governor Bridge / Bracket arch in antique bronze
    const govBracket = new THREE.Mesh(
      new THREE.BoxGeometry(0.95, 1.25, 0.95),
      antiqueCastBronzeMat
    );
    govBracket.position.set(0, 0.12, 0);
    govBracket.castShadow = true;
    governorGroup.add(govBracket);

    // Governor Flywheel Spindle & 2-Blade Butterfly Air Brake Fan
    const govFanGroup = new THREE.Group();
    govFanGroup.position.set(0, 0.78, 0);
    governorFanRef.current = govFanGroup;
    governorGroup.add(govFanGroup);

    // Steel Spindle shaft
    const fanSpindle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 0.55, 16),
      agedSilverScrewMat
    );
    govFanGroup.add(fanSpindle);

    // Nylon Worm Gear collar under fan
    const wormCollar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.18, 0.16, 16),
      agedBoneNylonGearMat
    );
    wormCollar.position.y = -0.15;
    govFanGroup.add(wormCollar);

    // 2-Blade Black Butterfly Air Brake Fan
    const fanBlade1 = new THREE.Mesh(
      new THREE.BoxGeometry(1.02, 0.24, 0.035),
      blackenedGovernorFanMat
    );
    fanBlade1.castShadow = true;
    govFanGroup.add(fanBlade1);

    const fanBlade2 = new THREE.Mesh(
      new THREE.BoxGeometry(0.035, 0.24, 1.02),
      blackenedGovernorFanMat
    );
    fanBlade2.castShadow = true;
    govFanGroup.add(fanBlade2);

    // 12. ANTIQUE BRONZE CYLINDER DRUM & DRIVING GEAR
    const cylinderGroup = new THREE.Group();
    cylinderGroup.position.set(0.4, 0.25, -0.4);
    cylinderGroupRef.current = cylinderGroup;
    scene.add(cylinderGroup);

    // Main Cylinder Drum in Patinated Retro Bronze
    const cylLength = 3.65;
    const cylRadius = 0.96;
    const cylinderMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(cylRadius, cylRadius, cylLength, 64),
      antiqueCylinderBronzeMat
    );
    cylinderMesh.rotation.z = Math.PI / 2;
    cylinderMesh.castShadow = true;
    cylinderMesh.receiveShadow = true;
    cylinderGroup.add(cylinderMesh);

    // Cylinder End Flanges / Caps
    const leftCap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.98, 0.98, 0.08, 36),
      antiquePolishedBronzeMat
    );
    leftCap.rotation.z = Math.PI / 2;
    leftCap.position.x = -cylLength / 2;
    cylinderGroup.add(leftCap);

    const rightCap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.98, 0.98, 0.08, 36),
      antiquePolishedBronzeMat
    );
    rightCap.rotation.z = Math.PI / 2;
    rightCap.position.x = cylLength / 2;
    cylinderGroup.add(rightCap);

    // Left Gear Ring on Cylinder Drum (Spur gear teeth)
    const cylGearGroup = new THREE.Group();
    cylGearGroup.position.x = -cylLength / 2 + 0.24;
    cylinderGroup.add(cylGearGroup);

    const cylGearBase = new THREE.Mesh(
      new THREE.CylinderGeometry(1.14, 1.14, 0.32, 48),
      antiquePolishedBronzeMat
    );
    cylGearBase.rotation.z = Math.PI / 2;
    cylGearBase.castShadow = true;
    cylGearGroup.add(cylGearBase);

    // 36 Antique Bronze Gear Teeth on Cylinder Driving Ring
    for (let g = 0; g < 36; g++) {
      const toothAngle = (g / 36) * Math.PI * 2;
      const gTooth = new THREE.Mesh(
        new THREE.BoxGeometry(0.32, 0.06, 0.12),
        antiquePolishedBronzeMat
      );
      gTooth.position.set(
        0,
        Math.cos(toothAngle) * 1.15,
        Math.sin(toothAngle) * 1.15
      );
      gTooth.rotation.x = toothAngle;
      cylGearGroup.add(gTooth);
    }

    // Cylinder Axle Shaft
    const cylAxle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, cylLength + 0.95, 20),
      agedSilverScrewMat
    );
    cylAxle.rotation.z = Math.PI / 2;
    cylinderGroup.add(cylAxle);

    // Group holding all high-visibility 3D extruded pins (Child of cylinderGroup -> always rotates cleanly!)
    const pinMeshesGroup = new THREE.Group();
    cylinderGroup.add(pinMeshesGroup);
    pinMeshesGroupRef.current = pinMeshesGroup;

    // Immediately build initial pins
    rebuildPinMeshes(pinsRef.current, totalStepsRef.current);

    // 13. TUNED 18-NOTE TEMPERED STEEL COMB ASSEMBLY
    const combGroup = new THREE.Group();
    combGroup.position.set(0.4, -0.35, 1.25);
    scene.add(combGroup);

    // Dark Steel Clamp Base Block with Chamfered Front Edge
    const clampBlockGeo = new THREE.BoxGeometry(3.65, 0.46, 1.25);
    const clampBlock = new THREE.Mesh(clampBlockGeo, darkSteelClampBlockMat);
    clampBlock.position.set(0, 0, 0);
    clampBlock.castShadow = true;
    clampBlock.receiveShadow = true;
    combGroup.add(clampBlock);

    // High-detail domed Antique Bronze Phillips Cross Screws
    const createBronzePhillipsScrew = (xPos: number) => {
      const screwGroup = new THREE.Group();
      screwGroup.position.set(xPos, 0.26, 0.06);

      // Domed Antique Bronze Head
      const domeHead = new THREE.Mesh(
        new THREE.SphereGeometry(0.33, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2),
        antiquePolishedBronzeMat
      );
      domeHead.position.y = 0;
      domeHead.castShadow = true;
      screwGroup.add(domeHead);

      // Beveled Bronze Washer Collar
      const washer = new THREE.Mesh(
        new THREE.CylinderGeometry(0.36, 0.36, 0.05, 24),
        antiquePolishedBronzeMat
      );
      washer.position.y = -0.02;
      screwGroup.add(washer);

      // Recessed Dark Phillips Cross Slots
      const slotMat = new THREE.MeshBasicMaterial({ color: 0x150e06 });
      const slot1 = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.07), slotMat);
      slot1.position.y = 0.28;
      screwGroup.add(slot1);

      const slot2 = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, 0.42), slotMat);
      slot2.position.y = 0.28;
      screwGroup.add(slot2);

      return screwGroup;
    };

    // 2 Large Bronze Phillips Screws clamping the comb block
    combGroup.add(createBronzePhillipsScrew(-1.12));
    combGroup.add(createBronzePhillipsScrew(1.12));

    // 18 Tuned High-Carbon Tempered Steel Tines
    const tinesMeshes: THREE.Mesh[] = [];
    const originalPos: { x: number; y: number; z: number }[] = [];
    const combWidth = 3.25;
    const tineSpacing = combWidth / 18;
    const startX = -combWidth / 2 + tineSpacing / 2;

    for (let i = 0; i < 18; i++) {
      const tx = startX + i * tineSpacing;
      const tineLen = 1.68 + (17 - i) * 0.038;
      const tineWidth = tineSpacing * 0.82;
      const tineThick = 0.075;

      const tineGeo = new THREE.BoxGeometry(tineWidth, tineThick, tineLen);
      tineGeo.translate(0, 0, -tineLen / 2);

      const tineMesh = new THREE.Mesh(tineGeo, temperedSteelCombMat.clone());
      tineMesh.position.set(tx, 0.23, -0.46);
      tineMesh.castShadow = true;
      tineMesh.receiveShadow = true;
      tineMesh.userData = { tineIndex: i };

      // Lead-weight tuning pads underneath low-frequency bass tines (0-6)
      if (i < 7) {
        const leadPad = new THREE.Mesh(
          new THREE.BoxGeometry(tineWidth * 0.9, 0.08, 0.25),
          new THREE.MeshStandardMaterial({
            color: 0x3d434a,
            metalness: 0.65,
            roughness: 0.65,
          })
        );
        leadPad.position.set(0, -0.06, -tineLen + 0.15);
        tineMesh.add(leadPad);
      }

      combGroup.add(tineMesh);
      tinesMeshes.push(tineMesh);
      originalPos.push({ x: tx, y: 0.23, z: -0.46 });
    }
    tinesMeshesRef.current = tinesMeshes;
    tineOriginalPosRef.current = originalPos;

    // 14. Harmonic Light Particle Sparkles System
    const particleGroup = new THREE.Group();
    scene.add(particleGroup);
    particleGroupRef.current = particleGroup;

    // Handle Resize
    const handleResize = () => {
      if (!container || !camera || !renderer) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);

    // 24 FPS Battery-Saving Animation Loop (Optimized for Mobile & iPad)
    let localGovernorAngle = 0;
    let localCylinderAngle = (currentStepRef.current / totalStepsRef.current) * Math.PI * 2;

    const animate = (timestamp: number) => {
      reqIdRef.current = requestAnimationFrame(animate);

      // Strict FPS Cap throttling (<= 24 FPS) to prevent device overheating and conserve battery
      const fps = targetFpsRef.current || 24;
      const frameInterval = 1000 / fps;
      const elapsed = timestamp - lastRenderTimestampRef.current;

      if (elapsed < frameInterval) {
        return; // Skip intermediate frame to save GPU & CPU cycles
      }
      lastRenderTimestampRef.current = timestamp - (elapsed % frameInterval);

      // Check if scene has dynamic movement requiring render updates
      const isCranking = playModeRef.current === 'crank' && crankRpmRef.current > 0.5;
      const shouldSpinGears = isPlayingRef.current || isCranking;
      const isRotating = isAutoRotatingRef.current;
      const isDragging = isDraggingRef.current;
      const hasParticles = (particleGroupRef.current?.children.length ?? 0) > 0;
      const hasTineDeflection = tineDeflectionRef.current.some((d) => d > 0.001);
      const isDynamic = shouldSpinGears || isRotating || isDragging || hasParticles || hasTineDeflection || needsRenderRef.current;

      if (!isDynamic) {
        // Sleep state: scene is stable and static, no work needed
        return;
      }
      needsRenderRef.current = false;

      // 1. Camera positioning and smooth interpolation
      if (isAutoRotatingRef.current) {
        cameraAngleRef.current.theta += 0.0025;
      }

      const { theta, phi, distance } = cameraAngleRef.current;
      const cx = targetLookAtRef.current.x + distance * Math.sin(phi) * Math.sin(theta);
      const cy = targetLookAtRef.current.y + distance * Math.cos(phi);
      const cz = targetLookAtRef.current.z + distance * Math.sin(phi) * Math.cos(theta);

      camera.position.set(cx, cy, cz);
      camera.lookAt(targetLookAtRef.current);

      // 2. Governor fan and gear spinning
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

      // 3. Smooth cylinder drum rotation tracking currentStep (24fps interpolated)
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

      // 4. Tine deflection vibration physics update
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

      // 5. Particles update (fade out and drift upwards)
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
          }
        }
      }

      renderer.render(scene, camera);
    };

    reqIdRef.current = requestAnimationFrame(animate);

    return () => {
      if (reqIdRef.current) {
        cancelAnimationFrame(reqIdRef.current);
      }
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      pmremGenerator.dispose();
    };
  }, [rebuildPinMeshes]);

  // Update 3D Extruded Pins on Cylinder Drum whenever pins or totalSteps change
  useEffect(() => {
    rebuildPinMeshes(pins, totalSteps);
  }, [pins, totalSteps, rebuildPinMeshes]);

  // Trigger 3D Tine physical deflection and warm spark particle on note pluck
  useEffect(() => {
    activeTines.forEach((tineIndex) => {
      tineDeflectionRef.current[tineIndex] = 1.0;

      const mesh = tinesMeshesRef.current[tineIndex];
      if (mesh) {
        const mat = mesh.material as THREE.MeshStandardMaterial;
        mat.color.setHex(0xfad36b);
        mat.emissive.setHex(0x8a6210);
        setTimeout(() => {
          mat.color.setHex(0x5b6570);
          mat.emissive.setHex(0x000000);
        }, 150);

        if (particleGroupRef.current) {
          const sparkGeo = new THREE.SphereGeometry(0.09, 8, 8);
          const sparkMat = new THREE.MeshBasicMaterial({
            color: 0xfff2be,
            transparent: true,
            opacity: 0.95,
          });
          const spark = new THREE.Mesh(sparkGeo, sparkMat);
          const orig = tineOriginalPosRef.current[tineIndex];
          if (orig) {
            spark.position.set(orig.x + 0.4, 0.35, orig.z + 1.25 - 0.7);
            particleGroupRef.current.add(spark);
          }
        }
      }
    });
  }, [activeTines]);

  // Pointer drag orbit controls on Canvas
  const handlePointerDown = (e: React.PointerEvent) => {
    isDraggingRef.current = true;
    previousMousePosRef.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    const deltaX = e.clientX - previousMousePosRef.current.x;
    const deltaY = e.clientY - previousMousePosRef.current.y;
    previousMousePosRef.current = { x: e.clientX, y: e.clientY };

    cameraAngleRef.current.theta -= deltaX * 0.008;
    cameraAngleRef.current.phi = Math.max(
      0.08,
      Math.min(Math.PI / 2 - 0.05, cameraAngleRef.current.phi - deltaY * 0.008)
    );
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    isDraggingRef.current = false;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  // Zoom on wheel
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    cameraAngleRef.current.distance = Math.max(
      6.5,
      Math.min(22.0, cameraAngleRef.current.distance + e.deltaY * 0.012)
    );
  };

  // Raycast click to pluck 3D tines directly from 3D viewport
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const camera = cameraRef.current;
    const scene = sceneRef.current;
    if (!canvas || !camera || !scene) return;

    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(x, y), camera);

    const intersects = raycaster.intersectObjects(tinesMeshesRef.current);
    if (intersects.length > 0) {
      const hitTine = intersects[0].object.userData.tineIndex;
      if (typeof hitTine === 'number') {
        onPluckTine(hitTine);
      }
    }
  };

  return (
    <div className="relative w-full max-w-4xl mx-auto flex flex-col items-center select-none">
      {/* 3D Realistic Mechanical Movement Card - Antique Bronze Atmosphere */}
      <div className="relative w-full rounded-2xl bg-[#17110a] p-4 sm:p-5 border border-[#6b4e2b]/50 shadow-[0_16px_40px_rgba(20,14,8,0.45)] overflow-hidden">
        {/* Background Warm Bronze & Patina Ambient Sheen */}
        <div className="absolute -top-32 -left-32 w-80 h-80 bg-[#7a542b]/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -right-32 w-80 h-80 bg-[#8c6538]/15 rounded-full blur-3xl pointer-events-none" />

        {/* Top Status & Brand Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3 text-xs sm:text-sm text-[#bda991]">
          <div className="flex items-center space-x-2.5">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#dfb26b] shadow-sm shadow-[#dfb26b]/60 animate-pulse" />
            <span className="font-serif tracking-wider uppercase text-[#edd9bf] font-bold">
              Sankyo 18-Note Antique Die-Cast Movement
            </span>
            {/* Battery & Power Saver Indicator */}
            <div className="flex items-center space-x-1 px-2 py-0.5 rounded-lg bg-[#27381d]/80 border border-[#486b32]/60 text-[#a3d977] text-[10px] font-mono shadow-xs">
              <Leaf className="w-3 h-3 text-[#8ce053]" />
              <span>{targetFps} FPS Eco</span>
            </div>
          </div>

          {/* 3D Camera Angles & FPS Limit Control */}
          <div className="flex items-center space-x-1.5 bg-[#241a10]/95 backdrop-blur-md p-1 rounded-xl border border-[#4a3520]">
            <span className="text-[10px] uppercase font-serif text-[#8f7962] px-1.5 hidden sm:inline">
              3D View:
            </span>
            <button
              id="camera-preset-default-btn"
              onClick={() => setCameraPreset('default')}
              title="Isometric 3/4 View (Photo Angle)"
              className={`px-2 py-1 rounded-lg text-xs font-serif transition-all ${
                currentCameraPreset === 'default'
                  ? 'bg-[#8a6538] text-[#fef9f0] font-bold shadow-xs'
                  : 'text-[#bda991] hover:text-[#f4e8d8] hover:bg-[#382718]'
              }`}
            >
              Classic 3/4
            </button>
            <button
              id="camera-preset-cylinder-btn"
              onClick={() => setCameraPreset('cylinder')}
              title="Close up on Bronze Cylinder & Polished Pins"
              className={`px-2 py-1 rounded-lg text-xs font-serif transition-all ${
                currentCameraPreset === 'cylinder'
                  ? 'bg-[#8a6538] text-[#fef9f0] font-bold shadow-xs'
                  : 'text-[#bda991] hover:text-[#f4e8d8] hover:bg-[#382718]'
              }`}
            >
              Cylinder & Pins
            </button>
            <button
              id="camera-preset-comb-btn"
              onClick={() => setCameraPreset('comb')}
              title="Close up on Steel Comb Striker & Bronze Screws"
              className={`px-2 py-1 rounded-lg text-xs font-serif transition-all ${
                currentCameraPreset === 'comb'
                  ? 'bg-[#8a6538] text-[#fef9f0] font-bold shadow-xs'
                  : 'text-[#bda991] hover:text-[#f4e8d8] hover:bg-[#382718]'
              }`}
            >
              Comb
            </button>
            <button
              id="camera-preset-governor-btn"
              onClick={() => setCameraPreset('governor')}
              title="Close up on Air-Brake Governor Fan & Gear"
              className={`px-2 py-1 rounded-lg text-xs font-serif transition-all ${
                currentCameraPreset === 'governor'
                  ? 'bg-[#8a6538] text-[#fef9f0] font-bold shadow-xs'
                  : 'text-[#bda991] hover:text-[#f4e8d8] hover:bg-[#382718]'
              }`}
            >
              Governor
            </button>
            <button
              id="camera-preset-side-btn"
              onClick={() => setCameraPreset('side')}
              title="Profile Side View showing Gear Mesh"
              className={`px-2 py-1 rounded-lg text-xs font-serif transition-all ${
                currentCameraPreset === 'side'
                  ? 'bg-[#8a6538] text-[#fef9f0] font-bold shadow-xs'
                  : 'text-[#bda991] hover:text-[#f4e8d8] hover:bg-[#382718]'
              }`}
            >
              Profile
            </button>
            <button
              id="camera-preset-top-btn"
              onClick={() => setCameraPreset('top')}
              title="Top Down Angle"
              className={`px-2 py-1 rounded-lg text-xs font-serif transition-all ${
                currentCameraPreset === 'top'
                  ? 'bg-[#8a6538] text-[#fef9f0] font-bold shadow-xs'
                  : 'text-[#bda991] hover:text-[#f4e8d8] hover:bg-[#382718]'
              }`}
            >
              Top
            </button>
          </div>
        </div>

        {/* 3D WebGL Canvas Viewport Container */}
        <div
          ref={containerRef}
          className="relative w-full aspect-[16/10] sm:aspect-[16/9] max-h-[480px] flex items-center justify-center bg-[#0e0a07] rounded-xl border border-[#4a3520] overflow-hidden group shadow-inner cursor-grab active:cursor-grabbing"
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

          {/* Quick 3D View Controls Overlay (Orbit / Auto-rotate / Reset) */}
          <div className="absolute top-3 left-3 flex items-center space-x-1.5 bg-[#20160d]/90 backdrop-blur-md px-2 py-1.5 rounded-xl border border-[#4a3520] shadow-sm">
            <button
              id="toggle-autorotate-btn"
              onClick={() => setIsAutoRotating((prev) => !prev)}
              className={`p-1.5 rounded-lg text-xs transition-all flex items-center space-x-1 ${
                isAutoRotating
                  ? 'bg-[#8a6538] text-[#fef9f0] font-bold'
                  : 'text-[#bda991] hover:text-[#f4e8d8] hover:bg-[#382718]'
              }`}
              title={isAutoRotating ? 'Stop Turntable Rotation' : 'Auto Turntable 3D Rotation'}
            >
              <RotateCw className={`w-3.5 h-3.5 ${isAutoRotating ? 'animate-spin' : ''}`} />
              <span className="text-[11px] font-serif hidden sm:inline">Turntable</span>
            </button>

            <button
              id="zoom-in-btn"
              onClick={() => {
                cameraAngleRef.current.distance = Math.max(6.5, cameraAngleRef.current.distance - 1.5);
              }}
              className="p-1.5 rounded-lg text-[#bda991] hover:text-[#f4e8d8] hover:bg-[#382718] transition"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>

            <button
              id="zoom-out-btn"
              onClick={() => {
                cameraAngleRef.current.distance = Math.min(22.0, cameraAngleRef.current.distance + 1.5);
              }}
              className="p-1.5 rounded-lg text-[#bda991] hover:text-[#f4e8d8] hover:bg-[#382718] transition"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Interactive Clickable 18-Tine Key Strip Overlay */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 w-[94%] sm:w-[82%] h-12 flex justify-between items-end px-1 pointer-events-auto bg-[#171008]/90 backdrop-blur-md p-1 rounded-xl border border-[#4a3520]/80 shadow-md">
            {SANKYO_18_TINES.map((tine) => {
              const isActive = activeTines.has(tine.index);
              return (
                <button
                  key={tine.index}
                  id={`tine-key-${tine.index}`}
                  title={`Pluck ${tine.note} (${tine.frequency.toFixed(0)} Hz)`}
                  onMouseEnter={() => setHoveredTine(tine.index)}
                  onMouseLeave={() => setHoveredTine(null)}
                  onClick={(e) => {
                    e.stopPropagation();
                    onPluckTine(tine.index);
                  }}
                  className={`relative flex-1 mx-[1px] h-9 sm:h-10 rounded-lg transition-all duration-75 flex flex-col items-center justify-end pb-1 border ${
                    isActive
                      ? 'bg-gradient-to-t from-[#8a6538] to-[#dfb26b] border-[#dfb26b] shadow-lg shadow-[#8a6538]/60 -translate-y-1'
                      : 'bg-[#22180f]/90 hover:bg-[#3d2b1b] border-[#382617] hover:border-[#8a6538]/60'
                  }`}
                >
                  <span
                    className={`text-[8px] sm:text-[9px] font-mono leading-none font-medium ${
                      isActive ? 'text-[#1c1309] font-bold' : 'text-[#c7b49d]'
                    }`}
                  >
                    {tine.keyLabel.replace(/\d/, '')}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Hint Overlay badge */}
          <div className="absolute top-3 right-3 bg-[#20160d]/90 backdrop-blur-md px-2.5 py-1 rounded-full border border-[#6b4e2b]/40 text-[11px] text-[#dfcdb5] flex items-center space-x-1.5 pointer-events-none shadow-sm">
            <Compass className="w-3 h-3 text-[#c99d63]" />
            <span className="font-serif-sub italic">Drag 3D to rotate • Scroll to zoom</span>
          </div>
        </div>

        {/* Real-time Tine Spectrum & Note Scale Legend */}
        <div className="mt-3 pt-3 border-t border-[#362617] flex flex-wrap items-center justify-between gap-2 text-xs text-[#a8947d]">
          <div className="flex items-center space-x-1.5">
            <Info className="w-3.5 h-3.5 text-[#c99d63]" />
            <span className="text-[#decfae] font-medium font-serif">Movement Specs:</span>
            <span className="font-mono text-[#ddcbb2]">18-Tine Blued Spring Steel • Antique Sand-Cast Bronze Finish • High-Relief Pins</span>
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-[#87745e]">Active Pins:</span>
            <span className="text-[#dfb26b] font-mono font-bold">{pins.length}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
