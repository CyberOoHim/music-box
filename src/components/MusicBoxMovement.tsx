import React, { useRef, useEffect, useState, useMemo } from 'react';
import { MusicBoxPin, SANKYO_18_TINES, PlayMode } from '../types';
import { Sparkles, Info } from 'lucide-react';

interface MusicBoxMovementProps {
  currentStep: number;
  totalSteps: number;
  pins: MusicBoxPin[];
  isPlaying: boolean;
  tempoBpm: number;
  playMode: PlayMode;
  springTension: number; // 0 to 1
  activeTines: Set<number>;
  onPluckTine: (tineIndex: number) => void;
  onTogglePin?: (step: number, tineIndex: number) => void;
}

export const MusicBoxMovement: React.FC<MusicBoxMovementProps> = ({
  currentStep,
  totalSteps,
  pins,
  isPlaying,
  tempoBpm,
  playMode,
  springTension,
  activeTines,
  onPluckTine,
}) => {
  const [hoveredTine, setHoveredTine] = useState<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Rotation angle of cylinder in radians
  const cylinderAngle = useMemo(() => {
    return (currentStep / totalSteps) * Math.PI * 2;
  }, [currentStep, totalSteps]);

  // Render high-fidelity 2.5D visual cylinder on Canvas for optimal 60fps performance and crisp gold metallic rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let localAngle = cylinderAngle;
    let governorAngle = 0;

    const render = () => {
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      // Center coordinates
      const cx = width / 2;
      const cy = height / 2;

      // 1. Gold Baseplate Shadow & Metallic Plate
      // Outer drop shadow
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
      ctx.shadowBlur = 24;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 12;

      // Gold baseplate gradient
      const baseGrad = ctx.createLinearGradient(cx - 240, cy - 140, cx + 240, cy + 140);
      baseGrad.addColorStop(0, '#e6ca65');
      baseGrad.addColorStop(0.2, '#fced9c');
      baseGrad.addColorStop(0.4, '#c99b2e');
      baseGrad.addColorStop(0.7, '#ebd173');
      baseGrad.addColorStop(1, '#9e731b');

      ctx.fillStyle = baseGrad;
      ctx.beginPath();
      // Rounded gold chassis plate
      ctx.roundRect(cx - 240, cy - 150, 480, 290, 28);
      ctx.fill();
      ctx.restore();

      // Baseplate bevel edge
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.beginPath();
      ctx.roundRect(cx - 238, cy - 148, 476, 286, 26);
      ctx.stroke();

      // Baseplate screw mounting holes (as in the real Sankyo movement)
      const mountHoles = [
        { x: cx - 210, y: cy - 120 },
        { x: cx + 210, y: cy - 120 },
        { x: cx - 210, y: cy + 110 },
        { x: cx + 210, y: cy + 110 },
      ];
      mountHoles.forEach((hole) => {
        ctx.save();
        ctx.fillStyle = '#2a1a05';
        ctx.beginPath();
        ctx.arc(hole.x, hole.y, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#5a3d0e';
        ctx.lineWidth = 2;
        ctx.stroke();
        // Screw thread lines
        ctx.strokeStyle = '#8a621e';
        ctx.beginPath();
        ctx.arc(hole.x, hole.y, 5, 0, Math.PI * 1.5);
        ctx.stroke();
        ctx.restore();
      });

      // 2. Left Spring Housing Drum ("Sankyo" stamped dome)
      const springX = cx - 140;
      const springY = cy - 45;
      const springRadius = 52;

      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
      ctx.shadowBlur = 14;
      ctx.shadowOffsetY = 6;

      const springGrad = ctx.createRadialGradient(
        springX - 15,
        springY - 15,
        5,
        springX,
        springY,
        springRadius
      );
      springGrad.addColorStop(0, '#fff3b0');
      springGrad.addColorStop(0.3, '#dfb746');
      springGrad.addColorStop(0.7, '#a5781a');
      springGrad.addColorStop(1, '#684809');

      ctx.fillStyle = springGrad;
      ctx.beginPath();
      ctx.arc(springX, springY, springRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Spring Housing Embossed Text "Sankyo"
      ctx.save();
      ctx.font = 'bold 13px "Cinzel", Georgia, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#533709';
      ctx.shadowColor = 'rgba(255, 255, 200, 0.6)';
      ctx.shadowOffsetY = 1;
      ctx.shadowBlur = 1;
      ctx.fillText('Sankyo', springX, springY - 20);

      // Center rivet on spring dome
      ctx.beginPath();
      ctx.arc(springX, springY, 7, 0, Math.PI * 2);
      ctx.fillStyle = '#d6d8db'; // silver center rivet
      ctx.fill();
      ctx.strokeStyle = '#82878d';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();

      // 3. Governor / Air Flywheel & Gearbox (Top Left)
      const govX = cx - 185;
      const govY = cy + 35;

      // Stepped Gear teeth connecting spring to cylinder
      ctx.save();
      const gearGrad = ctx.createLinearGradient(govX, govY - 30, govX + 40, govY + 30);
      gearGrad.addColorStop(0, '#f0d165');
      gearGrad.addColorStop(0.5, '#c59523');
      gearGrad.addColorStop(1, '#8e630f');
      ctx.fillStyle = gearGrad;

      // Draw gear hub
      ctx.beginPath();
      ctx.arc(govX + 35, govY - 15, 24, 0, Math.PI * 2);
      ctx.fill();

      // Draw gear teeth around edge
      const numTeeth = 16;
      for (let i = 0; i < numTeeth; i++) {
        const toothAngle = (i / numTeeth) * Math.PI * 2 + (isPlaying ? -localAngle * 2 : 0);
        const tx = govX + 35 + Math.cos(toothAngle) * 26;
        const ty = govY - 15 + Math.sin(toothAngle) * 26;
        ctx.fillStyle = '#edd274';
        ctx.beginPath();
        ctx.arc(tx, ty, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // Governor Flywheel Fan Bracket & Spinning Fan Blade
      ctx.save();
      // Bracket bridge
      ctx.fillStyle = '#e2be4a';
      ctx.beginPath();
      ctx.roundRect(govX - 25, govY - 25, 48, 50, 8);
      ctx.fill();
      ctx.strokeStyle = '#9c7017';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Spinning black governor butterfly vane (as seen in Sankyo movement)
      const fanX = govX;
      const fanY = govY;
      if (isPlaying) {
        governorAngle += 0.35 * (tempoBpm / 90) * Math.max(0.4, springTension);
      }
      ctx.save();
      ctx.translate(fanX, fanY);
      ctx.rotate(governorAngle);

      ctx.fillStyle = '#1e1e24';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
      ctx.shadowBlur = 4;
      // 2-blade air brake fan
      ctx.beginPath();
      ctx.roundRect(-16, -4, 32, 8, 2);
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect(-4, -16, 8, 32, 2);
      ctx.fill();

      // Center silver spindle
      ctx.fillStyle = '#e4e7eb';
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.restore();

      // 4. Rotating Brass Pin Cylinder Drum
      const cylX = cx - 35;
      const cylY = cy - 50;
      const cylWidth = 195;
      const cylHeight = 90;

      // Cylinder right axle mount
      ctx.save();
      ctx.fillStyle = '#cca132';
      ctx.beginPath();
      ctx.roundRect(cylX + cylWidth - 2, cylY + 20, 28, 50, 6);
      ctx.fill();
      ctx.strokeStyle = '#8a6515';
      ctx.stroke();
      // Axle screw
      ctx.fillStyle = '#ffeaa7';
      ctx.beginPath();
      ctx.arc(cylX + cylWidth + 12, cylY + 45, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Cylinder drum body
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
      ctx.shadowBlur = 12;
      ctx.shadowOffsetY = 5;

      const cylGrad = ctx.createLinearGradient(cylX, cylY, cylX, cylY + cylHeight);
      cylGrad.addColorStop(0, '#8c6515'); // top shade
      cylGrad.addColorStop(0.18, '#ecd477'); // bright highlight reflection
      cylGrad.addColorStop(0.5, '#fff6c7'); // central sheen
      cylGrad.addColorStop(0.82, '#b78925'); // lower shadow
      cylGrad.addColorStop(1, '#664508');

      ctx.fillStyle = cylGrad;
      ctx.beginPath();
      ctx.roundRect(cylX, cylY, cylWidth, cylHeight, 6);
      ctx.fill();
      ctx.restore();

      // Cylinder Left Gear Ring (The golden gear on the left side of the cylinder)
      ctx.save();
      const gearRingX = cylX + 4;
      ctx.fillStyle = '#e6c85e';
      ctx.beginPath();
      ctx.roundRect(gearRingX, cylY - 4, 18, cylHeight + 8, 4);
      ctx.fill();
      ctx.strokeStyle = '#855d0f';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // Gear ridges
      for (let gy = cylY - 2; gy <= cylY + cylHeight + 2; gy += 6) {
        ctx.fillStyle = '#593e09';
        ctx.fillRect(gearRingX, gy, 18, 2);
      }
      ctx.restore();

      // 5. Draw Extruded Golden Pins on the Cylinder Drum!
      // The pins rotate around the cylindrical surface (mapped to 3D cylinder angle)
      const trackStartX = cylX + 28;
      const trackWidth = (cylWidth - 36) / 18;

      pins.forEach((pin) => {
        // Calculate pin angle around cylinder relative to current cylinder angle
        const pinAngle = (pin.step / totalSteps) * Math.PI * 2 - cylinderAngle;
        // Normalize angle to [-PI, PI]
        const normAngle = ((pinAngle % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI;

        // Only render pins that are visible on the front/top half of cylinder (-PI/2 to PI/2)
        if (normAngle >= -Math.PI * 0.55 && normAngle <= Math.PI * 0.55) {
          // Y coordinate on cylindrical curvature
          const relY = Math.sin(normAngle); // -1 (top) to 1 (bottom)
          const pinY = cylY + cylHeight * 0.5 + relY * (cylHeight * 0.44);

          // X coordinate according to tine index (tine 0 is left, tine 17 is right)
          const pinX = trackStartX + pin.tineIndex * trackWidth + trackWidth * 0.5;

          // Depth / lighting factor
          const depthAlpha = Math.max(0.3, Math.cos(normAngle));
          const pinRadius = 2.5 + depthAlpha * 1.5;

          ctx.save();
          // Pin drop shadow
          ctx.fillStyle = 'rgba(40, 20, 0, 0.4)';
          ctx.beginPath();
          ctx.arc(pinX + 1.5, pinY + 1.5, pinRadius, 0, Math.PI * 2);
          ctx.fill();

          // Shiny golden pin head
          const pinGrad = ctx.createRadialGradient(
            pinX - 1,
            pinY - 1,
            0.5,
            pinX,
            pinY,
            pinRadius
          );
          pinGrad.addColorStop(0, '#ffffff');
          pinGrad.addColorStop(0.4, '#ffe787');
          pinGrad.addColorStop(1, '#946614');

          ctx.fillStyle = pinGrad;
          ctx.beginPath();
          ctx.arc(pinX, pinY, pinRadius, 0, Math.PI * 2);
          ctx.fill();

          // If pin is near striking position (normAngle near strike contact point at tines)
          if (Math.abs(normAngle - 0.4) < 0.12 && activeTines.has(pin.tineIndex)) {
            // Golden Sparkle
            ctx.fillStyle = '#fff9d6';
            ctx.shadowColor = '#ffd700';
            ctx.shadowBlur = 10;
            ctx.beginPath();
            ctx.arc(pinX, pinY, pinRadius + 2, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }
      });

      // 6. Steel Comb (18 Tines) Clamped at bottom
      const combX = cx - 55;
      const combY = cy + 40;
      const combWidth = 220;
      const combLength = 80;

      // Base Clamping Steel Block (grey steel plate with 2 big gold screws)
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 6;

      const clampGrad = ctx.createLinearGradient(combX, combY + 45, combX, combY + 95);
      clampGrad.addColorStop(0, '#757c85');
      clampGrad.addColorStop(0.5, '#565c63');
      clampGrad.addColorStop(1, '#3b4046');

      ctx.fillStyle = clampGrad;
      ctx.beginPath();
      ctx.roundRect(combX, combY + 45, combWidth, 48, 8);
      ctx.fill();
      ctx.strokeStyle = '#292d31';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();

      // 2 Large Gold Cross-Head Clamp Screws (as in the real Sankyo movement)
      const screw1X = combX + 38;
      const screw2X = combX + combWidth - 38;
      const screwY = combY + 68;

      [screw1X, screw2X].forEach((sx) => {
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.3)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetY = 2;

        const sGrad = ctx.createRadialGradient(sx - 3, screwY - 3, 2, sx, screwY, 15);
        sGrad.addColorStop(0, '#fff4bb');
        sGrad.addColorStop(0.5, '#d8ac3b');
        sGrad.addColorStop(1, '#7e5611');

        ctx.fillStyle = sGrad;
        ctx.beginPath();
        ctx.arc(sx, screwY, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#573d09';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Phillips Cross Slot
        ctx.strokeStyle = '#382504';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(sx - 7, screwY);
        ctx.lineTo(sx + 7, screwY);
        ctx.moveTo(sx, screwY - 7);
        ctx.lineTo(sx, screwY + 7);
        ctx.stroke();
        ctx.restore();
      });

      // Draw the 18 Steel Tines (Cantilever vibrating teeth)
      const tineSpacing = (combWidth - 28) / 18;
      const tineStartX = combX + 14;

      for (let i = 0; i < 18; i++) {
        const tx = tineStartX + i * tineSpacing;
        const isHovered = hoveredTine === i;
        const isActive = activeTines.has(i);

        // Natural tine length: Lower pitch tines are longer (reach further under cylinder), higher are shorter
        const naturalLength = combLength + (17 - i) * 1.8;
        const deflection = isActive ? 3.5 : 0; // Tine deflects when struck!

        ctx.save();
        // Tine metal gradient (High-carbon spring steel with bright polished bevel)
        const tineGrad = ctx.createLinearGradient(tx, combY - 15, tx + 6, combY + 50);
        if (isActive) {
          tineGrad.addColorStop(0, '#fff9d4');
          tineGrad.addColorStop(0.3, '#ffd64a');
          tineGrad.addColorStop(1, '#8e7025');
        } else if (isHovered) {
          tineGrad.addColorStop(0, '#f2f4f8');
          tineGrad.addColorStop(0.5, '#c5cbd4');
          tineGrad.addColorStop(1, '#78818c');
        } else {
          tineGrad.addColorStop(0, '#dfe3e8');
          tineGrad.addColorStop(0.3, '#a2aab5');
          tineGrad.addColorStop(0.7, '#6b737d');
          tineGrad.addColorStop(1, '#474c52');
        }

        ctx.fillStyle = tineGrad;
        // Tine body
        const tineWidth = tineSpacing - 2.5;
        const tipY = combY + 45 - naturalLength + deflection;

        ctx.beginPath();
        ctx.moveTo(tx, combY + 50);
        ctx.lineTo(tx + tineWidth, combY + 50);
        ctx.lineTo(tx + tineWidth, tipY);
        // Beveled tip
        ctx.lineTo(tx + tineWidth * 0.5, tipY - 3);
        ctx.lineTo(tx, tipY);
        ctx.closePath();
        ctx.fill();

        // Dark slit between tines
        ctx.strokeStyle = '#181b1e';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Tine vibration glow effect if active
        if (isActive) {
          ctx.strokeStyle = 'rgba(255, 215, 0, 0.8)';
          ctx.lineWidth = 2;
          ctx.shadowColor = '#ffd700';
          ctx.shadowBlur = 8;
          ctx.stroke();
        }
        ctx.restore();
      }

      // 7. Dynamic Pluck Ripple & Floating Harmonic Particle Notes
      if (isPlaying) {
        localAngle = cylinderAngle;
      }
    };

    render();
  }, [cylinderAngle, pins, totalSteps, activeTines, hoveredTine, isPlaying, tempoBpm, springTension]);

  return (
    <div className="relative w-full max-w-4xl mx-auto flex flex-col items-center select-none">
      {/* Mechanical Movement Card with Warm Vintage Chassis & Gold Trim */}
      <div className="relative w-full rounded-2xl bg-[#231a10] p-4 sm:p-6 border border-[#bfa175]/40 shadow-[0_12px_36px_rgba(45,36,25,0.25)] overflow-hidden">
        {/* Background Warm Ambient Sheen */}
        <div className="absolute -top-32 -left-32 w-80 h-80 bg-[#bfa175]/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -right-32 w-80 h-80 bg-[#a68656]/15 rounded-full blur-3xl pointer-events-none" />

        {/* Top Status & Brand Header */}
        <div className="flex items-center justify-between mb-3 text-xs sm:text-sm text-[#c4b59f]">
          <div className="flex items-center space-x-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#d6be8e] shadow-sm shadow-[#d6be8e]/60 animate-pulse" />
            <span className="font-serif tracking-wider uppercase text-[#f0e4cf] font-semibold">
              Sankyo 18-Note Mechanical Movement
            </span>
          </div>

          <div className="flex items-center space-x-3 text-[#bba990]">
            <span className="flex items-center space-x-1">
              <span className="text-[#8c7a62]">Step:</span>
              <span className="font-mono text-[#ecd8af] font-bold">{currentStep + 1}</span>
              <span className="text-[#756550]">/ {totalSteps}</span>
            </span>
            <span className="hidden sm:inline-block text-[#5e4f3c]">|</span>
            <span className="hidden sm:flex items-center space-x-1">
              <span className="text-[#8c7a62]">Pins:</span>
              <span className="font-mono text-[#ecd8af]">{pins.length}</span>
            </span>
          </div>
        </div>

        {/* Interactive Mechanical Canvas */}
        <div className="relative w-full aspect-[16/10] sm:aspect-[16/9] max-h-[460px] flex items-center justify-center bg-[#171109] rounded-xl border border-[#4d3b27] overflow-hidden group shadow-inner">
          <canvas
            ref={canvasRef}
            width={860}
            height={500}
            className="w-full h-full object-contain cursor-pointer"
            onClick={() => {
              // Pluck a resonant sample tine on central click if idle
              if (!isPlaying) {
                onPluckTine(Math.floor(Math.random() * 18));
              }
            }}
          />

          {/* Interactive Clickable Tine Strip Overlay at bottom of movement */}
          <div className="absolute bottom-3 sm:bottom-4 left-1/2 -translate-x-1/2 w-[65%] sm:w-[58%] h-12 flex justify-between items-end px-1 pointer-events-auto">
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
                  className={`relative flex-1 mx-[1px] h-9 sm:h-11 rounded-b transition-all duration-75 flex flex-col items-center justify-end pb-1 border ${
                    isActive
                      ? 'bg-gradient-to-t from-[#c8aa7a] to-[#ffeaa7] border-[#ffeaa7] shadow-lg shadow-[#bfa175]/60 -translate-y-1'
                      : 'bg-[#2b2114]/90 hover:bg-[#4a3924] border-[#483722] hover:border-[#bfa175]/60'
                  }`}
                >
                  <span
                    className={`text-[9px] sm:text-[10px] font-mono leading-none font-medium ${
                      isActive ? 'text-[#231a0e] font-bold' : 'text-[#d6caa8]'
                    }`}
                  >
                    {tine.keyLabel.replace(/\d/, '')}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Hint Overlay badge */}
          <div className="absolute top-3 right-3 bg-[#2a1f13]/85 backdrop-blur-md px-2.5 py-1 rounded-full border border-[#bfa175]/30 text-[11px] text-[#decfae] flex items-center space-x-1.5 pointer-events-none shadow-sm">
            <Sparkles className="w-3 h-3 text-[#d6be8e]" />
            <span className="font-serif-sub italic">Click any tine or cylinder to pluck</span>
          </div>
        </div>

        {/* Real-time Tine Spectrum & Note Scale Legend */}
        <div className="mt-4 pt-3 border-t border-[#3d2f1f] flex flex-wrap items-center justify-between gap-2 text-xs text-[#b8a68d]">
          <div className="flex items-center space-x-1.5">
            <Info className="w-3.5 h-3.5 text-[#d6be8e]" />
            <span className="text-[#decfae] font-medium font-serif">Tuning Range:</span>
            <span className="font-mono text-[#ecd8af]">C5 (523Hz) — D7 (2349Hz)</span>
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-[#8c7a62]">Resonant Pluck:</span>
            <span className="text-[#d6be8e] font-serif italic">18 Cantilever Steel Tines</span>
          </div>
        </div>
      </div>
    </div>
  );
};
