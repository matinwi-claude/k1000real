import type { DroneEngine } from './DroneEngine';

/** Singleton handle so UI controls can call imperative engine methods. */
export const engineRef: { current: DroneEngine | null } = { current: null };
