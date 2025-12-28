
import React, { useMemo } from 'react';
import { RadiatorSpecs, ValvePosition } from '../types';

interface RadiatorVisualizerProps {
  specs: RadiatorSpecs;
  calculatedWidth?: number;
  realWatts?: number;
  requiredWatts?: number;
}

/**
 * Optimized Radiator Visualizer Component
 * Uses React.memo to prevent unnecessary re-renders.
 * Uses useMemo for geometric calculations to ensure efficiency during rapid state updates.
 */
export const RadiatorVisualizer: React.FC<RadiatorVisualizerProps> = React.memo(({ 
  specs, 
  calculatedWidth, 
  realWatts, 
  requiredWatts 
}) => {
  const { 
    valvePosition, 
    valveCenterDistance, 
    nicheWidth, 
    nicheHeight, 
    valveHeight,
    maxWidth, 
    hasDiaphragm
  } = specs;

  // Memoize all layout calculations to avoid re-computing on every minor re-render
  const layout = useMemo(() => {
    const VIEWBOX_SIZE = 500;
    const MARGIN = 70;
    const DRAWABLE_AREA = VIEWBOX_SIZE - MARGIN * 2;

    // Safety checks to prevent division by zero or NaN
    const safeNicheWidth = Math.max(nicheWidth, 1);
    const safeNicheHeight = Math.max(nicheHeight, 1);

    const scaleX = DRAWABLE_AREA / safeNicheWidth;
    const scaleY = DRAWABLE_AREA / safeNicheHeight;
    const SCALE = Math.min(scaleX, scaleY);

    const canvasWidth = safeNicheWidth * SCALE;
    const canvasHeight = safeNicheHeight * SCALE;
    
    const offsetX = (VIEWBOX_SIZE - canvasWidth) / 2;
    const offsetY = (VIEWBOX_SIZE - canvasHeight) / 2;

    const displayWidth = Math.max(calculatedWidth || maxWidth, 1);
    const radWidth = displayWidth * SCALE;
    const radHeight = Math.max(valveCenterDistance + 100, 50) * SCALE;
    
    const elementWidth = 45;
    const tubeWidth = 25 * SCALE; 
    const tubeCount = Math.floor(displayWidth / elementWidth);

    // Calculate Y Position based on valveHeight if present, otherwise center
    let radY: number;
    if (valveHeight > 0) {
      // Position the radiator so the valve center matches the valveHeight from the bottom
      // Distance from radiator bottom to valve center is roughly 5 * SCALE in this visualizer
      const valveOffsetFromRadBottom = 5 * SCALE;
      const targetValveY = offsetY + canvasHeight - (valveHeight * SCALE);
      radY = targetValveY - (radHeight - valveOffsetFromRadBottom);
    } else {
      radY = offsetY + (canvasHeight - radHeight) / 2;
    }

    const radX = offsetX + (canvasWidth - radWidth) / 2;

    return {
      VIEWBOX_SIZE,
      SCALE,
      canvasWidth,
      canvasHeight,
      offsetX,
      offsetY,
      radWidth,
      radHeight,
      radX,
      radY,
      tubeWidth,
      tubeCount,
      elementWidth,
      displayWidth,
      maxWidth
    };
  }, [nicheWidth, nicheHeight, valveHeight, calculatedWidth, maxWidth, valveCenterDistance]);

  const statusColor = useMemo(() => {
    if (!realWatts || !requiredWatts) return 'bg-slate-900';
    const diff = realWatts - requiredWatts;
    if (diff <= -250) return 'bg-blue-600';
    if (diff <= -100) return 'bg-sky-400';
    if (diff <= 100) return 'bg-emerald-500';
    if (diff < 250) return 'bg-orange-500';
    return 'bg-red-600';
  }, [realWatts, requiredWatts]);

  const { 
    VIEWBOX_SIZE, SCALE, canvasWidth, canvasHeight, offsetX, offsetY, 
    radWidth, radHeight, radX, radY, tubeWidth, tubeCount, elementWidth, 
    displayWidth
  } = layout;

  // Fixed visual sizes for indicators (not affected by SCALE)
  const FIXED_DOT_RADIUS = 6;
  const FIXED_DIAPHRAGM_SIZE = 12;

  return (
    <div className="bg-white p-6 rounded-2xl flex flex-col items-center border border-slate-200 w-full shadow-inner">
      <div className="mb-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b pb-1 w-full text-center">
        Prospetto Tecnico Dinamico
      </div>
      
      <svg 
        viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`} 
        className="w-full h-auto drop-shadow-md"
        style={{ maxHeight: '400px' }}
      >
        {/* SVG Defs for reusable components */}
        <defs>
          <rect
            id="radiator-tube"
            x={-(tubeWidth / 2)}
            y="0"
            width={tubeWidth}
            height={radHeight}
            rx={tubeWidth / 2}
            fill="white"
            stroke="#64748b"
            strokeWidth="0.8"
          />
        </defs>

        {/* Niche Quotes - Horizontal (Width) */}
        <g stroke="#94a3b8" strokeWidth="1">
          <line x1={offsetX} y1={offsetY - 25} x2={offsetX + canvasWidth} y2={offsetY - 25} />
          <line x1={offsetX} y1={offsetY - 30} x2={offsetX} y2={offsetY - 20} />
          <line x1={offsetX + canvasWidth} y1={offsetY - 30} x2={offsetX + canvasWidth} y2={offsetY - 20} />
        </g>
        <text x={offsetX + canvasWidth / 2} y={offsetY - 35} fontSize="12" textAnchor="middle" fill="#64748b" fontWeight="700">
          L. Nicchia: {Math.round(nicheWidth)} mm
        </text>

        {/* Niche Quotes - Vertical (Height) */}
        <g stroke="#94a3b8" strokeWidth="1">
          <line x1={offsetX - 25} y1={offsetY} x2={offsetX - 25} y2={offsetY + canvasHeight} />
          <line x1={offsetX - 30} y1={offsetY} x2={offsetX - 20} y2={offsetY} />
          <line x1={offsetX - 30} y1={offsetY + canvasHeight} x2={offsetX - 20} y2={offsetY + canvasHeight} />
        </g>
        <text 
          x={offsetX - 40} 
          y={offsetY + canvasHeight / 2} 
          fontSize="12" 
          textAnchor="middle" 
          fill="#64748b" 
          fontWeight="700" 
          transform={`rotate(-90, ${offsetX - 40}, ${offsetY + canvasHeight / 2})`}
        >
          H. Nicchia: {Math.round(nicheHeight)} mm
        </text>

        {/* Niche Background */}
        <rect 
          x={offsetX} 
          y={offsetY} 
          width={canvasWidth} 
          height={canvasHeight} 
          fill="#f1f5f9" 
          stroke="#cbd5e1" 
          strokeWidth="1.5"
        />

        {/* Radiator Group */}
        <g transform={`translate(${radX}, ${radY})`}>
          {/* Main Tubes using <use> for performance */}
          {Array.from({ length: tubeCount }).map((_, i) => (
            <use
              key={i}
              href="#radiator-tube"
              x={(i * elementWidth * SCALE) + (elementWidth * SCALE / 2)}
            />
          ))}
          
          {/* Horizontal Connection Bars (Stylized) */}
          <rect x="0" y={3 * SCALE} width={radWidth} height={8 * SCALE} fill="#f8fafc" stroke="#64748b" strokeWidth="0.5" rx="2" />
          <rect x="0" y={radHeight - 11 * SCALE} width={radWidth} height={8 * SCALE} fill="#f8fafc" stroke="#64748b" strokeWidth="0.5" rx="2" />

          {/* Valve Connection Points - Fixed Size */}
          {valvePosition === ValvePosition.BOTTOM && (
            <>
              <circle cx={elementWidth * 0.5 * SCALE} cy={radHeight - 5 * SCALE} r={FIXED_DOT_RADIUS} fill="#ef4444" />
              <circle cx={radWidth - elementWidth * 0.5 * SCALE} cy={radHeight - 5 * SCALE} r={FIXED_DOT_RADIUS} fill="#ef4444" />
            </>
          )}

          {valvePosition === ValvePosition.RIGHT && (
            <>
              <circle cx={radWidth} cy={15 * SCALE} r={FIXED_DOT_RADIUS} fill="#ef4444" />
              <circle cx={radWidth} cy={radHeight - 15 * SCALE} r={FIXED_DOT_RADIUS} fill="#ef4444" />
            </>
          )}

          {valvePosition === ValvePosition.LEFT && (
            <>
              <circle cx={0} cy={15 * SCALE} r={FIXED_DOT_RADIUS} fill="#ef4444" />
              <circle cx={0} cy={radHeight - 15 * SCALE} r={FIXED_DOT_RADIUS} fill="#ef4444" />
            </>
          )}

          {/* Diaphragm Indicator - Fixed Size */}
          {hasDiaphragm && (
            <rect 
              x={elementWidth * 0.5 * SCALE - FIXED_DIAPHRAGM_SIZE / 2} 
              y={radHeight / 2 - FIXED_DIAPHRAGM_SIZE / 2} 
              width={FIXED_DIAPHRAGM_SIZE} 
              height={FIXED_DIAPHRAGM_SIZE} 
              fill="#ef4444" 
            />
          )}
        </g>

        {/* Valve Height Indicator if set */}
        {valveHeight > 0 && (
          <g stroke="#ef4444" strokeWidth="1" strokeDasharray="4,2 opacity-40">
            <line 
              x1={offsetX - 10} 
              y1={offsetY + canvasHeight - (valveHeight * SCALE)} 
              x2={offsetX + canvasWidth + 10} 
              y2={offsetY + canvasHeight - (valveHeight * SCALE)} 
            />
          </g>
        )}

        {/* Radiator Width Dimension Line */}
        <g stroke="#334155" strokeWidth="1" strokeDasharray="2,2">
          <line x1={radX} y1={radY + radHeight + 15} x2={radX + radWidth} y2={radY + radHeight + 15} />
          <line x1={radX} y1={radY + radHeight + 10} x2={radX} y2={radY + radHeight + 20} strokeDasharray="none" />
          <line x1={radX + radWidth} y1={radY + radHeight + 10} x2={radX + radWidth} y2={radY + radHeight + 20} strokeDasharray="none" />
        </g>
        <text 
          x={radX + radWidth / 2} 
          y={radY + radHeight + 35} 
          fontSize="14" 
          textAnchor="middle" 
          fill={(maxWidth > 0 && displayWidth > maxWidth) ? "#ef4444" : "#1e293b"} 
          fontWeight="800"
        >
          {Math.round(displayWidth)} mm {(maxWidth > 0 && displayWidth > maxWidth) ? '!!!' : ''}
        </text>
      </svg>

      <div className="mt-6 w-full flex justify-around text-[11px] font-bold uppercase tracking-tight mb-4">
        <div className="flex items-center gap-2">
           <div className="w-3 h-3 bg-red-500 rounded-full"></div>
           <span className="text-slate-500">Attacchi Valvole</span>
        </div>
        {hasDiaphragm && (
          <div className="flex items-center gap-2">
             <div className="w-3 h-3 bg-red-500 rounded-sm"></div>
             <span className="text-slate-500 font-bold">Diaframma PRESENTE</span>
          </div>
        )}
      </div>

      {realWatts && requiredWatts && (
        <div className={`w-full p-4 rounded text-white flex justify-between items-center shadow-lg transition-colors duration-500 ${statusColor}`}>
          <span className="text-[10px] uppercase font-bold opacity-80">Resa Effettiva:</span>
          <span className="text-2xl font-light tracking-tighter">{realWatts} WATT</span>
        </div>
      )}

      {/* Wattage Color Legend */}
      <div className="mt-6 w-full pt-4 border-t border-slate-100 no-print">
        <h5 className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-3 text-center">Legenda Efficienza Termica</h5>
        <div className="grid grid-cols-1 gap-2 text-[10px]">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-sm bg-blue-600"></div>
            <span className="text-slate-600 italic">Inferiore di 250W o più (Sottodimensionamento)</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-sm bg-sky-400"></div>
            <span className="text-slate-600 italic">Inferiore di 100W o più (Leggero sottodimensionamento)</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-sm bg-emerald-500"></div>
            <span className="text-slate-600 italic">Compresa tra ± 100W dal fabbisogno (Ottimale)</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-sm bg-orange-500"></div>
            <span className="text-slate-600 italic">Superiore a 100W (Leggero sovradimensionamento)</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-sm bg-red-600"></div>
            <span className="text-slate-600 italic">Superiore a 250W (Sovradimensionamento)</span>
          </div>
        </div>
      </div>
    </div>
  );
});
