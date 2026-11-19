// Snimanje tragova: izvor tačaka, čuvanje, crash-snimak i oporavak.
// U APK-u tačke skuplja native foreground servis u fajl-bafer (preživi ugašen ekran i ubijen
// WebView); JS čita bafer od zadnjeg pomaka. U browseru izvor je watchPosition.

import {
  newTrack, pauseTrack, resumeTrack, stopTrack, mergePoints, autoPauseCheck,
  createSnapshotTimer, defaultTrackName,
} from './trag.js';
import { idbPut, idbGet, idbAll, idbDelete } from './db.js';
import { alarm } from './ui.js';
import { uuid } from './zapisi.js';
import { enqueue } from './sync.js';

const NATIVE_POLL_MS = 3000;
const RAW_WINDOW_MS = 4 * 60 * 1000;
const SNAPSHOT_MS = 30000;

const active = new Map();
const listeners = new Set();
let raw = [];
let nativeOffset = 0;
let pollHandle = null;
let watchId = null;

const snapshot = createSnapshotTimer((ids) => {
  ids.forEach((id) => { const t = active.get(id); if (t) saveTrack(t).catch(() => {}); });
}, SNAPSHOT_MS);

function nativeGps() {
  const b = globalThis.AndroidGps;
  return b?.start && b?.read ? b : null;
}

export function hasNativeGps() {
  return Boolean(nativeGps());
}

// Kritičan upis: neuspjeh se javlja glasno, nikad tihi catch.
export async function saveTrack(trag) {
  const rec = { ...trag, izmijenjen: Date.now(), rev: (trag.rev || 0) + 1, sinhronizovano: false };
  try {
    await idbPut('tragovi', rec);
  } catch (err) {
    alarm(`Trag "${trag.naziv}" nije sačuvan: ${err?.message || err}`);
    throw err;
  }
  // Na server ide završen trag; potraga i dok traje (vodič psa krvara je prati).
  if ((rec.status === 'gotovo' || rec.vrsta === 'potraga') && !rec.tudji) await enqueue('tragovi', rec.id).catch((err) => console.error('red slanja', err));
  return rec;
}

function emit() {
  const list = [...active.values()];
  listeners.forEach((fn) => { try { fn(list); } catch (e) { console.error(e); } });
}

export function onRecordingChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function activeRecordings() {
  return [...active.values()];
}

function ingest(points) {
  if (!points.length) return;
  const now = Date.now();
  raw = raw.concat(points).filter((p) => p.t >= now - RAW_WINDOW_MS).sort((a, b) => a.t - b.t);
  for (const [id, tr] of active) {
    let next = { ...tr, tacke: mergePoints(tr.tacke, points, tr) };
    const decision = autoPauseCheck(next, raw, now);
    if (decision === 'pauza') next = pauseTrack(next, now, true);
    if (decision === 'nastavi') next = resumeTrack(next, now);
    active.set(id, next);
    if (decision) saveTrack(next).catch(() => {});
  }
  emit();
}

function readNative() {
  const b = nativeGps();
  if (!b) return;
  try {
    const res = JSON.parse(b.read(nativeOffset));
    nativeOffset = res.next;
    ingest(res.pts || []);
  } catch (err) {
    console.error('čitanje GPS bafera', err);
  }
}

function startSource() {
  const b = nativeGps();
  if (b) {
    const r = b.start();
    if (r !== 'ok') throw new Error(r === 'dozvola' ? 'Dozvoli lokaciju, pa ponovo tapni Snimaj' : `GPS servis: ${r}`);
    if (pollHandle == null) pollHandle = setInterval(readNative, NATIVE_POLL_MS);
    readNative();
    return;
  }
  if (watchId == null && navigator.geolocation) {
    watchId = navigator.geolocation.watchPosition((pos) => {
      const c = pos.coords;
      ingest([{ t: pos.timestamp || Date.now(), lat: c.latitude, lon: c.longitude, acc: c.accuracy, alt: c.altitude ?? undefined }]);
    }, (err) => console.warn('GPS', err), { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 });
  }
}

async function stopSourceIfIdle() {
  if (active.size) return;
  const b = nativeGps();
  if (b) {
    readNative();
    b.stop();
    clearInterval(pollHandle);
    pollHandle = null;
    // Bafer se briše tek kad nema ni nedovršenog traga za oporavak.
    if (!(await unfinishedTracks()).length) {
      b.clear();
      nativeOffset = 0;
    }
  }
  if (watchId != null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
}

// Pri prvom snimanju: izuzeće od optimizacije baterije (OEM menadžeri inače ubiju proces).
function askBatteryExemptionOnce() {
  const b = nativeGps();
  try {
    if (b?.isIgnoringBattery && !b.isIgnoringBattery()) b.requestBatteryExemption();
  } catch (err) {
    console.warn('baterija', err);
  }
}

export async function startRecording({ naziv, vrsta = 'obilazak', pitajBateriju = true, nastrijel = null } = {}) {
  const now = Date.now();
  const trag = { ...newTrack({ id: uuid(), start: now, naziv: naziv || defaultTrackName(now), vrsta }), ...(nastrijel ? { nastrijel, krv: [] } : {}) };
  await saveTrack(trag);
  active.set(trag.id, trag);
  try {
    startSource();
  } catch (err) {
    active.delete(trag.id);
    await idbDelete('tragovi', trag.id);
    throw err;
  }
  snapshot.start(trag.id);
  if (pitajBateriju) askBatteryExemptionOnce();
  emit();
  return trag;
}

async function updateActive(id, fn) {
  const tr = active.get(id);
  if (!tr) return null;
  const next = fn(tr, Date.now());
  active.set(id, next);
  await saveTrack(next);
  emit();
  return next;
}

// Trag krvi dodirom na trenutnoj poziciji (potraga za ranjenom divljači).
export const addBloodMark = (id, mark) => updateActive(id, (t, now) => ({ ...t, krv: [...(t.krv || []), { ...mark, t: mark.t ?? now }] }));

export const pauseRecording = (id) => updateActive(id, (t, now) => pauseTrack(t, now, false));
export const resumeRecording = (id) => updateActive(id, (t, now) => resumeTrack(t, now));

export async function stopRecording(id) {
  readNative();
  const tr = active.get(id);
  if (!tr) return null;
  const done = stopTrack(tr, Date.now());
  active.delete(id);
  snapshot.stop(id);
  await saveTrack(done);
  await stopSourceIfIdle();
  emit();
  return done;
}

export async function allTracks() {
  return (await idbAll('tragovi')).sort((a, b) => b.start - a.start);
}

export async function unfinishedTracks() {
  return (await idbAll('tragovi')).filter((t) => t.status !== 'gotovo' && !active.has(t.id));
}

export function readNativeBufferAll() {
  const b = nativeGps();
  if (!b) return [];
  const pts = [];
  let offset = 0;
  for (let i = 0; i < 1000; i++) {
    const res = JSON.parse(b.read(offset));
    pts.push(...(res.pts || []));
    if (res.next === offset) break;
    offset = res.next;
  }
  nativeOffset = Math.max(nativeOffset, offset);
  return pts;
}

// Nastavak traga prekinutog gašenjem app-a: tačke koje je servis snimio u međuvremenu se dodaju.
export async function continueRecovered(id) {
  const tr = await idbGet('tragovi', id);
  if (!tr) return null;
  const next = { ...tr, tacke: mergePoints(tr.tacke, readNativeBufferAll(), tr) };
  active.set(id, next);
  await saveTrack(next);
  startSource();
  snapshot.start(id);
  emit();
  return next;
}

export async function finishRecovered(id) {
  const tr = await idbGet('tragovi', id);
  if (!tr) return null;
  const withPts = { ...tr, tacke: mergePoints(tr.tacke, readNativeBufferAll(), tr) };
  const end = withPts.tacke.length ? withPts.tacke[withPts.tacke.length - 1].t : Date.now();
  const done = stopTrack(withPts, Math.max(end, tr.start));
  await saveTrack(done);
  await stopSourceIfIdle();
  return done;
}

export async function deleteTrack(id) {
  const cur = await idbGet('tragovi', id);
  if ((cur?.status === 'gotovo' || cur?.vrsta === 'potraga') && !cur.tudji) {
    try {
      await enqueue('tragovi', id, { id, obrisan: true, rev: (cur.rev || 0) + 1, updated_at: Date.now() });
    } catch (err) {
      alarm(`Brisanje traga nije sačuvano za slanje: ${err?.message || err}`);
      throw err;
    }
  }
  await idbDelete('tragovi', id);
}

export async function renameTrack(id, naziv) {
  const tr = await idbGet('tragovi', id);
  if (!tr) return null;
  const next = { ...tr, naziv };
  await saveTrack(next);
  return next;
}

export async function setSmoothed(id, uglacan) {
  const tr = await idbGet('tragovi', id);
  if (!tr) return null;
  const next = { ...tr, uglacan };
  await saveTrack(next);
  return next;
}
