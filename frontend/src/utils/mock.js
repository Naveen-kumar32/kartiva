// Simulated network latency for VITE_DATA_MODE=mock so loading states are visible.
export const mockDelay = (value, ms = 350) => new Promise((resolve) => setTimeout(() => resolve(structuredClone(value)), ms));

export function makeOrderNumber() {
  const d = new Date();
  const datePart = `${String(d.getFullYear()).slice(2)}${d.getMonth() + 1}${d.getDate()}`;
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `KTV-${datePart}-${rand}`;
}
