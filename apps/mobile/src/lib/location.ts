import * as Location from 'expo-location';

export type Point = { lat: number; lng: number };

/**
 * The phone's position, asking for "while using the app" permission first.
 * Null when refused or unavailable (the user can search an address instead).
 */
export async function currentPoint(): Promise<Point | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== Location.PermissionStatus.GRANTED) return null;
    const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return { lat: p.coords.latitude, lng: p.coords.longitude };
  } catch {
    return null;
  }
}
