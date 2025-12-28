
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { ValvePosition, RadiatorSpecs, CalculationResult, Environment, Project, RadiatorModel, RadiatorSeries, GlobalSettings } from './types';
import { INITIAL_SPECS, INITIAL_SETTINGS, createInitialProject, PIPE_DIAMETERS, PIPE_MATERIALS } from './constants';
import { TESI2_MODELS, TESI3_MODELS, TESI4_MODELS } from './radiatorData';
import { RadiatorVisualizer } from './components/RadiatorVisualizer';
import { GoogleGenAI, Type } from "@google/genai";

const App: React.FC = () => {
  const loadState = <T,>(key: string, defaultValue: T): T => {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : defaultValue;
  };

  const [projects, setProjects] = useState<Project[]>(() => loadState('archquote_projects_v3', [createInitialProject()]));
  const [activeProjectId, setActiveProjectId] = useState(() => loadState('archquote_active_project_id_v3', projects[0]?.id || ''));
  const [customModels, setCustomModels] = useState<RadiatorModel[]>(() => loadState('archquote_custom_models_v3', []));
  const [settings, setSettings] = useState<GlobalSettings>(() => loadState('archquote_settings_v3', INITIAL_SETTINGS));
  
  const [showSettings, setShowSettings] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [activeEnvIndex, setActiveEnvIndex] = useState(0);

  const [newModel, setNewModel] = useState<RadiatorModel>({
    label: '',
    code: '',
    height: 0,
    interaxis: 0,
    watts: 0,
    brand: ''
  });

  useEffect(() => {
    localStorage.setItem('archquote_projects_v3', JSON.stringify(projects));
    localStorage.setItem('archquote_active_project_id_v3', JSON.stringify(activeProjectId));
    localStorage.setItem('archquote_custom_models_v3', JSON.stringify(customModels));
    localStorage.setItem('archquote_settings_v3', JSON.stringify(settings));
  }, [projects, activeProjectId, customModels, settings]);

  const activeProject = useMemo(() => 
    projects.find(p => p.id === activeProjectId) || projects[0], 
  [projects, activeProjectId]);

  const activeEnv = activeProject.environments[activeEnvIndex] || activeProject.environments[0];

  const calculateWatts = useCallback((env: Environment): CalculationResult => {
    const volume = (env.specs.surface || 0) * (env.specs.height || 0);
    const watts = (volume * settings.wattCoefficient) / 0.86;
    return { volume, watts };
  }, [settings.wattCoefficient]);

  const getEnvRadiatorData = useCallback((env: Environment) => {
    const targetInteraxis = env.specs.valveCenterDistance || 0;
    const series = env.specs.series;
    
    let modelList: RadiatorModel[] = [];
    if (series === RadiatorSeries.TESI2) modelList = TESI2_MODELS;
    else if (series === RadiatorSeries.TESI3) modelList = TESI3_MODELS;
    else if (series === RadiatorSeries.TESI4) modelList = TESI4_MODELS;
    else if (series === RadiatorSeries.CUSTOM) modelList = customModels;

    if (modelList.length === 0) {
      return {
        model: { label: 'N/A', code: 'N/A', height: 0, interaxis: 0, watts: 0 },
        series: series,
        currentElements: 0,
        totalLength: 0,
        totalWatts: 0,
        requiredWatts: Math.round(calculateWatts(env).watts),
        hasClearanceIssue: false,
        eccentricText: null
      };
    }

    let closest = modelList[0];
    let minDiff = Math.abs(targetInteraxis - closest.interaxis);
    modelList.forEach(m => {
      const diff = Math.abs(targetInteraxis - m.interaxis);
      if (diff < minDiff) {
        minDiff = diff;
        closest = m;
      }
    });

    const interaxisDiff = Math.abs(targetInteraxis - closest.interaxis);
    const needsEccentric = (env.specs.valvePosition !== ValvePosition.BOTTOM && interaxisDiff > 0);
    const eccentricText = needsEccentric ? `Inserire eccentrici per ${interaxisDiff} mm` : null;

    const requiredWatts = calculateWatts(env).watts;
    const baseElements = Math.ceil(requiredWatts / (closest.watts || 1));
    const finalElements = env.specs.manualElements ?? baseElements;
    const totalLength = finalElements * 45;

    const { nicheWidth, sideValveDistance, valvePosition } = env.specs;
    let hasClearanceIssue = false;

    if (nicheWidth > 0) {
      // Se ci sono eccentrici, aggiungiamo 50mm di ingombro (Requirement: riduzione 5cm)
      const eccentricPenalty = needsEccentric ? 50 : 0;

      if (valvePosition === ValvePosition.BOTTOM) {
        const totalOccupied = sideValveDistance + 50 + totalLength + 50;
        const rightGap = nicheWidth - totalOccupied;
        if (sideValveDistance < 50 || rightGap < 50) {
          hasClearanceIssue = true;
        }
      } else {
        const totalOccupied = sideValveDistance + 50 + totalLength + eccentricPenalty;
        const remainingGap = nicheWidth - totalOccupied;
        if (sideValveDistance < 50 || remainingGap < 50) {
          hasClearanceIssue = true;
        }
      }
    }

    return {
      model: closest,
      series: series,
      eccentricText: eccentricText,
      currentElements: finalElements,
      totalLength: totalLength,
      totalWatts: Math.round(finalElements * closest.watts),
      requiredWatts: Math.round(requiredWatts),
      hasClearanceIssue: hasClearanceIssue
    };
  }, [customModels, calculateWatts]);

  const matchedModelData = useMemo(() => getEnvRadiatorData(activeEnv), [activeEnv, getEnvRadiatorData]);

  const addProject = () => {
    const p = createInitialProject();
    setProjects(prev => [...prev, p]);
    setActiveProjectId(p.id);
    setActiveEnvIndex(0);
  };

  const removeProject = (id: string) => {
    if (projects.length <= 1) return;
    const nextProjects = projects.filter(p => p.id !== id);
    setProjects(nextProjects);
    if (activeProjectId === id) {
      setActiveProjectId(nextProjects[0].id);
      setActiveEnvIndex(0);
    }
  };

  const updateProjectDetails = (field: keyof Project, value: string) => {
    setProjects(prev => prev.map(p => p.id === activeProjectId ? { ...p, [field]: value } : p));
  };

  const addEnvironment = () => {
    const newEnv: Environment = {
      id: Math.random().toString(36).substr(2, 9),
      name: `Ambiente ${activeProject.environments.length + 1}`,
      specs: { ...INITIAL_SPECS }
    };
    setProjects(prev => prev.map(p => p.id === activeProjectId ? { ...p, environments: [...p.environments, newEnv] } : p));
    setActiveEnvIndex(activeProject.environments.length);
  };

  const removeEnvironment = (idx: number) => {
    if (activeProject.environments.length <= 1) return;
    setProjects(prev => prev.map(p => p.id === activeProjectId ? { ...p, environments: p.environments.filter((_, i) => i !== idx) } : p));
    setActiveEnvIndex(Math.max(0, idx - 1));
  };

  const handleEnvNameChange = (name: string) => {
    setProjects(prev => prev.map(p => p.id === activeProjectId ? { ...p, environments: p.environments.map((env, i) => i === activeEnvIndex ? { ...env, name } : env) } : p));
  };

  const handleSpecChange = (field: keyof RadiatorSpecs, value: any) => {
    setProjects(prev => prev.map(p => p.id === activeProjectId ? { ...p, environments: p.environments.map((env, i) => {
      if (i !== activeEnvIndex) return env;
      const updatedSpecs = { ...env.specs, [field]: value };
      
      if (field === 'nicheWidth' || field === 'sideValveDistance') {
        updatedSpecs.maxWidth = Math.max(0, (updatedSpecs.nicheWidth || 0) - (updatedSpecs.sideValveDistance || 0) - 50);
      }

      if (['surface', 'height', 'valveCenterDistance', 'series'].includes(field)) {
        updatedSpecs.manualElements = undefined;
      }
      return { ...env, specs: updatedSpecs };
    })} : p));
  };

  const handleManualElementsChange = (val: number) => {
    setProjects(prev => prev.map(p => p.id === activeProjectId ? { ...p, environments: p.environments.map((env, i) => i === activeEnvIndex ? { ...env, specs: { ...env.specs, manualElements: val } } : env)} : p));
  };

  const handleAddCustomModel = () => {
    if (!newModel.label || !newModel.height) return;
    const modelToAdd = { ...newModel, id: Math.random().toString(36).substr(2, 9) };
    setCustomModels(prev => [...prev, modelToAdd]);
    setNewModel({ label: '', code: '', height: 0, interaxis: 0, watts: 0, brand: '' });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const brandName = prompt("Inserisci il nome del Marchio per questi modelli (es. Fondital):") || "Generico";
    setIsExtracting(true);
    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64Data = (event.target?.result as string).split(',')[1];
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: {
            parts: [
              { inlineData: { data: base64Data, mimeType: file.type } },
              { text: `Extract all radiator technical data from this image/document. Return a JSON array of objects with keys: 'label' (model height name like 200, 300), 'code' (full model code), 'height' (numeric, mm), 'interaxis' (numeric, mm), 'watts' (numeric, Watt at DeltaT 50). Associate with brand: ${brandName}.` }
            ]
          },
          config: {
            responseMimeType: "application/json"
          }
        });
        const extracted = JSON.parse(response.text || '[]');
        const modelsWithIds = extracted.map((m: any) => ({ ...m, brand: brandName, id: Math.random().toString(36).substr(2, 9) }));
        setCustomModels(prev => [...prev, ...modelsWithIds]);
        setIsExtracting(false);
        alert(`${modelsWithIds.length} modelli estratti!`);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      setIsExtracting(false);
      alert("Errore AI.");
    }
  };

  return (
    <div className="min-h-screen pb-20 bg-slate-100 font-sans">
      <div className="no-print max-w-7xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-10">
          <div className="flex flex-col">
            <h1 className="arch-title text-4xl font-bold text-slate-800 tracking-tight">HeatMaster <span className="text-slate-400">ArchQuote</span></h1>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Professional Thermal Engineering Tool</p>
          </div>
          <div className="flex gap-4">
            <button onClick={() => setShowSettings(true)} className="bg-white border border-slate-300 text-slate-700 px-6 py-2 rounded-full font-medium hover:bg-slate-50 transition-colors flex items-center shadow-sm">
              <span className="mr-2">⚙️</span> Impostazioni
            </button>
            <button onClick={() => window.print()} className="bg-slate-800 text-white px-8 py-2 rounded-full font-medium hover:bg-slate-700 transition-colors flex items-center shadow-lg">
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
              Stampa Progetto
            </button>
          </div>
        </div>

        {showSettings && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
            <div className="bg-white rounded-3xl p-10 max-w-4xl w-full shadow-2xl animate-in zoom-in duration-200 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-start mb-8">
                <div><h2 className="text-3xl font-bold text-slate-900 arch-title">Configurazione Sistema</h2></div>
                <button onClick={() => setShowSettings(false)} className="bg-slate-100 p-2 rounded-full text-slate-600">✕</button>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                <div className="space-y-8">
                  <section>
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Calcolo Termico</h3>
                    <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200">
                      <label className="block text-sm font-bold text-slate-700 mb-2">Coefficiente K (Watt/m³)</label>
                      <input type="number" value={settings.wattCoefficient} onChange={e => setSettings({ ...settings, wattCoefficient: Number(e.target.value) })} className="w-full border rounded-xl p-3 text-lg font-bold" />
                    </div>
                  </section>
                </div>
                <div className="space-y-8">
                  <section>
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Database Modelli</h3>
                    <div className="space-y-3 bg-white border border-slate-200 p-6 rounded-2xl">
                      <input placeholder="Marchio" value={newModel.brand} onChange={e => setNewModel({...newModel, brand: e.target.value})} className="w-full border rounded-xl p-3 text-sm" />
                      <input placeholder="Modello" value={newModel.label} onChange={e => setNewModel({...newModel, label: e.target.value})} className="w-full border rounded-xl p-3 text-sm" />
                      <button onClick={handleAddCustomModel} className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold">Aggiungi</button>
                    </div>
                  </section>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          <div className="lg:col-span-3 space-y-8">
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">PROGETTI</h3>
                <button onClick={addProject} className="bg-slate-900 text-white p-2 rounded-full shadow-md">+</button>
              </div>
              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {projects.map((p) => (
                  <button key={p.id} onClick={() => { setActiveProjectId(p.id); setActiveEnvIndex(0); }} className={`w-full text-left p-4 rounded-2xl border transition-all ${activeProjectId === p.id ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-600'}`}>
                    <p className="text-xs font-black uppercase opacity-60 truncate">{p.clientSurname || 'Nuovo'}</p>
                    <p className="text-sm font-bold truncate">{p.siteAddress || 'Senza Indirizzo'}</p>
                  </button>
                ))}
              </div>
            </div>
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">AMBIENTI</h3>
                <button onClick={addEnvironment} className="text-[10px] bg-slate-100 px-3 py-1 rounded-full font-black uppercase">+ Aggiungi</button>
              </div>
              <div className="space-y-2">
                {activeProject.environments.map((env, i) => (
                  <button key={env.id} onClick={() => setActiveEnvIndex(i)} className={`w-full text-left px-4 py-3 rounded-xl text-sm font-bold ${i === activeEnvIndex ? 'bg-slate-200 text-slate-900' : 'bg-slate-50 text-slate-500'}`}>
                    {env.name}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="lg:col-span-9 space-y-10">
            <div className="bg-white p-8 rounded-3xl border border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-6">
              <div><label className="text-[10px] font-bold text-slate-400 uppercase">Nome</label><input value={activeProject.clientName} onChange={e => updateProjectDetails('clientName', e.target.value)} className="w-full bg-slate-50 rounded-xl p-3 text-sm font-bold" /></div>
              <div><label className="text-[10px] font-bold text-slate-400 uppercase">Cognome</label><input value={activeProject.clientSurname} onChange={e => updateProjectDetails('clientSurname', e.target.value)} className="w-full bg-slate-50 rounded-xl p-3 text-sm font-bold" /></div>
              <div><label className="text-[10px] font-bold text-slate-400 uppercase">Indirizzo</label><input value={activeProject.siteAddress} onChange={e => updateProjectDetails('siteAddress', e.target.value)} className="w-full bg-slate-50 rounded-xl p-3 text-sm font-bold" /></div>
            </div>

            <div className="bg-white p-10 rounded-[3rem] shadow-xl border border-slate-200">
              <div className="flex justify-between items-center mb-10">
                <input value={activeEnv.name} onChange={e => handleEnvNameChange(e.target.value)} className="text-4xl font-bold text-slate-900 border-none bg-transparent focus:ring-0 outline-none w-full arch-title" />
                <div className="flex items-center gap-4 bg-slate-900 p-6 rounded-3xl text-white shadow-2xl">
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase font-black tracking-widest text-slate-400">Fabbisogno</span>
                    <span className="text-3xl font-light tracking-tighter">{Math.round(calculateWatts(activeEnv).watts)} <span className="text-sm opacity-50">Watt</span></span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-16">
                <div className="space-y-10">
                  <section>
                    <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest border-b pb-4 mb-6">Dimensionamento</h4>
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase">Superficie (m²)</label><input type="number" value={activeEnv.specs.surface || ''} onChange={e => handleSpecChange('surface', Number(e.target.value))} className="w-full bg-slate-50 rounded-xl p-4 font-bold" /></div>
                      <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase">Altezza (m)</label><input type="number" step="0.1" value={activeEnv.specs.height || ''} onChange={e => handleSpecChange('height', Number(e.target.value))} className="w-full bg-slate-50 rounded-xl p-4 font-bold" /></div>
                    </div>
                  </section>

                  <section>
                    <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest border-b pb-4 mb-6">Dati Nicchia</h4>
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase">Largh. Nicchia (mm)</label><input type="number" value={activeEnv.specs.nicheWidth || ''} onChange={e => handleSpecChange('nicheWidth', Number(e.target.value))} className="w-full bg-slate-50 rounded-xl p-4 font-bold" /></div>
                      <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase">Alt. Nicchia (mm)</label><input type="number" value={activeEnv.specs.nicheHeight || ''} onChange={e => handleSpecChange('nicheHeight', Number(e.target.value))} className="w-full bg-slate-50 rounded-xl p-4 font-bold" /></div>
                      <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase">Alt. Valvola (mm)</label><input type="number" value={activeEnv.specs.valveHeight || ''} onChange={e => handleSpecChange('valveHeight', Number(e.target.value))} className="w-full bg-slate-50 rounded-xl p-4 font-bold" /></div>
                      <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase">Dist. Valvola Lato (mm)</label><input type="number" value={activeEnv.specs.sideValveDistance || ''} onChange={e => handleSpecChange('sideValveDistance', Number(e.target.value))} className="w-full bg-slate-50 rounded-xl p-4 font-bold" /></div>
                    </div>
                  </section>

                  <section>
                    <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest border-b pb-4 mb-6">Configurazione Tecnica</h4>
                    <div className="grid grid-cols-2 gap-6">
                      <div className="col-span-2 space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase">Gamma Prodotto</label>
                        <select value={activeEnv.specs.series} onChange={e => handleSpecChange('series', e.target.value as RadiatorSeries)} className="w-full bg-slate-50 rounded-xl p-4 font-bold">
                          <option value={RadiatorSeries.TESI2}>Irsap Tesi 2</option>
                          <option value={RadiatorSeries.TESI3}>Irsap Tesi 3</option>
                          <option value={RadiatorSeries.TESI4}>Irsap Tesi 4</option>
                          <option value={RadiatorSeries.CUSTOM}>Custom ({customModels.length})</option>
                        </select>
                      </div>
                      <div className="col-span-2 space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase">Posizione Valvole</label>
                        <select value={activeEnv.specs.valvePosition} onChange={e => handleSpecChange('valvePosition', e.target.value as ValvePosition)} className="w-full bg-slate-50 rounded-xl p-4 font-bold">
                          <option value={ValvePosition.BOTTOM}>Basse (Lati Opposti)</option>
                          <option value={ValvePosition.RIGHT}>Destra Verticale</option>
                          <option value={ValvePosition.LEFT}>Sinistra Verticale</option>
                        </select>
                      </div>
                      <div className="col-span-2 flex items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                        <input 
                          type="checkbox" 
                          id="diaframma" 
                          checked={activeEnv.specs.hasDiaphragm} 
                          onChange={e => handleSpecChange('hasDiaphragm', e.target.checked)}
                          className="w-5 h-5 accent-slate-900"
                        />
                        <label htmlFor="diaframma" className="text-xs font-black text-slate-800 uppercase cursor-pointer">Applica Diaframma Interno</label>
                      </div>
                      <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase">Interasse (mm)</label><input type="number" value={activeEnv.specs.valveCenterDistance || ''} onChange={e => handleSpecChange('valveCenterDistance', Number(e.target.value))} className="w-full bg-slate-50 rounded-xl p-4 font-bold" /></div>
                      <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase">Ingombro Max (mm)</label><input type="number" value={activeEnv.specs.maxWidth || ''} onChange={e => handleSpecChange('maxWidth', Number(e.target.value))} className="w-full bg-slate-50 rounded-xl p-4 font-bold" /></div>
                    </div>
                  </section>

                  <section className="bg-slate-900 p-8 rounded-[2rem] text-white shadow-2xl space-y-6">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Configurazione Ottimale</h4>
                    <div className="grid grid-cols-2 gap-8">
                      <div className="col-span-1">
                        <span className="block text-[9px] text-white/50 uppercase mb-1">Modello / Altezza</span>
                        <span className="text-lg font-bold block">{matchedModelData.model.label} <span className="text-xs opacity-60">/ H {matchedModelData.model.height}mm</span></span>
                        {matchedModelData.eccentricText && <span className="text-[10px] font-black text-red-500 uppercase leading-none mt-1 block">{matchedModelData.eccentricText}</span>}
                      </div>
                      <div><span className="block text-[9px] text-white/50 uppercase mb-1">Nr. Elementi</span><input type="number" value={matchedModelData.currentElements || ''} onChange={e => handleManualElementsChange(Number(e.target.value))} className="bg-white/10 rounded-lg px-3 py-1 text-lg font-black w-24" /></div>
                      <div className={matchedModelData.hasClearanceIssue ? 'text-red-400 animate-pulse' : ''}>
                        <span className="block text-[9px] text-white/50 uppercase mb-1">Ingombro Totale</span>
                        <span className="text-2xl font-black">{matchedModelData.totalLength}mm</span>
                        {matchedModelData.hasClearanceIssue && <p className="text-[8px] font-black uppercase mt-1">SPAZIO INSUFFICIENTE (MIN 5cm)</p>}
                      </div>
                    </div>
                  </section>
                </div>

                <div className="space-y-10">
                  <RadiatorVisualizer specs={activeEnv.specs} calculatedWidth={matchedModelData.totalLength} realWatts={matchedModelData.totalWatts} requiredWatts={matchedModelData.requiredWatts} />
                  
                  <section className="bg-white p-8 rounded-3xl border border-slate-200 shadow-inner">
                    <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-6">Specifiche Impianto</h4>
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase">Tubo</label><select value={activeEnv.specs.pipeMaterial} onChange={e => handleSpecChange('pipeMaterial', e.target.value)} className="w-full bg-slate-100 rounded-xl p-3 text-sm font-bold">{PIPE_MATERIALS.map(m => <option key={m} value={m}>{m}</option>)}</select></div>
                      <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase">Diametro</label><select value={activeEnv.specs.pipeDiameter} onChange={e => handleSpecChange('pipeDiameter', e.target.value)} className="w-full bg-slate-100 rounded-xl p-3 text-sm font-bold">{PIPE_DIAMETERS.map(d => <option key={d} value={d}>{d}</option>)}</select></div>
                    </div>
                  </section>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Prospetto Riepilogativo (No print) */}
        <div className="no-print mt-12 bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
           <h3 className="text-lg font-black text-slate-900 uppercase tracking-widest mb-6">Schema Riepilogativo Progetto</h3>
           <div className="overflow-x-auto">
             <table className="w-full text-left text-sm">
               <thead>
                 <tr className="border-b-2 border-slate-900">
                   <th className="py-3 px-2">Ambiente</th>
                   <th className="py-3 px-2">Gamma Prodotto</th>
                   <th className="py-3 px-2">Modello</th>
                   <th className="py-3 px-2 text-center">Elementi</th>
                   <th className="py-3 px-2 text-center">Larghezza</th>
                   <th className="py-3 px-2 text-center">Resa Termica</th>
                   <th className="py-3 px-2 text-center">Diaframma</th>
                   <th className="py-3 px-2">Tubo</th>
                 </tr>
               </thead>
               <tbody>
                 {activeProject.environments.map(env => {
                   const data = getEnvRadiatorData(env);
                   return (
                    <tr key={env.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="py-4 px-2 font-bold">{env.name}</td>
                      <td className="py-4 px-2">{env.specs.series}</td>
                      <td className="py-4 px-2">{data.model.label} (H {data.model.height} / Int {data.model.interaxis})</td>
                      <td className="py-4 px-2 text-center font-black">{data.currentElements}</td>
                      <td className="py-4 px-2 text-center font-bold">{data.totalLength} mm</td>
                      <td className="py-4 px-2 text-center font-bold text-slate-600">{data.totalWatts} W</td>
                      <td className="py-4 px-2 text-center">{env.specs.hasDiaphragm ? 'SI' : 'NO'}</td>
                      <td className="py-4 px-2">{env.specs.pipeMaterial} {env.specs.pipeDiameter}</td>
                    </tr>
                   );
                 })}
               </tbody>
             </table>
           </div>
        </div>
      </div>

      {/* Printing Document Section */}
      <div className="hidden print:block bg-white text-black">
        {/* Page 1 per Environment */}
        {activeProject.environments.map((env, index) => {
          const wattsReq = calculateWatts(env).watts;
          const data = getEnvRadiatorData(env);
          
          return (
            <div key={env.id} className="p-16 min-h-screen relative flex flex-col" style={{ pageBreakAfter: 'always' }}>
              <div className="flex justify-between items-start mb-12">
                <div>
                  <h1 className="arch-title text-4xl font-black text-slate-900">HeatMaster ArchQuote</h1>
                  <p className="text-sm font-bold text-slate-500 mt-1">Cantiere: {activeProject.clientName} {activeProject.clientSurname}</p>
                  <p className="text-xs text-slate-400">{activeProject.siteAddress}</p>
                </div>
                <div className="text-right">
                   <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Ambiente #{index + 1}</p>
                   <p className="text-2xl font-black">{env.name}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-12 items-start mb-12">
                <div className="space-y-8">
                  <div className="bg-slate-900 text-white p-8 rounded-3xl">
                    <p className="text-[10px] uppercase font-bold text-slate-400 mb-2">Fabbisogno Calcolato</p>
                    <p className="text-5xl font-light tracking-tighter">{Math.round(wattsReq)} <span className="text-xl opacity-50">Watt</span></p>
                  </div>
                  
                  <div className="border-2 border-slate-100 p-8 rounded-3xl space-y-4">
                     <h4 className="text-xs font-black uppercase border-b pb-2">Dati Radiatore</h4>
                     <p className="flex justify-between"><span>Gamma:</span> <b>{data.series}</b></p>
                     <p className="flex justify-between"><span>Modello:</span> <b>{data.model.label}</b></p>
                     <p className="flex justify-between"><span>Altezza:</span> <b>{data.model.height} mm</b></p>
                     <p className="flex justify-between"><span>Interasse:</span> <b>{data.model.interaxis} mm</b></p>
                     <p className="flex justify-between"><span>Elementi:</span> <b>{data.currentElements}</b></p>
                     <p className="flex justify-between text-lg font-black pt-2 border-t"><span>Larghezza Tot:</span> <span>{data.totalLength} mm</span></p>
                     <p className="flex justify-between"><span>Diaframma:</span> <b>{env.specs.hasDiaphragm ? 'SÌ' : 'NO'}</b></p>
                  </div>
                </div>

                <div>
                   <RadiatorVisualizer specs={env.specs} calculatedWidth={data.totalLength} realWatts={data.totalWatts} requiredWatts={Math.round(wattsReq)} />
                </div>
              </div>

              <div className="mt-auto pt-8 border-t flex justify-between items-end">
                 <p className="text-[10px] text-slate-400">Stampato con HeatMaster ArchQuote v3</p>
                 <p className="text-[10px] text-slate-400">Pagina {index + 1}</p>
              </div>
            </div>
          );
        })}

        {/* Final Order Page (Requirement B) */}
        <div className="p-16 min-h-screen relative flex flex-col" style={{ pageBreakBefore: 'always' }}>
           <div className="mb-12 border-b-4 border-slate-900 pb-6">
              <h1 className="arch-title text-5xl font-black">ORDINE FORNITORE</h1>
              <p className="text-lg mt-2"><b>Cliente:</b> {activeProject.clientName} {activeProject.clientSurname}</p>
              <p className="text-sm opacity-60"><b>Cantiere:</b> {activeProject.siteAddress}</p>
           </div>

           <div className="flex-1">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b-2 border-slate-900">
                    <th className="py-4 px-2">Ambiente</th>
                    <th className="py-4 px-2">Modello (Gamma)</th>
                    <th className="py-4 px-2 text-center">H / Interasse</th>
                    <th className="py-4 px-2 text-center">Elementi</th>
                    <th className="py-4 px-2 text-center">Larghezza</th>
                    <th className="py-4 px-2 text-center">Diaframma</th>
                    <th className="py-4 px-2">Impianto (Tubo/Ø)</th>
                  </tr>
                </thead>
                <tbody>
                  {activeProject.environments.map(env => {
                    const data = getEnvRadiatorData(env);
                    return (
                      <tr key={env.id} className="border-b border-slate-200">
                        <td className="py-6 px-2 font-bold">{env.name}</td>
                        <td className="py-6 px-2">{data.model.label} ({data.series})</td>
                        <td className="py-6 px-2 text-center">{data.model.height} / {data.model.interaxis}</td>
                        <td className="py-6 px-2 text-center font-black text-xl">{data.currentElements}</td>
                        <td className="py-6 px-2 text-center font-bold">{data.totalLength} mm</td>
                        <td className="py-6 px-2 text-center">{env.specs.hasDiaphragm ? 'SÌ' : 'NO'}</td>
                        <td className="py-6 px-2">{env.specs.pipeMaterial} / {env.specs.pipeDiameter}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
           </div>

           <div className="mt-12 p-8 border-2 border-dashed border-slate-300 rounded-3xl">
              <h4 className="font-bold mb-4 uppercase text-xs tracking-widest">Note per la fornitura</h4>
              <p className="text-sm leading-relaxed">
                Tutti i caloriferi devono essere forniti pronti per l'installazione secondo gli interassi indicati. 
                I modelli con diaframma interno devono presentare il tappo/setto di separazione al primo elemento (lato mandata).
              </p>
           </div>

           <footer className="mt-20 flex justify-between items-end border-t pt-8">
              <div>
                <div className="w-48 h-px bg-slate-900 mb-2"></div>
                <p className="text-[10px] uppercase font-bold">Data e Firma Progettista</p>
              </div>
              <p className="text-[10px] text-slate-300">Pagina Ordine — Fine Progetto</p>
           </footer>
        </div>
      </div>
    </div>
  );
};

export default App;
