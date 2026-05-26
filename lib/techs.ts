// Default tech list. Override with NEXT_PUBLIC_TECHS env (comma-separated).
const DEFAULTS = [
  'Anthony L.',
  'Bernard K.',
  'Seth X.',
  'Maria G.',
  'James O.',
  'Rashi G.',
];

export function getTechs(): string[] {
  const envList = process.env.NEXT_PUBLIC_TECHS;
  if (envList && envList.trim().length > 0) {
    return envList.split(',').map(s => s.trim()).filter(Boolean);
  }
  return DEFAULTS;
}
