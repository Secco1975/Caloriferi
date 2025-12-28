
import { ValvePosition, RadiatorSpecs, ProjectDetails, RadiatorSeries } from './types';

export const PIPE_DIAMETERS = [
  'N.D.', '10 mm', '12 mm', '14 mm', '15 mm', '16 mm', '18 mm', '20 mm', '22 mm', '26 mm', '28 mm', '3/8"', '1/2"', '3/4"', '1"'
];

export const PIPE_MATERIALS = ['N.D.', 'Rame', 'Ferro'];

export const INITIAL_SPECS: RadiatorSpecs = {
  surface: 20,
  height: 2.7,
  valveCenterDistance: 0,
  valvePosition: ValvePosition.BOTTOM,
  valveWallDistance: 50,
  nicheWidth: 0,
  nicheHeight: 0,
  maxWidth: 0,
  hasDiaphragm: false,
  series: RadiatorSeries.TESI3,
  pipeDiameter: 'N.D.',
  pipeMaterial: 'N.D.'
};

export const INITIAL_PROJECT: ProjectDetails = {
  clientName: '',
  clientSurname: '',
  siteAddress: ''
};
