export interface NetEstimate {
  id: string;
  label: string;
  areaNote: string;
  lat: number;
  lon: number;
  probability: number;
  uncertaintyKm: number;
}

export const NET_ESTIMATES: NetEstimate[] = [
  {
    id: 'west-jerusalem-corridor',
    label: 'محور غرب یروشلم',
    areaNote: 'برآورد نهادی با عدم قطعیت مکانی',
    lat: 31.785,
    lon: 35.125,
    probability: 40,
    uncertaintyKm: 9,
  },
  {
    id: 'jerusalem-admin-axis',
    label: 'محور اداری یروشلم',
    areaNote: 'برآورد نهادی با عدم قطعیت مکانی',
    lat: 31.77,
    lon: 35.215,
    probability: 30,
    uncertaintyKm: 7,
  },
  {
    id: 'tel-aviv-metro-axis',
    label: 'محور کلان شهری تل آویو',
    areaNote: 'برآورد نهادی با عدم قطعیت مکانی',
    lat: 32.08,
    lon: 34.78,
    probability: 20,
    uncertaintyKm: 10,
  },
];

export function getNetEstimateCoreRadiusMeters(probability: number): number {
  return 14000 + probability * 450;
}

export function getNetEstimateRingRadiusMeters(uncertaintyKm: number): number {
  return uncertaintyKm * 1000;
}

export function getNetEstimateCoreSizePx(probability: number): number {
  return 14 + Math.round(probability * 0.45);
}

export function getNetEstimateRingSizePx(probability: number, uncertaintyKm: number): number {
  return 38 + Math.round(probability * 0.7) + Math.round(uncertaintyKm * 1.5);
}
