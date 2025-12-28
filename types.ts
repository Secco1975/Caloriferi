
export enum ValvePosition {
  BOTTOM = 'BOTTOM',
  RIGHT = 'RIGHT',
  LEFT = 'LEFT'
}

export enum RadiatorSeries {
  TESI2 = 'TESI 2',
  TESI3 = 'TESI 3',
  TESI4 = 'TESI 4',
  CUSTOM = 'PERSONALIZZATO'
}

export interface RadiatorSpecs {
  surface: number; // m2
  height: number; // m
  valveCenterDistance: number; // mm (interasse inserito)
  valvePosition: ValvePosition;
  valveWallDistance: number; // mm
  nicheWidth: number; // mm
  nicheHeight: number; // mm (altezza nicchia)
  valveHeight: number; // mm (altezza valvola dal fondo nicchia)
  sideValveDistance: number; // mm (distanza valvola dal lato nicchia)
  maxWidth: number; // mm
  manualElements?: number; // Override manuale numero elementi
  hasDiaphragm: boolean;
  series: RadiatorSeries; // Selected series
  pipeDiameter: string; // Pipe diameter
  pipeMaterial: string; // Pipe material
  customModelId?: string; // Reference to a custom model if selected
}

export interface RadiatorModel {
  id?: string;
  label: string;
  code: string;
  height: number;
  interaxis: number;
  watts: number;
  series?: RadiatorSeries;
  brand?: string; // Brand name (e.g., Fondital)
}

export interface Environment {
  id: string;
  name: string;
  specs: RadiatorSpecs;
}

export interface Project {
  id: string;
  clientName: string;
  clientSurname: string;
  siteAddress: string;
  environments: Environment[];
}

export interface GlobalSettings {
  wattCoefficient: number;
}

export interface CalculationResult {
  volume: number;
  watts: number;
}
