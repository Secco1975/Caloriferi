
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { ValvePosition, RadiatorSpecs, CalculationResult, Environment, ProjectDetails, RadiatorModel, RadiatorSeries } from './types';
import { INITIAL_SPECS, INITIAL_PROJECT, PIPE_DIAMETERS, PIPE_MATERIALS } from './constants';
import { TESI2_MODELS, TESI3_MODELS, TESI4_MODELS } from './radiatorData';
import { RadiatorVisualizer } from './components/RadiatorVisualizer';
import { GoogleGenAI, Type } from "@google/genai";

const App: React.FC = () => {
  const loadState = <T,>(key: string, defaultValue: T): T => {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : defaultValue;
  };

  const [project, setProject] = useState<ProjectDetails>(() => loadState('archquote_project', INITIAL_PROJECT));
  const [environments, setEnvironments] = useState<Environment[]>(() => loadState('archquote_envs', [
    { id: '1', name: 'Soggiorno', specs: { ...INITIAL_SPECS } }
  ]));
  const [customModels, setCustomModels] = useState<RadiatorModel[]>(() => loadState('archquote_custom_models', []));
  const [activeIndex, setActiveIndex] = useState(0);
  const [showAddModel, setShowAddModel] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);

  // Manual model state
  const [newModel, setNewModel] = useState<RadiatorModel>({
    label: '',
    code: '',
    height: 0,
    interaxis: 0,
    watts: 0
  });

  useEffect(() => {
    localStorage.setItem('archquote_project', JSON.stringify(project));
    localStorage.setItem('archquote_envs', JSON.stringify(environments));
    localStorage.setItem('archquote_custom_models', JSON.stringify(customModels));
  }, [project, environments, customModels]);

  const activeEnv = environments[activeIndex] || environments[0];

  const calculateWatts = useCallback((env: Environment): CalculationResult => {
    const volume = (env.specs.surface || 0) * (env.specs.height || 0);
    const watts = (volume * 30) / 0.86;
    return { volume, watts };
  }, []);

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

  const handleSpecChange = useCallback((field: keyof RadiatorSpecs, value: any) => {
    setEnvironments(prev => prev.map((env, i) => {
      if (i !== activeIndex) return env;
      const updatedSpecs = { ...env.specs, [field]: value };
      if (['surface', 'height', 'valveCenterDistance', 'series'].includes(field)) {
        updatedSpecs.manualElements = undefined;
      }
      return { ...env, specs: updatedSpecs };
    }));
  }, [activeIndex]);

  const handleManualElementsChange = useCallback((val: number) => {
    setEnvironments(prev => prev.map((env, i) => {
      if (i !== activeIndex) return env;
      return { ...env, specs: { ...env.specs, manualElements: val } };
    }));
  }, [activeIndex]);

  const handleEnvNameChange = useCallback((name: string) => {
    setEnvironments(prev => prev.map((env, i) => {
      if (i !== activeIndex) return env;
      return { ...env, name };
    }));
  }, [activeIndex]);

  const addEnvironment = useCallback(() => {
    const newEnv: Environment = {
      id: Math.random().toString(36).substr(2, 9),
      name: `Ambiente ${environments.length + 1}`,
      specs: { ...INITIAL_SPECS }
    };
    setEnvironments([...environments, newEnv]);
    setActiveIndex(environments.length);
  }, [environments]);

  const removeEnvironment = useCallback((index: number) => {
    if (environments.length <= 1) return;
    const newEnvs = environments.filter((_, i) => i !== index);
    setEnvironments(newEnvs);
    setActiveIndex(Math.max(0, index - 1));
  }, [environments]);

  const handleAddCustomModel = useCallback(() => {
    if (!newModel.label || !newModel.height) return;
    const modelToAdd = { ...newModel, id: Math.random().toString(36).substr(2, 9) };
    setCustomModels(prev => [...prev, modelToAdd]);
    setNewModel({ label: '', code: '', height: 0, interaxis: 0, watts: 0 });
    setShowAddModel(false);
  }, [newModel]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

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
              { text: "Extract all radiator technical data from this image/document. Return a JSON array of objects with keys: 'label' (model height name like 200, 300), 'code' (full model code), 'height' (numeric, mm), 'interaxis' (numeric, mm), 'watts' (numeric, Watt at DeltaT 50). Ensure numbers are strictly numeric." }
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
        const modelsWithIds = extracted.map((m: any) => ({ ...m, id: Math.random().toString(36).substr(2, 9) }));
        setCustomModels(prev => [...prev, ...modelsWithIds]);
        setIsExtracting(false);
        setShowAddModel(false);
        alert(`${modelsWithIds.length} modelli estratti con successo!`);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error(error);
      setIsExtracting(false);
      alert("Errore durante l'estrazione dei dati. Riprova con un'immagine più chiara.");
    }
  };

  return (
    <div className="min-h-screen pb-20 bg-slate-100 font-sans">
      <div className="no-print max-w-6xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="arch-title text-3xl font-bold text-slate-800 tracking-tight">HeatMaster <span className="text-slate-400">ArchQuote</span></h1>
          <div className="flex gap-3">
            <button 
              onClick={() => setShowAddModel(true)}
              className="bg-emerald-600 text-white px-5 py-2 rounded-full font-medium hover:bg-emerald-700 transition-colors flex items-center shadow-lg"
            >
              <span className="mr-2">➕</span> Nuovi Modelli
            </button>
            <button 
              onClick={() => window.print()}
              className="bg-slate-800 text-white px-6 py-2 rounded-full font-medium hover:bg-slate-700 transition-colors flex items-center shadow-lg"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Stampa Progetto Completo
            </button>
          </div>
        </div>

        {showAddModel && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl p-8 max-w-2xl w-full shadow-2xl animate-in zoom-in duration-200">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-slate-800">Aggiungi Modelli alla Gamma</h2>
                  <p className="text-sm text-slate-500">Inserimento manuale o tramite analisi AI di documenti tecnici.</p>
                </div>
                <button onClick={() => setShowAddModel(false)} className="text-slate-400 hover:text-slate-600">✕</button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4 border-r pr-8">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Inserimento Manuale</h3>
                  <div className="space-y-3">
                    <input placeholder="Modello (es. 600)" value={newModel.label} onChange={e => setNewModel({...newModel, label: e.target.value})} className="w-full border rounded p-2 text-sm" />
                    <input placeholder="Codice Tecnico" value={newModel.code} onChange={e => setNewModel({...newModel, code: e.target.value})} className="w-full border rounded p-2 text-sm" />
                    <div className="grid grid-cols-2 gap-2">
                      <input type="number" placeholder="Altezza (mm)" value={newModel.height || ''} onChange={e => setNewModel({...newModel, height: Number(e.target.value)})} className="border rounded p-2 text-sm" />
                      <input type="number" placeholder="Interasse (mm)" value={newModel.interaxis || ''} onChange={e => setNewModel({...newModel, interaxis: Number(e.target.value)})} className="border rounded p-2 text-sm" />
                    </div>
                    <input type="number" placeholder="Watt (Δt 50°)" value={newModel.watts || ''} onChange={e => setNewModel({...newModel, watts: Number(e.target.value)})} className="w-full border rounded p-2 text-sm" />
                    <button onClick={handleAddCustomModel} className="w-full bg-slate-800 text-white py-2 rounded font-bold hover:bg-slate-700">Aggiungi Singolo Modello</button>
                  </div>
                </div>

                <div className="space-y-4 flex flex-col justify-center items-center text-center">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Estrazione Automatica AI</h3>
                  <div className={`w-full border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center transition-all ${isExtracting ? 'bg-slate-50 border-emerald-400' : 'border-slate-200 hover:border-emerald-400'}`}>
                    {isExtracting ? (
                      <div className="space-y-4">
                        <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                        <p className="text-sm font-bold text-emerald-600">Analisi Documento in corso...</p>
                      </div>
                    ) : (
                      <>
                        <span className="text-4xl mb-2">📄</span>
                        <p className="text-sm font-medium text-slate-600 mb-4">Carica immagine (JPEG/PNG) o PDF del catalogo tecnico</p>
                        <input type="file" id="ai-upload" className="hidden" accept="image/*,application/pdf" onChange={handleFileUpload} />
                        <label htmlFor="ai-upload" className="bg-emerald-100 text-emerald-700 px-4 py-2 rounded font-bold cursor-pointer hover:bg-emerald-200">Scegli File</label>
                      </>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-400 italic">L'AI riconoscerà automaticamente codici, altezze, interassi e watt.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Dettagli Cliente & Cantiere</h3>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  <input placeholder="Nome" value={project.clientName} onChange={e => setProject({...project, clientName: e.target.value})} className="border rounded p-2 text-sm" />
                  <input placeholder="Cognome" value={project.clientSurname} onChange={e => setProject({...project, clientSurname: e.target.value})} className="border rounded p-2 text-sm" />
                </div>
                <input placeholder="Indirizzo Cantiere" value={project.siteAddress} onChange={e => setProject({...project, siteAddress: e.target.value})} className="w-full border rounded p-2 text-sm" />
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Ambienti ({environments.length})</h3>
                <button onClick={addEnvironment} className="text-xs bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded font-bold">+ Aggiungi</button>
              </div>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {environments.map((env, i) => (
                  <div key={env.id} className="flex gap-2">
                    <button onClick={() => setActiveIndex(i)} className={`flex-1 text-left px-3 py-2 rounded text-sm font-medium transition-all ${i === activeIndex ? 'bg-slate-800 text-white shadow-md' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}>{env.name}</button>
                    {environments.length > 1 && (
                      <button onClick={() => removeEnvironment(i)} className="p-2 text-slate-300 hover:text-red-500 transition-colors">✕</button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {customModels.length > 0 && (
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Modelli Personalizzati</h3>
                  <button onClick={() => setCustomModels([])} className="text-[10px] text-red-500 font-bold uppercase">Svuota tutto</button>
                </div>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {customModels.map(m => (
                    <div key={m.id} className="flex justify-between items-center bg-slate-50 p-2 rounded text-xs border border-slate-100">
                      <span className="font-bold text-slate-700">{m.label} ({m.watts}W)</span>
                      <button onClick={() => setCustomModels(prev => prev.filter(cm => cm.id !== m.id))} className="text-slate-300 hover:text-red-500">✕</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="lg:col-span-2 space-y-8 bg-white p-8 rounded-xl shadow-sm border border-slate-200">
            <input value={activeEnv.name} onChange={e => handleEnvNameChange(e.target.value)} className="text-2xl font-bold text-slate-800 border-b-2 border-slate-100 focus:border-slate-800 outline-none w-full mb-6" />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-6">
                <section>
                  <h4 className="text-xs font-bold text-slate-800 uppercase border-l-4 border-slate-800 pl-2 mb-4">Calcolo Termico</h4>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Superficie (m²)</label>
                      <input type="number" value={activeEnv.specs.surface || ''} onChange={e => handleSpecChange('surface', Number(e.target.value))} className="w-full border rounded p-2" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Altezza (m)</label>
                      <input type="number" step="0.1" value={activeEnv.specs.height || ''} onChange={e => handleSpecChange('height', Number(e.target.value))} className="w-full border rounded p-2" />
                    </div>
                  </div>
                  <div className="bg-slate-900 p-4 rounded text-white flex justify-between items-center shadow-lg">
                    <span className="text-[10px] uppercase font-bold text-slate-400">Fabbisogno:</span>
                    <span className="text-2xl font-light tracking-tighter">{Math.round(calculateWatts(activeEnv).watts)} WATT</span>
                  </div>
                </section>

                <section>
                  <h4 className="text-xs font-bold text-slate-800 uppercase border-l-4 border-slate-800 pl-2 mb-4">Dati Tecnici</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                       <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Gamma Modelli</label>
                       <select value={activeEnv.specs.series} onChange={e => handleSpecChange('series', e.target.value as RadiatorSeries)} className="w-full border rounded p-2 bg-white font-bold text-slate-800 mb-4">
                        <option value={RadiatorSeries.TESI2}>TESI 2</option>
                        <option value={RadiatorSeries.TESI3}>TESI 3</option>
                        <option value={RadiatorSeries.TESI4}>TESI 4</option>
                        <option value={RadiatorSeries.CUSTOM}>Gamma Personalizzata ({customModels.length})</option>
                      </select>
                    </div>
                    <div className="col-span-2">
                       <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Posizione Valvole</label>
                       <select value={activeEnv.specs.valvePosition} onChange={e => handleSpecChange('valvePosition', e.target.value as ValvePosition)} className="w-full border rounded p-2 bg-white">
                        <option value={ValvePosition.BOTTOM}>Basse (DX+SX)</option>
                        <option value={ValvePosition.RIGHT}>Destra (Alto/Basso)</option>
                        <option value={ValvePosition.LEFT}>Sinistra (Alto/Basso)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Interasse Inserito (mm)</label>
                      <input type="number" value={activeEnv.specs.valveCenterDistance || ''} onChange={e => handleSpecChange('valveCenterDistance', Number(e.target.value))} className="w-full border rounded p-2" />
                      {matchedModelData.eccentricText && <p className="text-[10px] text-red-500 font-bold mt-1 uppercase leading-tight">{matchedModelData.eccentricText}</p>}
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1 text-nowrap">Dim. max. ammiss. (MM)</label>
                      <input type="number" value={activeEnv.specs.maxWidth || ''} onChange={e => handleSpecChange('maxWidth', Number(e.target.value))} className="w-full border rounded p-2" />
                    </div>
                    
                    <div className="col-span-2 bg-slate-50 p-3 rounded border border-dashed border-slate-300">
                      <div className="flex items-center gap-3">
                        <input 
                          type="checkbox" 
                          id="hasDiaphragm" 
                          className="w-4 h-4"
                          checked={activeEnv.specs.hasDiaphragm} 
                          onChange={e => handleSpecChange('hasDiaphragm', e.target.checked)} 
                        />
                        <label htmlFor="hasDiaphragm" className="text-[10px] font-bold text-slate-800 uppercase cursor-pointer">Inserire Diaframma Interno</label>
                      </div>
                    </div>
                  </div>
                </section>

                <section>
                  <h4 className="text-xs font-bold text-slate-800 uppercase border-l-4 border-slate-800 pl-2 mb-4">Dimensioni Nicchia</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Altezza Nicchia (mm)</label>
                      <input type="number" value={activeEnv.specs.nicheHeight || ''} onChange={e => handleSpecChange('nicheHeight', Number(e.target.value))} className="w-full border rounded p-2" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Larghezza Nicchia (mm)</label>
                      <input type="number" value={activeEnv.specs.nicheWidth || ''} onChange={e => handleSpecChange('nicheWidth', Number(e.target.value))} className="w-full border rounded p-2" />
                    </div>
                  </div>
                </section>

                <section className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                  <h4 className="text-[10px] font-bold text-slate-800 uppercase tracking-widest mb-4">Dimensioni Calorifero ({matchedModelData.series})</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white p-2 rounded shadow-sm border border-slate-100">
                      <span className="block text-[9px] font-bold text-slate-400 uppercase">Modello / Altezza</span>
                      <span className="text-sm font-bold text-slate-700">{matchedModelData.model.label} / H {matchedModelData.model.height}mm</span>
                    </div>
                    <div className="bg-white p-2 rounded shadow-sm border border-slate-100">
                      <span className="block text-[9px] font-bold text-slate-400 uppercase">Interasse Reale</span>
                      <span className="text-sm font-bold text-slate-700">H' {matchedModelData.model.interaxis}mm</span>
                    </div>
                    <div className="bg-white p-2 rounded shadow-sm border border-slate-100">
                      <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Numero Elementi</label>
                      <input 
                        type="number" 
                        value={matchedModelData.currentElements || ''} 
                        onChange={e => handleManualElementsChange(Number(e.target.value))} 
                        className="w-full text-sm font-bold text-slate-700 border-b border-slate-300 focus:border-slate-800 outline-none"
                      />
                    </div>
                    <div className={`p-2 rounded shadow-sm border ${matchedModelData.totalLength > activeEnv.specs.maxWidth ? 'bg-red-50 border-red-200' : 'bg-white border-slate-100'}`}>
                      <span className="block text-[9px] font-bold text-slate-400 uppercase">Lunghezza Totale</span>
                      <span className={`text-sm font-bold ${matchedModelData.totalLength > activeEnv.specs.maxWidth ? 'text-red-600' : 'text-slate-700'}`}>
                        {matchedModelData.totalLength}mm
                      </span>
                    </div>
                  </div>
                </section>
              </div>
              <div className="space-y-8 sticky top-8">
                <RadiatorVisualizer 
                  specs={activeEnv.specs} 
                  calculatedWidth={matchedModelData.totalLength}
                  realWatts={matchedModelData.totalWatts}
                  requiredWatts={matchedModelData.requiredWatts}
                />

                <section className="bg-white p-6 rounded-2xl border border-slate-200 w-full shadow-sm no-print">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-widest border-b pb-2 mb-4">Caratteristiche Impianto</h4>
                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Diametro Tubo</label>
                      <select 
                        value={activeEnv.specs.pipeDiameter} 
                        onChange={e => handleSpecChange('pipeDiameter', e.target.value)} 
                        className="w-full border rounded p-2 bg-slate-50 text-sm font-medium"
                      >
                        {PIPE_DIAMETERS.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Materiale Tubo</label>
                      <select 
                        value={activeEnv.specs.pipeMaterial} 
                        onChange={e => handleSpecChange('pipeMaterial', e.target.value)} 
                        className="w-full border rounded p-2 bg-slate-50 text-sm font-medium"
                      >
                        {PIPE_MATERIALS.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                  </div>
                </section>
              </div>
            </div>
          </div>
        </div>

        {/* Web Preview Summary Table */}
        <div className="no-print max-w-6xl mx-auto px-4 mt-12 mb-10 bg-white p-8 rounded-xl shadow-lg border border-slate-200">
          <div className="flex items-center gap-3 mb-6">
             <div className="w-10 h-10 bg-slate-900 rounded-lg flex items-center justify-center text-white text-xl">📊</div>
             <h3 className="arch-title text-2xl font-bold text-slate-800">Tabella di Riepilogo Progetto</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="bg-slate-900 text-white">
                  <th className="px-5 py-3 font-bold uppercase text-[10px] rounded-tl-lg">Ambiente</th>
                  <th className="px-5 py-3 font-bold uppercase text-[10px]">Gamma</th>
                  <th className="px-5 py-3 font-bold uppercase text-[10px]">Modello</th>
                  <th className="px-5 py-3 font-bold uppercase text-[10px]">Elementi</th>
                  <th className="px-5 py-3 font-bold uppercase text-[10px]">Lunghezza</th>
                  <th className="px-5 py-3 font-bold uppercase text-[10px]">Diaframma</th>
                  <th className="px-5 py-3 font-bold uppercase text-[10px]">Diametro Tubo</th>
                  <th className="px-5 py-3 font-bold uppercase text-[10px]">Materiale</th>
                  <th className="px-5 py-3 font-bold uppercase text-[10px] rounded-tr-lg">Watt Totali</th>
                </tr>
              </thead>
              <tbody>
                {environments.map((env, i) => {
                  const data = getEnvRadiatorData(env);
                  return (
                    <tr key={env.id} className={`border-b ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50'} hover:bg-slate-100 transition-colors`}>
                      <td className="px-5 py-4 font-bold text-slate-800">{env.name}</td>
                      <td className="px-5 py-4 text-slate-600 font-bold">{data.series}</td>
                      <td className="px-5 py-4 text-slate-600">{data.model.label} / {data.model.height}mm</td>
                      <td className="px-5 py-4 font-bold text-slate-800 text-center">{data.currentElements}</td>
                      <td className="px-5 py-4 text-slate-600 font-mono">{data.totalLength}mm</td>
                      <td className="px-5 py-4">
                        {env.specs.hasDiaphragm ? (
                          <span className="text-red-600 font-bold">SI</span>
                        ) : (
                          <span className="text-slate-400">NO</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-slate-600">{env.specs.pipeDiameter}</td>
                      <td className="px-5 py-4 text-slate-600">{env.specs.pipeMaterial}</td>
                      <td className="px-5 py-4 font-black text-slate-900">{data.totalWatts} W</td>
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
        {environments.map((env, index) => {
          const wattsReq = calculateWatts(env).watts;
          const data = getEnvRadiatorData(env);
          
          return (
            <div key={env.id} className="p-12 min-h-screen relative flex flex-col" style={{ pageBreakAfter: 'always' }}>
              <div className="bg-slate-50 p-6 rounded-lg mb-8 border border-slate-100 flex justify-between items-center">
                <div>
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Cliente</h4>
                  <p className="text-xl font-bold text-slate-800">{project.clientName} {project.clientSurname}</p>
                </div>
                <div className="text-right">
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Cantiere</h4>
                  <p className="text-sm text-slate-600">{project.siteAddress || '---'}</p>
                </div>
              </div>

              <h3 className="arch-title text-3xl font-bold text-slate-900 mb-8 border-b border-slate-100 pb-2">Ambiente: {env.name}</h3>

              <div className="grid grid-cols-2 gap-12 flex-1">
                <div className="space-y-8">
                  <section className="bg-slate-900 p-6 rounded-xl text-white shadow-xl">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Fabbisogno Energetico</h4>
                    <div className="flex items-baseline space-x-2">
                      <span className="text-5xl font-light tracking-tighter">{Math.round(wattsReq)}</span>
                      <span className="text-xl font-bold text-slate-400">WATT</span>
                    </div>
                  </section>

                  <section className="border rounded-xl p-6 bg-white space-y-6">
                    <h4 className="text-xs font-bold text-slate-800 uppercase border-b pb-2">CONFIGURAZIONE TECNICA</h4>
                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <span className="block text-[10px] font-bold text-slate-400 uppercase">Gamma Modelli</span>
                        <span className="text-lg font-bold">{data.series}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] font-bold text-slate-400 uppercase">Modello / Altezza</span>
                        <span className="text-lg font-bold">{data.model.label} (H {data.model.height} mm)</span>
                      </div>
                      <div>
                        <span className="block text-[10px] font-bold text-slate-400 uppercase">Interasse Calorifero</span>
                        <span className="text-lg font-bold">{data.model.interaxis} mm</span>
                      </div>
                      <div>
                        <span className="block text-[10px] font-bold text-slate-400 uppercase">Numero Elementi</span>
                        <span className="text-lg font-bold">{data.currentElements}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] font-bold text-slate-400 uppercase">Lunghezza Totale</span>
                        <span className={`text-lg font-bold ${data.totalLength > env.specs.maxWidth ? 'text-red-600' : ''}`}>{data.totalLength} mm</span>
                      </div>
                      <div>
                        <span className="block text-[10px] font-bold text-slate-400 uppercase">Ingombro Nicchia</span>
                        <span className="text-lg font-bold">{env.specs.nicheWidth} x {env.specs.nicheHeight} mm</span>
                      </div>
                      <div className="col-span-1">
                        <span className="block text-[10px] font-bold text-slate-400 uppercase">Diaframma Interno</span>
                        <span className="text-lg font-bold">{env.specs.hasDiaphragm ? 'PRESENTE' : 'ASSENTE'}</span>
                      </div>
                      <div className="col-span-2 pt-2 border-t border-slate-50">
                        <span className="block text-[10px] font-bold text-slate-400 uppercase">Caratteristiche Impianto</span>
                        <span className="text-md font-medium text-slate-700">{env.specs.pipeMaterial} - {env.specs.pipeDiameter}</span>
                      </div>
                    </div>
                    {data.eccentricText && <p className="text-xs text-red-600 font-bold uppercase italic">{data.eccentricText}</p>}
                  </section>
                </div>

                <div className="flex flex-col items-center justify-center">
                    <RadiatorVisualizer 
                      specs={env.specs} 
                      calculatedWidth={data.totalLength}
                      realWatts={data.totalWatts}
                      requiredWatts={data.requiredWatts}
                    />
                </div>
              </div>

              <footer className="mt-auto pt-10 border-t border-slate-100 flex justify-between items-end">
                 <div className="w-1/3">
                   <div className="h-px bg-slate-200 mb-2"></div>
                   <p className="text-[10px] uppercase font-bold text-slate-400 tracking-tighter">Firma per Accettazione Progetto</p>
                 </div>
                 <div className="text-right">
                   <p className="text-[10px] text-slate-400 italic">HeatMaster ArchQuote Engineering - Pagina {index + 1}</p>
                 </div>
              </footer>
            </div>
          );
        })}

        {/* Final Summary Table Page in Print */}
        <div className="p-12 min-h-screen relative flex flex-col" style={{ pageBreakBefore: 'always' }}>
           <header className="border-b-4 border-slate-800 pb-8 mb-10 flex justify-between items-start">
            <div>
              <h2 className="arch-title text-2xl font-bold text-slate-900 tracking-tight">Riepilogo Generale Progetto</h2>
              <p className="text-slate-500 text-sm mt-1 uppercase font-bold tracking-widest">Allegato Tecnico Riepilogativo</p>
            </div>
            <div className="text-right text-sm text-slate-600">
               <p className="pt-4 text-xs font-mono uppercase text-slate-400">Data: {new Date().toLocaleDateString('it-IT')}</p>
            </div>
          </header>

          <div className="bg-slate-900 p-8 rounded-xl text-white mb-10 flex justify-between items-center shadow-xl">
            <div>
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Cliente</h4>
              <p className="text-2xl font-bold">{project.clientName} {project.clientSurname}</p>
              <p className="text-sm text-slate-400 mt-1">{project.siteAddress || '---'}</p>
            </div>
            <div className="text-right">
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Conteggio Ambienti</h4>
              <p className="text-4xl font-light">{environments.length}</p>
            </div>
          </div>

          <div className="flex-1">
             <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b-2 border-slate-900 bg-slate-50">
                    <th className="px-4 py-3 font-bold text-slate-900 uppercase text-[11px]">Ambiente</th>
                    <th className="px-4 py-3 font-bold text-slate-900 uppercase text-[11px]">Gamma</th>
                    <th className="px-4 py-3 font-bold text-slate-900 uppercase text-[11px]">Modello</th>
                    <th className="px-4 py-3 font-bold text-slate-900 uppercase text-[11px]">Elementi</th>
                    <th className="px-4 py-3 font-bold text-slate-900 uppercase text-[11px]">Lunghezza</th>
                    <th className="px-4 py-3 font-bold text-slate-900 uppercase text-[11px]">Diaframma</th>
                    <th className="px-4 py-3 font-bold text-slate-900 uppercase text-[11px]">Diametro Tubo</th>
                    <th className="px-4 py-3 font-bold text-slate-900 uppercase text-[11px]">Materiale</th>
                    <th className="px-4 py-3 font-bold text-slate-900 uppercase text-[11px]">Watt</th>
                  </tr>
                </thead>
                <tbody>
                  {environments.map(env => {
                    const data = getEnvRadiatorData(env);
                    return (
                      <tr key={env.id} className="border-b border-slate-200">
                        <td className="px-4 py-4 font-bold text-slate-800">{env.name}</td>
                        <td className="px-4 py-4 text-slate-600 font-bold">{data.series}</td>
                        <td className="px-4 py-4 text-slate-600">{data.model.label} / H {data.model.height}</td>
                        <td className="px-4 py-4 font-bold text-slate-800 text-center">{data.currentElements}</td>
                        <td className="px-4 py-4 text-slate-600 font-mono">{data.totalLength}mm</td>
                        <td className="px-4 py-4 font-bold">
                          {env.specs.hasDiaphragm ? (
                            <span className="text-red-600">SI</span>
                          ) : (
                            <span className="text-slate-400 font-normal text-[10px]">NO</span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-slate-600 text-[10px]">{env.specs.pipeDiameter}</td>
                        <td className="px-4 py-4 text-slate-600 text-[10px]">{env.specs.pipeMaterial}</td>
                        <td className="px-4 py-4 font-black text-slate-900">{data.totalWatts}W</td>
                      </tr>
                    );
                  })}
                  <tr className="bg-slate-100 border-t-2 border-slate-900 font-black">
                    <td colSpan={8} className="px-4 py-4 text-right uppercase text-[10px]">Potenza Termica Totale Installata</td>
                    <td className="px-4 py-4 text-lg">
                      {environments.reduce((acc, env) => acc + getEnvRadiatorData(env).totalWatts, 0)} W
                    </td>
                  </tr>
                </tbody>
             </table>
          </div>

          <footer className="mt-auto pt-10 border-t border-slate-100 flex justify-between items-end">
             <div className="w-1/3">
               <div className="h-px bg-slate-200 mb-2"></div>
               <p className="text-[10px] uppercase font-bold text-slate-400 tracking-tighter">Documentazione Progetto Radiatori Tubular</p>
             </div>
             <div className="text-right">
               <p className="text-[10px] text-slate-400">Generato con ArchQuote v2.0 - HeatMaster</p>
             </div>
          </footer>
        </div>
      </div>
    </div>
  );
};

export default App;
