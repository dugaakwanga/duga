// Geofence utilities for staff attendance verification.

export function haversineDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function distanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  return haversineDistanceKm(lat1, lng1, lat2, lng2) * 1000;
}

export function withinRadiusMeters(
  lat: number,
  lng: number,
  schoolLat: number,
  schoolLng: number,
  radiusMeters: number,
): { within: boolean; distanceM: number } {
  const d = distanceMeters(lat, lng, schoolLat, schoolLng);
  return { within: d <= radiusMeters, distanceM: Math.round(d * 100) / 100 };
}
