
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

  // Global App States
  const [projects, setProjects] = useState<Project[]>(() => loadState('archquote_projects_v3', [createInitialProject()]));
  const [activeProjectId, setActiveProjectId] = useState(() => loadState('archquote_active_project_id_v3', projects[0]?.id || ''));
  const [customModels, setCustomModels] = useState<RadiatorModel[]>(() => loadState('archquote_custom_models_v3', []));
  const [settings, setSettings] = useState<GlobalSettings>(() => loadState('archquote_settings_v3', INITIAL_SETTINGS));
  
  // UI States
  const [showSettings, setShowSettings] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [activeEnvIndex, setActiveEnvIndex] = useState(0);

  // Manual model temp state
  const [newModel, setNewModel] = useState<RadiatorModel>({
    label: '',
    code: '',
    height: 0,
    interaxis: 0,
    watts: 0,
    brand: ''
  });

  // Persist State
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

  // Logic Handlers
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
        model: { label: 'Nessun Modello', code: 'N/A', height: 0, interaxis: 0, watts: 0 },
        series: series,
        eccentricNeeded: 0,
        eccentricText: null,
        suggestedElements: 0,
        currentElements: 0,
        totalLength: 0,
        totalWatts: 0,
        requiredWatts: Math.round(calculateWatts(env).watts)
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

    const diff = targetInteraxis - closest.interaxis;
    const requiredWatts = calculateWatts(env).watts;
    const baseElements = Math.ceil(requiredWatts / (closest.watts || 1));
    const finalElements = env.specs.manualElements ?? baseElements;
    const totalLength = finalElements * 45;

    return {
      model: closest,
      series: series,
      eccentricNeeded: Math.abs(diff),
      eccentricText: (env.specs.valvePosition !== ValvePosition.BOTTOM && diff !== 0) 
        ? `vanno inseriti eccentrici che compensino ${Math.abs(diff)} mm` 
        : null,
      suggestedElements: baseElements,
      currentElements: finalElements,
      totalLength: totalLength,
      totalWatts: Math.round(finalElements * closest.watts),
      requiredWatts: Math.round(requiredWatts)
    };
  }, [customModels, calculateWatts]);

  const matchedModelData = useMemo(() => getEnvRadiatorData(activeEnv), [activeEnv, getEnvRadiatorData]);

  // Project Actions
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

  // Environment Actions
  const addEnvironment = () => {
    const newEnv: Environment = {
      id: Math.random().toString(36).substr(2, 9),
      name: `Ambiente ${activeProject.environments.length + 1}`,
      specs: { ...INITIAL_SPECS }
    };
    setProjects(prev => prev.map(p => 
      p.id === activeProjectId 
        ? { ...p, environments: [...p.environments, newEnv] } 
        : p
    ));
    setActiveEnvIndex(activeProject.environments.length);
  };

  const removeEnvironment = (idx: number) => {
    if (activeProject.environments.length <= 1) return;
    setProjects(prev => prev.map(p => 
      p.id === activeProjectId 
        ? { ...p, environments: p.environments.filter((_, i) => i !== idx) } 
        : p
    ));
    setActiveEnvIndex(Math.max(0, idx - 1));
  };

  const handleEnvNameChange = (name: string) => {
    setProjects(prev => prev.map(p => 
      p.id === activeProjectId 
        ? { ...p, environments: p.environments.map((env, i) => i === activeEnvIndex ? { ...env, name } : env) } 
        : p
    ));
  };

  const handleSpecChange = (field: keyof RadiatorSpecs, value: any) => {
    setProjects(prev => prev.map(p => 
      p.id === activeProjectId 
        ? { 
            ...p, 
            environments: p.environments.map((env, i) => {
              if (i !== activeEnvIndex) return env;
              const updatedSpecs = { ...env.specs, [field]: value };
              if (['surface', 'height', 'valveCenterDistance', 'series'].includes(field)) {
                updatedSpecs.manualElements = undefined;
              }
              return { ...env, specs: updatedSpecs };
            }) 
          } 
        : p
    ));
  };

  const handleManualElementsChange = (val: number) => {
    setProjects(prev => prev.map(p => 
      p.id === activeProjectId 
        ? { 
            ...p, 
            environments: p.environments.map((env, i) => 
              i === activeEnvIndex ? { ...env, specs: { ...env.specs, manualElements: val } } : env
            )
          } 
        : p
    ));
  };

  // Settings Actions
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
              { text: `Extract all radiator technical data from this image/document. Return a JSON array of objects with keys: 'label' (model height name like 200, 300), 'code' (full model code), 'height' (numeric, mm), 'interaxis' (numeric, mm), 'watts' (numeric, Watt at DeltaT 50). Ensure numbers are strictly numeric. Associate all these with brand: ${brandName}.` }
            ]
          },
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  label: { type: Type.STRING },
                  code: { type: Type.STRING },
                  height: { type: Type.NUMBER },
                  interaxis: { type: Type.NUMBER },
                  watts: { type: Type.NUMBER }
                },
                required: ["label", "height", "interaxis", "watts"]
              }
            }
          }
        });

        const extracted = JSON.parse(response.text || '[]');
        const modelsWithIds = extracted.map((m: any) => ({ ...m, brand: brandName, id: Math.random().toString(36).substr(2, 9) }));
        setCustomModels(prev => [...prev, ...modelsWithIds]);
        setIsExtracting(false);
        alert(`${modelsWithIds.length} modelli estratti per ${brandName}!`);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error(error);
      setIsExtracting(false);
      alert("Errore durante l'estrazione. Prova un file diverso.");
    }
  };

  return (
    <div className="min-h-screen pb-20 bg-slate-100 font-sans">
      <div className="no-print max-w-7xl mx-auto px-4 py-8">
        
        {/* Header */}
        <div className="flex justify-between items-center mb-10">
          <div className="flex flex-col">
            <h1 className="arch-title text-4xl font-bold text-slate-800 tracking-tight">HeatMaster <span className="text-slate-400">ArchQuote</span></h1>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Professional Thermal Engineering Tool</p>
          </div>
          <div className="flex gap-4">
            <button 
              onClick={() => setShowSettings(true)}
              className="bg-white border border-slate-300 text-slate-700 px-6 py-2 rounded-full font-medium hover:bg-slate-50 transition-colors flex items-center shadow-sm"
            >
              <span className="mr-2">⚙️</span> Impostazioni
            </button>
            <button 
              onClick={() => window.print()}
              className="bg-slate-800 text-white px-8 py-2 rounded-full font-medium hover:bg-slate-700 transition-colors flex items-center shadow-lg"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Stampa Progetto
            </button>
          </div>
        </div>

        {/* Settings Modal */}
        {showSettings && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
            <div className="bg-white rounded-3xl p-10 max-w-4xl w-full shadow-2xl animate-in zoom-in duration-200 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-start mb-8">
                <div>
                  <h2 className="text-3xl font-bold text-slate-900 arch-title">Configurazione Sistema</h2>
                  <p className="text-sm text-slate-500 mt-1">Personalizza i parametri di calcolo e il database modelli.</p>
                </div>
                <button onClick={() => setShowSettings(false)} className="bg-slate-100 hover:bg-slate-200 p-2 rounded-full transition-colors text-slate-600">✕</button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                
                {/* Global Settings */}
                <div className="space-y-8">
                  <section>
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center">
                      <span className="mr-2 text-lg">🌡️</span> Calcolo Termico
                    </h3>
                    <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 shadow-sm">
                      <label className="block text-sm font-bold text-slate-700 mb-2">Coefficiente Watt/Volume (K)</label>
                      <div className="flex items-center gap-4">
                        <input 
                          type="number" 
                          value={settings.wattCoefficient} 
                          onChange={e => setSettings({ ...settings, wattCoefficient: Number(e.target.value) })}
                          className="w-full border rounded-xl p-3 text-lg font-bold text-slate-800"
                        />
                        <div className="text-xs text-slate-500 font-medium">Standard: 30</div>
                      </div>
                      <p className="mt-4 text-[11px] text-slate-500 italic">Formula utilizzata: (Superficie * Altezza * Coefficiente) / 0.86</p>
                    </div>
                  </section>

                  <section>
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center">
                      <span className="mr-2 text-lg">🏗️</span> Gestione Marchi Custom
                    </h3>
                    <div className="bg-emerald-50 p-6 rounded-2xl border border-emerald-100">
                      <div className={`w-full border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center transition-all ${isExtracting ? 'bg-white border-emerald-400' : 'border-emerald-200 hover:border-emerald-400'}`}>
                        {isExtracting ? (
                          <div className="space-y-4 text-center">
                            <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                            <p className="text-sm font-bold text-emerald-700">AI sta leggendo il documento...</p>
                          </div>
                        ) : (
                          <>
                            <span className="text-3xl mb-2">📸</span>
                            <p className="text-sm font-bold text-emerald-800 mb-4">Estrai Modelli da Catalogo (AI)</p>
                            <input type="file" id="ai-upload-settings" className="hidden" accept="image/*,application/pdf" onChange={handleFileUpload} />
                            <label htmlFor="ai-upload-settings" className="bg-emerald-600 text-white px-6 py-2 rounded-full font-bold cursor-pointer hover:bg-emerald-700 shadow-md">Carica File</label>
                          </>
                        )}
                      </div>
                    </div>
                  </section>
                </div>

                {/* Model List & Manual Addition */}
                <div className="space-y-8">
                   <section>
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center">
                      <span className="mr-2 text-lg">✏️</span> Inserimento Manuale
                    </h3>
                    <div className="space-y-3 bg-white border border-slate-200 p-6 rounded-2xl shadow-sm">
                      <input placeholder="Marchio (es. Fondital)" value={newModel.brand} onChange={e => setNewModel({...newModel, brand: e.target.value})} className="w-full border rounded-xl p-3 text-sm focus:ring-2 ring-slate-400 outline-none" />
                      <input placeholder="Etichetta Modello (es. 600)" value={newModel.label} onChange={e => setNewModel({...newModel, label: e.target.value})} className="w-full border rounded-xl p-3 text-sm focus:ring-2 ring-slate-400 outline-none" />
                      <div className="grid grid-cols-2 gap-3">
                        <input type="number" placeholder="Altezza (mm)" value={newModel.height || ''} onChange={e => setNewModel({...newModel, height: Number(e.target.value)})} className="border rounded-xl p-3 text-sm" />
                        <input type="number" placeholder="Interasse (mm)" value={newModel.interaxis || ''} onChange={e => setNewModel({...newModel, interaxis: Number(e.target.value)})} className="border rounded-xl p-3 text-sm" />
                      </div>
                      <input type="number" placeholder="Watt (Δt 50°)" value={newModel.watts || ''} onChange={e => setNewModel({...newModel, watts: Number(e.target.value)})} className="w-full border rounded-xl p-3 text-sm" />
                      <button onClick={handleAddCustomModel} className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold hover:bg-slate-800 shadow-lg">Aggiungi Modello</button>
                    </div>
                  </section>

                  {customModels.length > 0 && (
                    <section>
                      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex justify-between items-center">
                        <span>Database Personalizzato ({customModels.length})</span>
                        <button onClick={() => setCustomModels([])} className="text-[10px] text-red-500 font-black">RESET TUTTO</button>
                      </h3>
                      <div className="max-h-60 overflow-y-auto space-y-2 pr-2">
                        {customModels.map(m => (
                          <div key={m.id} className="flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs">
                            <div className="flex flex-col">
                              <span className="font-black text-slate-800">{m.brand} - {m.label}</span>
                              <span className="text-slate-500">{m.height}mm / {m.watts}W</span>
                            </div>
                            <button onClick={() => setCustomModels(prev => prev.filter(cm => cm.id !== m.id))} className="text-slate-300 hover:text-red-500 text-lg">✕</button>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          
          {/* Projects Sidebar (Sidebar-like list) */}
          <div className="lg:col-span-3 space-y-8">
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
               <div className="flex justify-between items-center mb-6">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">PROGETTI / CANTIERI</h3>
                <button onClick={addProject} className="bg-slate-900 text-white p-2 rounded-full hover:bg-slate-800 transition-colors shadow-md">
                   <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
                </button>
              </div>
              <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                {projects.map((p) => (
                  <div key={p.id} className="relative group">
                    <button 
                      onClick={() => { setActiveProjectId(p.id); setActiveEnvIndex(0); }}
                      className={`w-full text-left p-4 rounded-2xl transition-all duration-300 border ${activeProjectId === p.id ? 'bg-slate-900 border-slate-900 text-white shadow-xl' : 'bg-slate-50 border-slate-100 text-slate-600 hover:bg-slate-100 hover:border-slate-300'}`}
                    >
                      <p className="text-xs font-black uppercase opacity-60 mb-1">{p.clientSurname || 'Nuovo Progetto'}</p>
                      <p className="text-sm font-bold truncate">{p.siteAddress || 'Senza Indirizzo'}</p>
                      <div className={`mt-2 h-1 w-8 rounded-full ${activeProjectId === p.id ? 'bg-slate-400' : 'bg-slate-300 opacity-40'}`}></div>
                    </button>
                    {projects.length > 1 && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); removeProject(p.id); }} 
                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-white/20 hover:bg-red-500 hover:text-white p-1 rounded-full text-[10px]"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">AMBIENTI ({activeProject.environments.length})</h3>
                <button onClick={addEnvironment} className="text-[10px] bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-full font-black uppercase transition-colors">+ Aggiungi</button>
              </div>
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                {activeProject.environments.map((env, i) => (
                  <div key={env.id} className="flex gap-2">
                    <button 
                      onClick={() => setActiveEnvIndex(i)} 
                      className={`flex-1 text-left px-4 py-3 rounded-xl text-sm font-bold transition-all ${i === activeEnvIndex ? 'bg-slate-200 text-slate-900 border-l-4 border-slate-900' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}
                    >
                      {env.name}
                    </button>
                    {activeProject.environments.length > 1 && (
                      <button onClick={() => removeEnvironment(i)} className="p-2 text-slate-300 hover:text-red-500 transition-colors">✕</button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Main Editing Area */}
          <div className="lg:col-span-9 space-y-10">
            
            {/* Project Details Banner */}
            <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200">
               <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-6">Dati Committente e Ubicazione</h3>
               <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Nome Cliente</label>
                  <input value={activeProject.clientName} onChange={e => updateProjectDetails('clientName', e.target.value)} placeholder="Esempio: Marco" className="w-full bg-slate-50 border-transparent rounded-2xl p-4 text-sm font-bold text-slate-800 focus:bg-white focus:ring-2 ring-slate-200 outline-none transition-all" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Cognome Cliente</label>
                  <input value={activeProject.clientSurname} onChange={e => updateProjectDetails('clientSurname', e.target.value)} placeholder="Esempio: Rossi" className="w-full bg-slate-50 border-transparent rounded-2xl p-4 text-sm font-bold text-slate-800 focus:bg-white focus:ring-2 ring-slate-200 outline-none transition-all" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Indirizzo Cantiere</label>
                  <input value={activeProject.siteAddress} onChange={e => updateProjectDetails('siteAddress', e.target.value)} placeholder="Esempio: Via Roma 12, Milano" className="w-full bg-slate-50 border-transparent rounded-2xl p-4 text-sm font-bold text-slate-800 focus:bg-white focus:ring-2 ring-slate-200 outline-none transition-all" />
                </div>
               </div>
            </div>

            {/* Environment Detail Area */}
            <div className="bg-white p-10 rounded-[3rem] shadow-xl border border-slate-200">
               <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
                 <div className="flex-1">
                   <input 
                    value={activeEnv.name} 
                    onChange={e => handleEnvNameChange(e.target.value)} 
                    className="text-4xl font-bold text-slate-900 border-none bg-transparent focus:ring-0 outline-none w-full arch-title" 
                    placeholder="Nome Ambiente..."
                   />
                   <div className="h-1.5 w-24 bg-slate-900 rounded-full mt-2"></div>
                 </div>
                 <div className="flex items-center gap-4 bg-slate-900 p-6 rounded-3xl text-white shadow-2xl">
                    <div className="flex flex-col">
                      <span className="text-[10px] uppercase font-black tracking-widest text-slate-400">Fabbisogno Termico</span>
                      <span className="text-3xl font-light tracking-tighter">{Math.round(calculateWatts(activeEnv).watts)} <span className="text-sm font-black opacity-50 uppercase">Watt</span></span>
                    </div>
                    <div className="w-px h-10 bg-white/20 mx-2"></div>
                    <div className="flex flex-col text-right">
                       <span className="text-[10px] uppercase font-black tracking-widest text-slate-400">Volumetria</span>
                       <span className="text-sm font-bold">{calculateWatts(activeEnv).volume.toFixed(1)} m³</span>
                    </div>
                 </div>
               </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-16">
                
                {/* Inputs Section */}
                <div className="space-y-10">
                  <section>
                    <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest border-b pb-4 mb-6 flex items-center">
                       <span className="mr-2">📐</span> Dimensionamento Ambiente
                    </h4>
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-tight">Superficie (m²)</label>
                        <input type="number" value={activeEnv.specs.surface || ''} onChange={e => handleSpecChange('surface', Number(e.target.value))} className="w-full bg-slate-50 border-none rounded-2xl p-4 font-bold text-slate-800 focus:bg-white focus:ring-2 ring-slate-200 outline-none" />
                      </div>
                      <div className="space-y-2">
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-tight">Altezza (m)</label>
                        <input type="number" step="0.1" value={activeEnv.specs.height || ''} onChange={e => handleSpecChange('height', Number(e.target.value))} className="w-full bg-slate-50 border-none rounded-2xl p-4 font-bold text-slate-800 focus:bg-white focus:ring-2 ring-slate-200 outline-none" />
                      </div>
                    </div>
                  </section>

                  <section>
                    <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest border-b pb-4 mb-6 flex items-center">
                       <span className="mr-2">🖼️</span> Ingombro Nicchia
                    </h4>
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-tight">Altezza Nicchia (mm)</label>
                        <input type="number" value={activeEnv.specs.nicheHeight || ''} onChange={e => handleSpecChange('nicheHeight', Number(e.target.value))} className="w-full bg-slate-50 border-none rounded-2xl p-4 font-bold text-slate-800 focus:bg-white focus:ring-2 ring-slate-200 outline-none" />
                      </div>
                      <div className="space-y-2">
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-tight">Larghezza Nicchia (mm)</label>
                        <input type="number" value={activeEnv.specs.nicheWidth || ''} onChange={e => handleSpecChange('nicheWidth', Number(e.target.value))} className="w-full bg-slate-50 border-none rounded-2xl p-4 font-bold text-slate-800 focus:bg-white focus:ring-2 ring-slate-200 outline-none" />
                      </div>
                      <div className="space-y-2">
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-tight">Altezza Valvola (mm)</label>
                        <input type="number" value={activeEnv.specs.valveHeight || ''} onChange={e => handleSpecChange('valveHeight', Number(e.target.value))} className="w-full bg-slate-50 border-none rounded-2xl p-4 font-bold text-slate-800 focus:bg-white focus:ring-2 ring-slate-200 outline-none" />
                      </div>
                    </div>
                  </section>

                  <section>
                    <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest border-b pb-4 mb-6 flex items-center">
                       <span className="mr-2">🔧</span> Configurazione Tecnica
                    </h4>
                    <div className="grid grid-cols-2 gap-6">
                      <div className="col-span-2 space-y-2">
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-tight">Gamma Prodotto</label>
                        <select value={activeEnv.specs.series} onChange={e => handleSpecChange('series', e.target.value as RadiatorSeries)} className="w-full bg-slate-50 border-none rounded-2xl p-4 font-bold text-slate-800 focus:bg-white focus:ring-2 ring-slate-200 outline-none appearance-none">
                          <option value={RadiatorSeries.TESI2}>Irsap Tesi 2</option>
                          <option value={RadiatorSeries.TESI3}>Irsap Tesi 3</option>
                          <option value={RadiatorSeries.TESI4}>Irsap Tesi 4</option>
                          <option value={RadiatorSeries.CUSTOM}>Database Personalizzato ({customModels.length})</option>
                        </select>
                      </div>
                      <div className="col-span-2 space-y-2">
                         <label className="block text-[10px] font-black text-slate-400 uppercase tracking-tight">Posizione Valvole</label>
                         <select value={activeEnv.specs.valvePosition} onChange={e => handleSpecChange('valvePosition', e.target.value as ValvePosition)} className="w-full bg-slate-50 border-none rounded-2xl p-4 font-bold text-slate-800 focus:bg-white focus:ring-2 ring-slate-200 outline-none appearance-none">
                          <option value={ValvePosition.BOTTOM}>Basse (Lati Opposti)</option>
                          <option value={ValvePosition.RIGHT}>Destra Verticale (Alto/Basso)</option>
                          <option value={ValvePosition.LEFT}>Sinistra Verticale (Alto/Basso)</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-tight">Interasse (mm)</label>
                        <input type="number" value={activeEnv.specs.valveCenterDistance || ''} onChange={e => handleSpecChange('valveCenterDistance', Number(e.target.value))} className="w-full bg-slate-50 border-none rounded-2xl p-4 font-bold text-slate-800 focus:bg-white focus:ring-2 ring-slate-200 outline-none" />
                        {matchedModelData.eccentricText && <p className="text-[9px] text-red-500 font-black uppercase mt-2 leading-tight">{matchedModelData.eccentricText}</p>}
                      </div>
                      <div className="space-y-2">
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-tight">Ingombro Max (mm)</label>
                        <input type="number" value={activeEnv.specs.maxWidth || ''} onChange={e => handleSpecChange('maxWidth', Number(e.target.value))} className="w-full bg-slate-50 border-none rounded-2xl p-4 font-bold text-slate-800 focus:bg-white focus:ring-2 ring-slate-200 outline-none" />
                      </div>
                      <div className="col-span-2 bg-slate-50 p-4 rounded-2xl border border-slate-200 flex items-center gap-4">
                        <input 
                          type="checkbox" 
                          id="hasDiaphragm" 
                          className="w-5 h-5 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                          checked={activeEnv.specs.hasDiaphragm} 
                          onChange={e => handleSpecChange('hasDiaphragm', e.target.checked)} 
                        />
                        <label htmlFor="hasDiaphragm" className="text-xs font-black text-slate-800 uppercase cursor-pointer select-none">Applica Diaframma Interno</label>
                      </div>
                    </div>
                  </section>

                  <section className="bg-slate-900 p-8 rounded-[2rem] text-white shadow-2xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-10 opacity-10 group-hover:scale-110 transition-transform duration-700">
                      <svg className="w-32 h-32" fill="currentColor" viewBox="0 0 24 24"><path d="M7 2v11h3v9l7-12h-4l4-8z"/></svg>
                    </div>
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-6">Configurazione Ottimale</h4>
                    <div className="grid grid-cols-2 gap-8 relative z-10">
                      <div>
                        <span className="block text-[9px] font-bold text-white/50 uppercase tracking-widest mb-1">Modello / Altezza</span>
                        <span className="text-lg font-bold block">{matchedModelData.model.label} <span className="text-xs opacity-60">/ H {matchedModelData.model.height}mm</span></span>
                      </div>
                      <div>
                        <span className="block text-[9px] font-bold text-white/50 uppercase tracking-widest mb-1">Interasse Reale</span>
                        <span className="text-lg font-bold block">{matchedModelData.model.interaxis}mm</span>
                      </div>
                      <div>
                         <span className="block text-[9px] font-bold text-white/50 uppercase tracking-widest mb-1">Nr. Elementi</span>
                         <input 
                          type="number" 
                          value={matchedModelData.currentElements || ''} 
                          onChange={e => handleManualElementsChange(Number(e.target.value))} 
                          className="bg-white/10 border-none rounded-lg px-3 py-1 text-lg font-black w-24 focus:ring-2 ring-white/50"
                        />
                      </div>
                      <div className={matchedModelData.totalLength > activeEnv.specs.maxWidth && activeEnv.specs.maxWidth > 0 ? 'text-red-400 animate-pulse' : ''}>
                        <span className="block text-[9px] font-bold text-white/50 uppercase tracking-widest mb-1">Ingombro Totale</span>
                        <span className="text-2xl font-black">{matchedModelData.totalLength}mm</span>
                      </div>
                    </div>
                  </section>
                </div>

                {/* Visualizer & More Section */}
                <div className="space-y-10">
                   <RadiatorVisualizer 
                    specs={activeEnv.specs} 
                    calculatedWidth={matchedModelData.totalLength}
                    realWatts={matchedModelData.totalWatts}
                    requiredWatts={matchedModelData.requiredWatts}
                  />

                  <section className="bg-white p-8 rounded-3xl border border-slate-200 shadow-inner">
                    <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-6">Specifiche Impianto</h4>
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase">Diametro Tubo</label>
                        <select value={activeEnv.specs.pipeDiameter} onChange={e => handleSpecChange('pipeDiameter', e.target.value)} className="w-full bg-slate-100 border-none rounded-xl p-3 text-sm font-bold text-slate-800">
                          {PIPE_DIAMETERS.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase">Materiale Tubo</label>
                        <select value={activeEnv.specs.pipeMaterial} onChange={e => handleSpecChange('pipeMaterial', e.target.value)} className="w-full bg-slate-100 border-none rounded-xl p-3 text-sm font-bold text-slate-800">
                          {PIPE_MATERIALS.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </div>
                    </div>
                  </section>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Unified Project Summary Table */}
        <div className="no-print mt-20 bg-white p-12 rounded-[3rem] shadow-2xl border border-slate-200">
           <div className="flex items-center gap-4 mb-10">
             <div className="w-14 h-14 bg-slate-900 rounded-3xl flex items-center justify-center text-white text-2xl shadow-xl">📊</div>
             <div className="flex flex-col">
                <h3 className="arch-title text-3xl font-bold text-slate-900">Riepilogo Progetto Corrente</h3>
                <p className="text-sm text-slate-500 font-medium">Tabella tecnica di sintesi per ordini e verifiche termiche.</p>
             </div>
          </div>
          <div className="overflow-x-auto rounded-3xl border border-slate-100">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="bg-slate-900 text-white">
                  <th className="px-6 py-5 font-black uppercase text-[10px] tracking-widest">Ambiente</th>
                  <th className="px-6 py-5 font-black uppercase text-[10px] tracking-widest">Gamma / Marchio</th>
                  <th className="px-6 py-5 font-black uppercase text-[10px] tracking-widest">Modello</th>
                  <th className="px-6 py-5 font-black uppercase text-[10px] tracking-widest">Elementi</th>
                  <th className="px-6 py-5 font-black uppercase text-[10px] tracking-widest">Lunghezza</th>
                  <th className="px-6 py-5 font-black uppercase text-[10px] tracking-widest">Diaframma</th>
                  <th className="px-6 py-5 font-black uppercase text-[10px] tracking-widest">Tubo</th>
                  <th className="px-6 py-5 font-black uppercase text-[10px] tracking-widest">Potenza</th>
                </tr>
              </thead>
              <tbody>
                {activeProject.environments.map((env, i) => {
                  const data = getEnvRadiatorData(env);
                  return (
                    <tr key={env.id} className={`border-b ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50'} hover:bg-slate-100 transition-colors`}>
                      <td className="px-6 py-6 font-black text-slate-900">{env.name}</td>
                      <td className="px-6 py-6 text-slate-600 font-bold">
                        {data.series === RadiatorSeries.CUSTOM ? (data.model.brand || 'Personalizzato') : data.series}
                      </td>
                      <td className="px-6 py-6 text-slate-600">{data.model.label} <span className="text-[10px] opacity-60">/ H {data.model.height}mm</span></td>
                      <td className="px-6 py-6 font-black text-slate-900 text-center">{data.currentElements}</td>
                      <td className="px-6 py-6 text-slate-600 font-mono font-bold">{data.totalLength}mm</td>
                      <td className="px-6 py-6">
                        {env.specs.hasDiaphragm ? (
                          <span className="text-red-600 font-black text-[10px] bg-red-50 px-3 py-1 rounded-full border border-red-100">SI</span>
                        ) : (
                          <span className="text-slate-400 font-bold text-[10px]">NO</span>
                        )}
                      </td>
                      <td className="px-6 py-6 text-slate-600 text-[10px] leading-tight font-medium">
                        {env.specs.pipeMaterial}<br/>{env.specs.pipeDiameter}
                      </td>
                      <td className="px-6 py-6 font-black text-slate-900 whitespace-nowrap">{data.totalWatts} <span className="text-[9px] opacity-40">Watt</span></td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-900 text-white font-black">
                   <td colSpan={7} className="px-6 py-6 text-right uppercase text-[10px] tracking-[0.2em] opacity-60">Potenza Totale Installata</td>
                   <td className="px-6 py-6 text-xl tracking-tighter">
                    {activeProject.environments.reduce((acc, env) => acc + getEnvRadiatorData(env).totalWatts, 0)} <span className="text-xs">Watt</span>
                   </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>

      {/* Printing Document Section */}
      <div className="hidden print:block bg-white text-black">
        {activeProject.environments.map((env, index) => {
          const wattsReq = calculateWatts(env).watts;
          const data = getEnvRadiatorData(env);
          
          return (
            <div key={env.id} className="p-16 min-h-screen relative flex flex-col" style={{ pageBreakAfter: 'always' }}>
              <div className="bg-slate-100 p-10 rounded-[2rem] mb-12 flex justify-between items-center border border-slate-200">
                <div>
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-2">Scheda Tecnica Commessa</h4>
                  <p className="text-3xl font-black text-slate-900">{activeProject.clientName} {activeProject.clientSurname}</p>
                  <p className="text-sm font-bold text-slate-500 mt-1">{activeProject.siteAddress || 'Sito non specificato'}</p>
                </div>
                <div className="text-right">
                  <h1 className="arch-title text-2xl font-black text-slate-900">HeatMaster</h1>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Documento Progetto #{activeProjectId.substr(0,5)}</p>
                </div>
              </div>

              <h3 className="arch-title text-5xl font-black text-slate-900 mb-12 border-b-8 border-slate-900 pb-4 inline-block">{env.name}</h3>

              <div className="grid grid-cols-2 gap-20 flex-1 items-start">
                <div className="space-y-12">
                  <section className="bg-slate-900 p-10 rounded-[2.5rem] text-white shadow-2xl">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Fabbisogno Calcolato (K={settings.wattCoefficient})</h4>
                    <div className="flex items-baseline space-x-3">
                      <span className="text-7xl font-light tracking-tighter">{Math.round(wattsReq)}</span>
                      <span className="text-2xl font-black text-slate-400 uppercase">Watt</span>
                    </div>
                  </section>

                  <section className="border-4 border-slate-100 rounded-[2.5rem] p-10 bg-white space-y-10">
                    <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-widest border-b pb-4">DATI TECNICI CALORIFERO</h4>
                    <div className="grid grid-cols-2 gap-10">
                      <div className="space-y-1">
                        <span className="block text-[10px] font-black text-slate-400 uppercase">Gamma / Marchio</span>
                        <span className="text-xl font-black text-slate-800">{data.series === RadiatorSeries.CUSTOM ? (data.model.brand || 'Custom') : data.series}</span>
                      </div>
                      <div className="space-y-1">
                        <span className="block text-[10px] font-black text-slate-400 uppercase">Modello / Altezza</span>
                        <span className="text-xl font-black text-slate-800">{data.model.label} <span className="text-sm opacity-40">({data.model.height}mm)</span></span>
                      </div>
                      <div className="space-y-1">
                        <span className="block text-[10px] font-black text-slate-400 uppercase">Interasse Reale</span>
                        <span className="text-xl font-black text-slate-800">{data.model.interaxis} mm</span>
                      </div>
                      <div className="space-y-1">
                        <span className="block text-[10px] font-black text-slate-400 uppercase">Nr. Elementi</span>
                        <span className="text-xl font-black text-slate-800">{data.currentElements} unità</span>
                      </div>
                      <div className="space-y-1">
                        <span className="block text-[10px] font-black text-slate-400 uppercase">Ingombro Totale</span>
                        <span className={`text-xl font-black ${data.totalLength > env.specs.maxWidth && env.specs.maxWidth > 0 ? 'text-red-600' : 'text-slate-800'}`}>{data.totalLength} mm</span>
                      </div>
                      <div className="space-y-1">
                        <span className="block text-[10px] font-black text-slate-400 uppercase">Diaframma</span>
                        <span className="text-xl font-black text-slate-800">{env.specs.hasDiaphragm ? 'PRESENTE' : 'ASSENTE'}</span>
                      </div>
                      <div className="space-y-1">
                         <span className="block text-[10px] font-black text-slate-400 uppercase">Ingombro Nicchia</span>
                         <span className="text-xl font-black text-slate-800">{env.specs.nicheWidth} x {env.specs.nicheHeight} mm</span>
                      </div>
                      <div className="space-y-1">
                         <span className="block text-[10px] font-black text-slate-400 uppercase">Altezza Valvola</span>
                         <span className="text-xl font-black text-slate-800">{env.specs.valveHeight} mm</span>
                      </div>
                      <div className="col-span-1 pt-6 border-t border-slate-100">
                        <span className="block text-[10px] font-black text-slate-400 uppercase mb-2">Caratteristiche Tubazioni</span>
                        <span className="text-lg font-bold text-slate-700">{env.specs.pipeMaterial} — {env.specs.pipeDiameter}</span>
                      </div>
                    </div>
                  </section>
                </div>

                <div className="flex flex-col items-center justify-center pt-20">
                    <RadiatorVisualizer 
                      specs={env.specs} 
                      calculatedWidth={data.totalLength}
                      realWatts={data.totalWatts}
                      requiredWatts={data.requiredWatts}
                    />
                </div>
              </div>

              <footer className="mt-auto pt-16 border-t-2 border-slate-100 flex justify-between items-end">
                 <div className="w-1/2">
                   <div className="h-0.5 bg-slate-900 mb-4 w-64"></div>
                   <p className="text-[10px] uppercase font-black text-slate-900 tracking-widest">Firma del Progettista / Incaricato</p>
                 </div>
                 <div className="text-right">
                   <p className="text-[10px] text-slate-300 font-bold uppercase tracking-[0.3em]">ArchQuote Professional v3.0 — Pag. {index + 1}</p>
                 </div>
              </footer>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default App;
