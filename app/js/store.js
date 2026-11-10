// Saving, loading, and backup files.
import { createInitialState, emptyWeek, emptyChecks } from './seed.js';

export const STORAGE_KEY = 'weekly-groceries-v1';

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);

function validState(s) {
  return isObj(s) && s.version === 1 && isObj(s.ingredients) && isObj(s.meals) && isObj(s.week);
}

// Fill in any missing optional parts so older/partial data still works.
function normalize(s) {
  return {
    ...s,
    householdStaples: Array.isArray(s.householdStaples) ? s.householdStaples : [],
    regulars: Array.isArray(s.regulars) ? s.regulars : [],
    oneOffs: Array.isArray(s.oneOffs) ? s.oneOffs : [],
    checks: { ...emptyChecks(), ...(isObj(s.checks) ? s.checks : {}) },
  };
}

export function loadState(storage) {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (validState(s)) return normalize(s);
    }
  } catch { /* fall through to starter data */ }
  return createInitialState();
}

export function saveState(storage, state) {
  storage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function exportBackup(state) {
  return JSON.stringify({ app: 'weekly-groceries', exportedAt: new Date().toISOString(), state }, null, 2);
}

export function importBackup(text) {
  let data;
  try { data = JSON.parse(text); } catch { return { ok: false, error: "That file isn't a Weekly Groceries backup (couldn't read it)." }; }
  if (!isObj(data) || data.app !== 'weekly-groceries') return { ok: false, error: "That file isn't a Weekly Groceries backup." };
  if (!validState(data.state)) return { ok: false, error: 'That backup is from an unsupported version or is damaged.' };
  return { ok: true, state: normalize(data.state) };
}

export function resetWeek(state) {
  return { ...state, week: emptyWeek(), checks: emptyChecks(), oneOffs: [] };
}
