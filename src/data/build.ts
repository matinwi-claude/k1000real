import type { Configuration, PowerOption, Season } from '../store';

/**
 * "Build Your Own K1000" data: flight hours and the total payload weight are shown.
 *
 * Flight hours per configuration with solar and no payload: fixed wing 24 h, eVTOL 12 h (Kraus Hamdani).
 * Non-solar halves them (PLACEHOLDER — to confirm).
 * Each fitted payload or radio costs flight time in proportion to its weight:
 *   hours = base × (1 − HOURS_LOST_PER_LB × total lb)   (the rate is a PLACEHOLDER — to confirm)
 */
export const BASE_FLIGHT_HOURS: Record<Configuration, Record<PowerOption, number>> = {
  'fixed-wing': { solar: 24, 'non-solar': 12 },
  evtol: { solar: 12, 'non-solar': 6 },
};

/** Winter costs this many flight hours (shorter days, colder batteries), after the payload deduction. */
export const WINTER_HOURS_LOST = 10;

/** Fraction of flight time lost per pound carried. */
export const HOURS_LOST_PER_LB = 0.035;

const KG_TO_LB = 2.20462;
const lb = (kg: number) => kg * KG_TO_LB;

/** Radios and payloads offered in the builder (ids from src/data/components.ts) and their weight in pounds. */
export const BUILD_PAYLOADS: { id: string; kind: 'radio' | 'payload'; weightLb: number; confirmed: boolean }[] = [
  { id: 'eo-ir', kind: 'payload', weightLb: lb(0.75), confirmed: true }, // HD40 LVV 750 g
  { id: 'sar', kind: 'payload', weightLb: 2.0, confirmed: false },
  { id: 'mod', kind: 'payload', weightLb: 1.5, confirmed: false },
  { id: 'asi-snitch', kind: 'payload', weightLb: 2.0, confirmed: false },
  { id: 'atne', kind: 'payload', weightLb: 1.0, confirmed: false },
  { id: 'starlink', kind: 'payload', weightLb: 2.0, confirmed: false },
  { id: 'silvus', kind: 'radio', weightLb: lb(0.116), confirmed: true }, // Silvus 4200 116 g
  { id: 'silvus-4400', kind: 'radio', weightLb: lb(1.14), confirmed: true }, // Silvus 4400 1.14 kg
];

/** Parts that leave the 3D aircraft for a given build (solar cells, payloads not fitted). */
export const SOLAR_PARTS = new Set(['solar-port', 'solar-starboard', 'solar-tail']);
export const BUILD_PAYLOAD_IDS = new Set(BUILD_PAYLOADS.map((p) => p.id));

/** Total weight of the fitted payloads and radios, in pounds. */
export function payloadWeightLb(payloads: string[]) {
  return BUILD_PAYLOADS.reduce((sum, p) => sum + (payloads.includes(p.id) ? p.weightLb : 0), 0);
}

export function flightHours(configuration: Configuration, power: PowerOption, payloads: string[], season: Season = 'summer') {
  const hours = BASE_FLIGHT_HOURS[configuration][power] * Math.max(0.2, 1 - HOURS_LOST_PER_LB * payloadWeightLb(payloads));
  return Math.max(0, hours - (season === 'winter' ? WINTER_HOURS_LOST : 0));
}

/** True when a part is not on the aircraft in the current build (it dissolves away in 3D). */
export function isAbsent(s: { configuration: Configuration; power: PowerOption; payloads: string[]; buildOpen: boolean }, id: string, vtolOnly: Set<string>) {
  if (s.configuration === 'fixed-wing' && vtolOnly.has(id)) return true;
  // power and payload choices only shape the aircraft while the builder is open; closing it shows the full aircraft
  if (!s.buildOpen) return false;
  if (s.power === 'non-solar' && SOLAR_PARTS.has(id)) return true;
  return BUILD_PAYLOAD_IDS.has(id) && !s.payloads.includes(id);
}
