export interface MapProjectedPoint {
  x: number;
  y: number;
}

export interface MapPointClickPayload {
  lat: number;
  lon: number;
  screenX: number;
  screenY: number;
  zoom: number;
  bbox?: string | null;
  view?: string;
  countryCode?: string;
  countryName?: string;
}
