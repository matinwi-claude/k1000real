import type { Configuration, PowerOption } from '../store';

/**
 * "Build Your Own K1000" data.
 *
 * Solar endurance per configuration is from Kraus Hamdani (fixed wing 24 h, eVTOL 12 h).
 * PLACEHOLDERS still to confirm: range, altitude, the non-solar figures and the payload costs.
 * Endurance and range are given per configuration × power with no payload fitted;
 * each payload then costs a fraction of endurance (and range in the same proportion).
 */
export const BASE_PERFORMANCE: Record<Configuration, Record<PowerOption, { endurance: number; range: number; altitude: number }>> = {
  'fixed-wing': {
    solar: { endurance: 24, range: 1800, altitude: 15000 },
    'non-solar': { endurance: 12, range: 900, altitude: 15000 },
  },
  evtol: {
    solar: { endurance: 12, range: 900, altitude: 12000 },
    'non-solar': { endurance: 6, range: 450, altitude: 12000 },
  },
};

/** Radios and payloads offered in the builder (ids from src/data/components.ts) and their endurance cost. */
export const BUILD_PAYLOADS: { id: string; kind: 'radio' | 'payload'; penalty: number }[] = [
  { id: 'eo-ir', kind: 'payload', penalty: 0.06 },
  { id: 'sar', kind: 'payload', penalty: 0.08 },
  { id: 'mod', kind: 'payload', penalty: 0.05 },
  { id: 'atne', kind: 'payload', penalty: 0.03 },
  { id: 'starlink', kind: 'payload', penalty: 0.07 },
  { id: 'silvus', kind: 'radio', penalty: 0.02 },
  { id: 'silvus-4400', kind: 'radio', penalty: 0.03 },
];

/** Parts that leave the 3D aircraft for a given build (solar cells, payloads not fitted). */
export const SOLAR_PARTS = new Set(['solar-port', 'solar-starboard', 'solar-tail']);
export const BUILD_PAYLOAD_IDS = new Set(BUILD_PAYLOADS.map((p) => p.id));

export function performance(configuration: Configuration, power: PowerOption, payloads: string[]) {
  const base = BASE_PERFORMANCE[configuration][power];
  let f = 1;
  for (const p of BUILD_PAYLOADS) if (payloads.includes(p.id)) f *= 1 - p.penalty;
  return {
    endurance: base.endurance * f,
    range: base.range * f,
    altitude: base.altitude,
  };
}

/** True when a part is not on the aircraft in the current build (it dissolves away in 3D). */
export function isAbsent(s: { configuration: Configuration; power: PowerOption; payloads: string[] }, id: string, vtolOnly: Set<string>) {
  if (s.configuration === 'fixed-wing' && vtolOnly.has(id)) return true;
  if (s.power === 'non-solar' && SOLAR_PARTS.has(id)) return true;
  return BUILD_PAYLOAD_IDS.has(id) && !s.payloads.includes(id);
}
