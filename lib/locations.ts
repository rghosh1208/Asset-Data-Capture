// Structured location entry. Indoor GPS in concrete buildings like MSB is
// useless, so techs pick building + floor + room and we assemble a UCSF
// location code (e.g. 2252-01-1C3) that reconciles against Maximo far more
// reliably than lat/lng.

export interface Building {
  code: string; // numeric building code used in location codes
  name: string; // human label
  abbr: string; // short abbreviation
}

// Seed with the buildings this project covers. Override with
// NEXT_PUBLIC_BUILDINGS="2252:Medical Sciences:MSB,3008:Health Sciences West:HSW"
const DEFAULT_BUILDINGS: Building[] = [
  { code: '2252', name: 'Medical Sciences Bldg', abbr: 'MSB' },
  { code: '3008', name: 'Health Sciences West', abbr: 'HSW' },
  { code: '3009', name: 'Health Sciences West', abbr: 'HSW' },
];

export function getBuildings(): Building[] {
  const env = process.env.NEXT_PUBLIC_BUILDINGS;
  if (env && env.trim()) {
    const parsed = env
      .split(',')
      .map((chunk) => chunk.split(':').map((s) => s.trim()))
      .filter((parts) => parts[0])
      .map(([code, name, abbr]) => ({
        code,
        name: name || code,
        abbr: abbr || code,
      }));
    if (parsed.length) return parsed;
  }
  return DEFAULT_BUILDINGS;
}

/** Zero-pad a floor to two digits to match the UCSF code convention. */
export function padFloor(floor: string): string {
  const t = floor.trim();
  if (!t) return '';
  // Basement/ground shorthand passes through untouched (B, G, M).
  if (/^[a-z]$/i.test(t)) return t.toUpperCase();
  const n = t.replace(/\D/g, '');
  if (!n) return t.toUpperCase();
  return n.padStart(2, '0');
}

/**
 * Assemble a location code from parts. Returns '' until at least a building is
 * chosen. Room is uppercased and stripped of surrounding whitespace.
 */
export function buildLocationCode(
  building: string,
  floor: string,
  room: string,
): string {
  if (!building) return '';
  const parts = [building.trim()];
  const f = padFloor(floor);
  const r = room.trim().toUpperCase();
  if (f) parts.push(f);
  if (r) parts.push(r);
  return parts.join('-');
}
