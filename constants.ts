
import { ValvePosition, RadiatorSpecs, Project, RadiatorSeries, GlobalSettings } from './types';

export const PIPE_DIAMETERS = [
  'N.D.', '10 mm', '12 mm', '14 mm', '15 mm', '16 mm', '18 mm', '20 mm', '22 mm', '26 mm', '28 mm', '3/8"', '1/2"', '3/4"', '1"'
];

export const PIPE_MATERIALS = ['N.D.', 'Rame', 'Ferro', 'Multistrato'];

export const INITIAL_SETTINGS: GlobalSettings = {
  wattCoefficient: 30
};

export const INITIAL_SPECS: RadiatorSpecs = {
  surface: 20,
  height: 2.7,
  valveCenterDistance: 0,
  valvePosition: ValvePosition.BOTTOM,
  valveWallDistance: 50,
  nicheWidth: 0,
  nicheHeight: 0,
  valveHeight: 0,
  maxWidth: 0,
  hasDiaphragm: false,
  series: RadiatorSeries.TESI3,
  pipeDiameter: 'N.D.',
  pipeMaterial: 'N.D.'
};

export const createInitialProject = (): Project => ({
  id: Math.random().toString(36).substr(2, 9),
  clientName: '',
  clientSurname: '',
  siteAddress: '',
  environments: [
    { id: 'env-1', name: 'Ambiente 1', specs: { ...INITIAL_SPECS } }
  ]
});
