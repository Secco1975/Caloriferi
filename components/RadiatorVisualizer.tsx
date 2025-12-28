
import React, { useMemo } from 'react';
import { RadiatorSpecs, ValvePosition } from '../types';

interface RadiatorVisualizerProps {
  specs: RadiatorSpecs;
  calculatedWidth?: number;
  realWatts?: number;
  requiredWatts?: number;
}

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
    sideValveDistance,
    maxWidth, 
    hasDiaphragm
  } = specs;

  const layout = useMemo(() => {
    const VIEWBOX_SIZE = 500;
    const MARGIN = 70;
    const DRAWABLE_AREA = VIEWBOX_SIZE - MARGIN * 2;

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

    // GEOMETRIA INSTALLAZIONE
    let radX: number;
    let v1X: number;
    let v2X: number | null = null;

    if (valvePosition === ValvePosition.BOTTOM) {
      v1X = offsetX + sideValveDistance * SCALE;
      radX = v1X + 50 * SCALE;
      v2X = radX + radWidth + 50 * SCALE;
    } else if (valvePosition === ValvePosition.LEFT) {
      v1X = offsetX + sideValveDistance * SCALE;
      radX = v1X + 50 * SCALE;
    } else { // RIGHT
      v1X = (offsetX + canvasWidth) - sideValveDistance * SCALE;
      radX = v1X - 50 * SCALE - radWidth;
    }

    const targetValveY = offsetY + canvasHeight - (valveHeight * SCALE);
    const radY = targetValveY - (radHeight - 5 * SCALE);

    // DATI QUOTE
    const quotes = {
      nicheToV1: sideValveDistance,
      v1ToV2: (v2X && v1X) ? Math.round((v2X - v1X) / SCALE) : 0,
      v2ToRight: (v2X) ? Math.round(nicheWidth - (v2X - offsetX) / SCALE) : 0,
      radWidthMm: Math.round(displayWidth),
      radToOpposite: 0
    };

    if (valvePosition === ValvePosition.LEFT) {
      quotes.radToOpposite = Math.round(nicheWidth - (radX - offsetX + radWidth) / SCALE);
    } else if (valvePosition === ValvePosition.RIGHT) {
      quotes.radToOpposite = Math.round((radX - offsetX) / SCALE);
    }

    return {
      VIEWBOX_SIZE, SCALE, canvasWidth, canvasHeight, offsetX, offsetY, 
      radWidth, radHeight, radX, radY, tubeWidth, 
      tubeCount: Math.floor(displayWidth / elementWidth),
      elementWidth, displayWidth, v1X, v2X, targetValveY, quotes
    };
  }, [nicheWidth, nicheHeight, valveHeight, sideValveDistance, calculatedWidth, maxWidth, valveCenterDistance, valvePosition]);

  const { 
    VIEWBOX_SIZE, SCALE, canvasWidth, canvasHeight, offsetX, offsetY, 
    radWidth, radHeight, radX, radY, tubeWidth, tubeCount, elementWidth, 
    v1X, v2X, targetValveY, quotes
  } = layout;

  const statusColor = useMemo(() => {
    if (!realWatts || !requiredWatts) return 'bg-slate-900';
    const diff = realWatts - requiredWatts;
    if (diff <= -200) return 'bg-blue-600';
    if (diff <= -100) return 'bg-sky-400';
    if (diff <= 100) return 'bg-emerald-500';
    if (diff <= 200) return 'bg-orange-500';
    return 'bg-red-600';
  }, [realWatts, requiredWatts]);

  const FIXED_DOT_RADIUS = 6;
  const isErrV1 = quotes.nicheToV1 < 50;
  const isErrV2 = valvePosition === ValvePosition.BOTTOM && quotes.v2ToRight < 50;
  const isErrOpp = (valvePosition !== ValvePosition.BOTTOM) && quotes.radToOpposite < 50;

  return (
    <div className="bg-white p-6 rounded-2xl flex flex-col items-center border border-slate-200 w-full shadow-inner tech-font">
      <div className="mb-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b pb-1 w-full text-center">Prospetto Tecnico Dinamico</div>
      
      <svg viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`} className="w-full h-auto drop-shadow-md" style={{ maxHeight: '400px' }}>
        <defs>
          <rect id="rtube" x={-(tubeWidth / 2)} y="0" width={tubeWidth} height={radHeight} rx={tubeWidth / 2} fill="white" stroke="#64748b" strokeWidth="0.8" />
        </defs>

        {/* Niche BG */}
        <rect x={offsetX} y={offsetY} width={canvasWidth} height={canvasHeight} fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1" />

        {/* Radiator Body */}
        <g transform={`translate(${radX}, ${radY})`}>
          {Array.from({ length: tubeCount }).map((_, i) => (
            <use key={i} href="#rtube" x={(i * elementWidth * SCALE) + (elementWidth * SCALE / 2)} />
          ))}
          <rect x="0" y={3 * SCALE} width={radWidth} height={8 * SCALE} fill="#f8fafc" stroke="#64748b" strokeWidth="0.5" rx="2" />
          <rect x="0" y={radHeight - 11 * SCALE} width={radWidth} height={8 * SCALE} fill="#f8fafc" stroke="#64748b" strokeWidth="0.5" rx="2" />
        </g>

        {/* Valves */}
        <circle cx={v1X} cy={targetValveY} r={FIXED_DOT_RADIUS} fill="#ef4444" />
        {v2X && <circle cx={v2X} cy={targetValveY} r={FIXED_DOT_RADIUS} fill="#ef4444" />}

        {/* QUOTE DINAMICHE */}
        <g stroke="#94a3b8" strokeWidth="1" fontSize="10" fontWeight="bold">
          {valvePosition === ValvePosition.BOTTOM ? (
            <>
              {/* Distanza Nicchia-Valvola SX */}
              <line x1={offsetX} y1={radY + radHeight + 15} x2={v1X} y2={radY + radHeight + 15} strokeDasharray="2,2" stroke={isErrV1 ? '#ef4444' : '#94a3b8'} />
              <text x={offsetX + (v1X - offsetX)/2} y={radY + radHeight + 25} textAnchor="middle" fill={isErrV1 ? '#ef4444' : '#64748b'}>{quotes.nicheToV1}</text>
              
              {/* Distanza tra le due Valvole */}
              <line x1={v1X} y1={radY + radHeight + 15} x2={v2X!} y2={radY + radHeight + 15} strokeDasharray="2,2" />
              <text x={v1X + (v2X! - v1X)/2} y={radY + radHeight + 25} textAnchor="middle" fill="#64748b">Int. Valv: {quotes.v1ToV2}</text>

              {/* Distanza Nicchia-Valvola DX */}
              <line x1={v2X!} y1={radY + radHeight + 15} x2={offsetX + canvasWidth} y2={radY + radHeight + 15} strokeDasharray="2,2" stroke={isErrV2 ? '#ef4444' : '#94a3b8'} />
              <text x={v2X! + (offsetX + canvasWidth - v2X!)/2} y={radY + radHeight + 25} textAnchor="middle" fill={isErrV2 ? '#ef4444' : '#64748b'}>{quotes.v2ToRight}</text>
            </>
          ) : (
            <>
              {/* Distanza Nicchia-Valvola (Lato Impianto) */}
              <line 
                x1={valvePosition === ValvePosition.LEFT ? offsetX : v1X} 
                y1={radY + radHeight + 15} 
                x2={valvePosition === ValvePosition.LEFT ? v1X : offsetX + canvasWidth} 
                y2={radY + radHeight + 15} 
                strokeDasharray="2,2" 
                stroke={isErrV1 ? '#ef4444' : '#94a3b8'}
              />
              <text 
                x={valvePosition === ValvePosition.LEFT ? offsetX + (v1X - offsetX)/2 : v1X + (offsetX + canvasWidth - v1X)/2} 
                y={radY + radHeight + 25} 
                textAnchor="middle" 
                fill={isErrV1 ? '#ef4444' : '#64748b'}
              >
                {quotes.nicheToV1}
              </text>

              {/* Distanza Calorifero-Lato Opposto */}
              <line 
                x1={valvePosition === ValvePosition.LEFT ? radX + radWidth : offsetX} 
                y1={radY + radHeight + 15} 
                x2={valvePosition === ValvePosition.LEFT ? offsetX + canvasWidth : radX} 
                y2={radY + radHeight + 15} 
                strokeDasharray="2,2" 
                stroke={isErrOpp ? '#ef4444' : '#94a3b8'}
              />
              <text 
                x={valvePosition === ValvePosition.LEFT ? radX + radWidth + (offsetX + canvasWidth - (radX + radWidth))/2 : offsetX + (radX - offsetX)/2} 
                y={radY + radHeight + 25} 
                textAnchor="middle" 
                fill={isErrOpp ? '#ef4444' : '#64748b'}
              >
                Libero: {quotes.radToOpposite}
              </text>
            </>
          )}

          {/* Larghezza Calorifero (Sempre presente) */}
          <line x1={radX} y1={radY + radHeight + 45} x2={radX + radWidth} y2={radY + radHeight + 45} stroke="#1e293b" />
          <line x1={radX} y1={radY + radHeight + 40} x2={radX} y2={radY + radHeight + 50} stroke="#1e293b" />
          <line x1={radX + radWidth} y1={radY + radHeight + 40} x2={radX + radWidth} y2={radY + radHeight + 50} stroke="#1e293b" />
          <text x={radX + radWidth/2} y={radY + radHeight + 60} textAnchor="middle" fill="#1e293b" fontSize="12" fontWeight="black">CORPO: {quotes.radWidthMm}</text>
        </g>

        {/* Indicazione Altezza Valvola */}
        {valveHeight > 0 && (
          <line x1={offsetX - 10} y1={targetValveY} x2={offsetX + canvasWidth + 10} y2={targetValveY} stroke="#ef4444" strokeWidth="0.5" strokeDasharray="4,2" opacity="0.4" />
        )}
      </svg>

      {/* Striscia Resa Termica */}
      {realWatts && requiredWatts && (
        <div className={`mt-6 w-full p-4 rounded text-white flex justify-between items-center shadow-lg transition-colors ${statusColor}`}>
          <span className="text-[10px] uppercase font-bold opacity-80">Resa Termica Effettiva:</span>
          <span className="text-2xl font-black tracking-tighter">{realWatts} WATT</span>
        </div>
      )}

      {/* Legenda Efficienza */}
      <div className="mt-6 w-full pt-4 border-t border-slate-100 no-print">
        <h5 className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-3 text-center">Legenda Efficienza Termica</h5>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-[9px] leading-tight">
          <div className="flex items-center gap-2"><div className="w-3 h-3 bg-blue-600 rounded-sm"></div> <span className="text-slate-500">Scarso (&le; -200W)</span></div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 bg-sky-400 rounded-sm"></div> <span className="text-slate-500">Basso (&le; -100W)</span></div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 bg-emerald-500 rounded-sm"></div> <span className="text-slate-500">Ottimale (&plusmn; 100W)</span></div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 bg-orange-500 rounded-sm"></div> <span className="text-slate-500">Alto (&gt; +100W)</span></div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 bg-red-600 rounded-sm"></div> <span className="text-slate-500">Eccessivo (&gt; +200W)</span></div>
        </div>
      </div>
    </div>
  );
});
