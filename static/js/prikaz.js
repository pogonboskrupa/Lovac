// Veličina prikaza (za starije lovce): veći tekst i dugmad u ekranima i meniju. Sprema se lokalno.

export const VELICINE = { normalno: 'Normalno', veliko: 'Veliko', najvece: 'Najveće' };
const KEY = 'lovac.velicina';

export function normalizeVelicina(v) {
  return Object.hasOwn(VELICINE, v) ? v : 'normalno';
}

export function applyVelicina(v) {
  const value = normalizeVelicina(v);
  document.documentElement.dataset.velicina = value;
  return value;
}

export function initVelicina() {
  let saved = 'normalno';
  try { saved = JSON.parse(globalThis.localStorage?.getItem(KEY)); } catch { /* bez pohrane ostaje normalno */ }
  return applyVelicina(saved);
}

export function setVelicina(v) {
  const value = applyVelicina(v);
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify(value)); } catch (err) { console.warn('veličina prikaza nije sačuvana', err); }
  return value;
}
