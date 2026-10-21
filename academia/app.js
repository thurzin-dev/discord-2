'use strict';

/* =========================================================================
   Carga — acompanhamento de progresso na academia.
   Tudo fica no aparelho: dados em localStorage, fotos em IndexedDB.
   ========================================================================= */

// ---------- utilidades ----------
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-3);
const DAY = 864e5;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = s => { const n = parseFloat(String(s ?? '').replace(',', '.')); return isFinite(n) ? n : NaN; };
const fmt = (n, d = 1) => isFinite(n) ? (Math.round(n * 10 ** d) / 10 ** d).toLocaleString('pt-BR') : '–';
const fmtVol = kg => kg >= 1000 ? fmt(kg / 1000, 1) + ' t' : fmt(kg, 0) + ' kg';
const dayStart = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const weekStart = t => { const d = new Date(dayStart(t)); const w = (d.getDay() + 6) % 7; return d.getTime() - w * DAY; };
const fmtDate = (t, o = { day: '2-digit', month: 'short' }) => new Date(t).toLocaleDateString('pt-BR', o).replace('.', '');
const fmtDur = s => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), ss = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${m}:${String(ss).padStart(2, '0')}`; };
const relDay = t => {
  const diff = Math.round((dayStart(Date.now()) - dayStart(t)) / DAY);
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Ontem';
  if (diff < 7) return `${diff} dias atrás`;
  return fmtDate(t, { day: '2-digit', month: 'short', year: diff > 300 ? '2-digit' : undefined });
};
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const SPRING = CSS.supports('animation-timing-function', 'linear(0, 1)')
  ? getComputedStyle(document.documentElement).getPropertyValue('--spring').trim()
  : 'cubic-bezier(.34,1.56,.64,1)';
const ELASTIC = CSS.supports('animation-timing-function', 'linear(0, 1)')
  ? getComputedStyle(document.documentElement).getPropertyValue('--elastic').trim()
  : 'cubic-bezier(.5,1.9,.5,.8)';
function anim(el, frames, opts) { if (!el || reduceMotion) return; try { return el.animate(frames, opts); } catch { } }
const jelly = el => anim(el, [
  { transform: 'scale(1,1)' }, { transform: 'scale(1.2,.82)' }, { transform: 'scale(.88,1.12)' },
  { transform: 'scale(1.06,.95)' }, { transform: 'scale(.98,1.02)' }, { transform: 'scale(1,1)' }
], { duration: 650, easing: 'ease-out' });
const popEl = el => anim(el, [{ transform: 'scale(.3)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 700, easing: ELASTIC, fill: 'backwards' });
const buzz = ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch { } };

// ---------- ícones ----------
const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  chart: '<path d="M4 19V5M4 19h16M8 15l4-5 3 3 5-6"/>',
  dumbbell: '<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/>',
  body: '<circle cx="12" cy="4.5" r="2"/><path d="M5 8.5c2.5 1 4.5 1.3 7 1.3s4.5-.3 7-1.3M12 9.8V15m0 0-3 6m3-6 3 6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  check: '<path d="M5 12.5 10 17l9-10" stroke-width="3"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  down: '<path d="M5 9l7 7 7-7"/>',
  chev: '<path d="M9 5l7 7-7 7"/>',
  dots: '<circle cx="5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="19" cy="12" r="1.4" fill="currentColor"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9 2h6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  scale: '<rect x="3" y="4" width="18" height="16" rx="4"/><path d="M8.5 10a4 4 0 0 1 7 0M12 10l1.2-2"/>',
  ruler: '<path d="M3 17 17 3l4 4L7 21z"/><path d="M7 13l2 2M10 10l2 2M13 7l2 2"/>',
  calc: '<rect x="5" y="3" width="14" height="18" rx="3"/><path d="M8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01"/>',
  plate: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/>',
  sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  download: '<path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14"/>',
  upload: '<path d="M12 20V9m0 0-4 4m4-4 4 4M5 4h14"/>',
  flag: '<path d="M5 21V4m0 0h11l-2 4 2 4H5"/>',
  repeat: '<path d="M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 0 1-4 4H4"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8M9 17h6"/>',
  sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  play: '<path d="M7 4.5v15l13-7.5z"/>',
  compare: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M12 4v16"/>'
};
const icon = (n, c = 'ic') => `<svg class="${c}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`;

// ---------- biblioteca de exercícios e padrões de força ----------
// Limiares (múltiplos do peso corporal no 1RM estimado) para Bronze…Titã.
// Abaixo do primeiro limiar = Ferro. "reps" usa repetições máximas numa série.
const STD = {
  bench: [.5, .75, 1, 1.25, 1.5, 1.75, 2],
  squat: [.75, 1, 1.25, 1.5, 1.85, 2.25, 2.6],
  dead: [1, 1.25, 1.5, 1.85, 2.2, 2.6, 3],
  ohp: [.35, .5, .65, .8, .95, 1.1, 1.3],
  row: [.5, .7, .9, 1.1, 1.35, 1.6, 1.85],
  curl: [.25, .35, .5, .6, .75, .9, 1],
  bar: [.4, .6, .8, 1, 1.2, 1.4, 1.7],
  db: [.18, .25, .35, .45, .55, .65, .75],
  dbs: [.06, .1, .15, .2, .25, .3, .36],
  machine: [.5, .8, 1.1, 1.4, 1.75, 2.1, 2.5],
  legpress: [1.2, 1.8, 2.4, 3, 3.6, 4.3, 5],
  cable: [.25, .4, .55, .7, .85, 1, 1.2],
  reps: [1, 5, 8, 12, 16, 20, 26]
};
const RANKS = ['Ferro', 'Bronze', 'Prata', 'Ouro', 'Platina', 'Diamante', 'Campeão', 'Titã'];
const RANK_SHORT = ['FE', 'BR', 'PR', 'OU', 'PL', 'DI', 'CA', 'TI'];
const MUSCLES = ['Peito', 'Costas', 'Ombros', 'Bíceps', 'Tríceps', 'Pernas', 'Glúteos', 'Core'];
const MUSCLE_EMOJI = { Peito: '🛡️', Costas: '🦅', Ombros: '🍈', 'Bíceps': '💪', 'Tríceps': '⚡', Pernas: '🦵', 'Glúteos': '🍑', Core: '🍫' };
const TYPES = { bar: 'Barra', db: 'Halteres', machine: 'Máquina', cable: 'Polia', reps: 'Peso corporal' };

const LIB = [
  ['supino', 'Supino reto', 'Peito', 'bench'],
  ['supino-inc', 'Supino inclinado', 'Peito', 'bench', .85],
  ['supino-hal', 'Supino com halteres', 'Peito', 'db'],
  ['crucifixo', 'Crucifixo', 'Peito', 'dbs', 1.3],
  ['crossover', 'Crossover', 'Peito', 'cable', .7],
  ['peck-deck', 'Peck deck', 'Peito', 'machine', .7],
  ['flexao', 'Flexão', 'Peito', 'reps', 2.2],
  ['barra-fixa', 'Barra fixa', 'Costas', 'reps'],
  ['puxada', 'Puxada frontal', 'Costas', 'cable', 1.35],
  ['remada', 'Remada curvada', 'Costas', 'row'],
  ['remada-baixa', 'Remada baixa', 'Costas', 'cable', 1.3],
  ['remada-uni', 'Remada unilateral', 'Costas', 'db', 1.2],
  ['terra', 'Levantamento terra', 'Costas', 'dead'],
  ['desenv', 'Desenvolvimento militar', 'Ombros', 'ohp'],
  ['desenv-hal', 'Desenvolvimento c/ halteres', 'Ombros', 'db', .85],
  ['elev-lat', 'Elevação lateral', 'Ombros', 'dbs', .85],
  ['face-pull', 'Face pull', 'Ombros', 'cable', .7],
  ['rosca', 'Rosca direta', 'Bíceps', 'curl'],
  ['rosca-alt', 'Rosca alternada', 'Bíceps', 'dbs'],
  ['rosca-mart', 'Rosca martelo', 'Bíceps', 'dbs', 1.05],
  ['rosca-scott', 'Rosca Scott', 'Bíceps', 'curl', .85],
  ['triceps-pulley', 'Tríceps pulley', 'Tríceps', 'cable', 1.05],
  ['triceps-testa', 'Tríceps testa', 'Tríceps', 'curl', .9],
  ['triceps-frances', 'Tríceps francês', 'Tríceps', 'dbs', 1.2],
  ['mergulho', 'Mergulho', 'Tríceps', 'reps', 1.2],
  ['agacha', 'Agachamento livre', 'Pernas', 'squat'],
  ['leg-press', 'Leg press', 'Pernas', 'legpress'],
  ['extensora', 'Cadeira extensora', 'Pernas', 'machine', .7],
  ['flexora', 'Mesa flexora', 'Pernas', 'machine', .55],
  ['stiff', 'Stiff', 'Pernas', 'dead', .75],
  ['bulgaro', 'Agachamento búlgaro', 'Pernas', 'db', .7],
  ['panturrilha', 'Panturrilha em pé', 'Pernas', 'machine', 1],
  ['hip-thrust', 'Hip thrust', 'Glúteos', 'legpress', .7],
  ['abducao', 'Cadeira abdutora', 'Glúteos', 'machine', .6],
  ['gluteo-polia', 'Glúteo na polia', 'Glúteos', 'cable', .5],
  ['abd-polia', 'Abdominal na polia', 'Core', 'cable', .8],
  ['elev-pernas', 'Elevação de pernas', 'Core', 'reps', 1.1],
  ['abd-supra', 'Abdominal supra', 'Core', 'reps', 2.4]
].map(([id, name, muscle, std, f]) => ({ id, name, muscle, std, f: f || 1 }));

const exercises = () => LIB.concat(S.custom);
const exById = id => exercises().find(e => e.id === id) || { id, name: 'Exercício removido', muscle: 'Core', std: 'bar', f: 1 };
const isReps = ex => ex.std === 'reps';

// ---------- dados ----------
const KEY = 'carga.v1';
const DEFAULTS = () => ({
  v: 1,
  workouts: [], routines: [], custom: [], body: [], measures: [], goals: [], badges: {}, photoCount: 0,
  settings: { name: '', sex: 'm', bw: 75, weekGoal: 3, rest: 90, bar: 20 },
  active: null
});
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const d = JSON.parse(raw); const base = DEFAULTS(); return { ...base, ...d, settings: { ...base.settings, ...d.settings } }; }
  } catch { }
  return DEFAULTS();
}
let S = load();
let rev = 0; // muda a cada save → invalida memos
function save() { rev++; try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { toast('Não consegui salvar no aparelho', '⚠️'); } }
let saveT;
const saveSoon = () => { clearTimeout(saveT); saveT = setTimeout(save, 300); };

const memo = fn => { let r = -1, v; return () => (r === rev ? v : (r = rev, v = fn())); };

// ---------- cálculos ----------
const e1rm = (kg, reps) => (!kg || !reps) ? 0 : reps === 1 ? kg : kg * (1 + Math.min(reps, 15) / 30);
const bodyweight = () => { const b = [...S.body].sort((a, z) => z.d - a.d)[0]; return b ? b.kg : S.settings.bw; };
const sorted = memo(() => [...S.workouts].sort((a, b) => a.start - b.start));
const workoutVolume = w => w.exercises.reduce((t, e) => t + e.sets.reduce((s, x) => s + (x.kg || 0) * (x.reps || 0), 0), 0);
const setCount = w => w.exercises.reduce((t, e) => t + e.sets.length, 0);

// Histórico agregado por exercício: uma entrada por treino.
const historyAll = memo(() => {
  const h = {};
  for (const w of sorted()) {
    for (const e of w.exercises) {
      if (!e.sets.length) continue;
      let best = 0, maxKg = 0, vol = 0, maxReps = 0;
      for (const s of e.sets) {
        best = Math.max(best, e1rm(s.kg, s.reps)); maxKg = Math.max(maxKg, s.kg || 0);
        vol += (s.kg || 0) * (s.reps || 0); maxReps = Math.max(maxReps, s.reps || 0);
      }
      (h[e.exId] = h[e.exId] || []).push({ d: w.start, wid: w.id, best, maxKg, vol, maxReps, sets: e.sets });
    }
  }
  return h;
});
const history = id => historyAll()[id] || [];
const scoreOf = (ex, h) => isReps(ex) ? h.maxReps : h.best;

// Recordes: toda vez que um treino supera o melhor anterior (o primeiro treino só cria a base).
const prEvents = memo(() => {
  const best = {}, out = [];
  for (const w of sorted()) {
    for (const e of w.exercises) {
      const ex = exById(e.exId); const h = history(e.exId).find(x => x.wid === w.id); if (!h) continue;
      const sc = scoreOf(ex, h);
      if (best[e.exId] !== undefined && sc > best[e.exId] + 1e-9) out.push({ d: w.start, wid: w.id, exId: e.exId, value: sc, prev: best[e.exId] });
      best[e.exId] = Math.max(best[e.exId] ?? 0, sc);
    }
  }
  return out;
});

function records(id) {
  const h = history(id); const r = { best: 0, maxKg: 0, vol: 0, maxReps: 0, bestSet: null };
  for (const x of h) for (const s of x.sets) {
    const v = e1rm(s.kg, s.reps);
    if (v > r.best) { r.best = v; r.bestSet = s; }
    r.maxKg = Math.max(r.maxKg, s.kg || 0); r.maxReps = Math.max(r.maxReps, s.reps || 0);
    r.vol = Math.max(r.vol, (s.kg || 0) * (s.reps || 0));
  }
  return r;
}

function thresholds(ex) {
  const sexF = S.settings.sex === 'f' ? (isReps(ex) ? .55 : .62) : 1;
  const base = STD[ex.std] || STD.bar;
  return base.map(v => isReps(ex) ? Math.max(1, Math.round(v * ex.f * sexF)) : v * ex.f * sexF * bodyweight());
}
function rankOf(ex, value) {
  const t = thresholds(ex); let i = 0; while (i < t.length && value >= t[i]) i++;
  const prev = i ? t[i - 1] : 0, next = t[i];
  return { i, name: RANKS[i], next, nextName: RANKS[i + 1], progress: next === undefined ? 1 : clamp((value - prev) / (next - prev), 0, 1), missing: next === undefined ? 0 : next - value };
}
const exRank = id => { const ex = exById(id); const r = records(id); return rankOf(ex, isReps(ex) ? r.maxReps : r.best); };

function muscleRanks() {
  const out = {};
  for (const id of Object.keys(historyAll())) {
    const ex = exById(id); const r = exRank(id);
    const cur = out[ex.muscle];
    if (!cur || r.i + r.progress > cur.r.i + cur.r.progress) out[ex.muscle] = { ex, r };
  }
  return out;
}
function overallRank() {
  const m = Object.values(muscleRanks());
  if (!m.length) return null;
  const score = m.reduce((t, x) => t + x.r.i + x.r.progress * .999, 0) / m.length;
  const i = Math.floor(score);
  return { i, name: RANKS[i], progress: i >= 7 ? 1 : score - i, nextName: RANKS[i + 1], groups: m.length };
}

const weekCounts = memo(() => { const m = {}; for (const w of S.workouts) { const k = weekStart(w.start); m[k] = (m[k] || 0) + 1; } return m; });
function streak() {
  const goal = S.settings.weekGoal, wc = weekCounts();
  let k = weekStart(Date.now()), n = 0;
  if ((wc[k] || 0) >= goal) n++;
  k = weekStart(k - 3 * DAY);
  // semana atual ainda em andamento não quebra a sequência
  while ((wc[k] || 0) >= goal) { n++; k = weekStart(k - 3 * DAY); }
  return n;
}
function bestStreak() {
  const goal = S.settings.weekGoal, wc = weekCounts();
  const keys = Object.keys(wc).map(Number).filter(k => wc[k] >= goal).sort((a, b) => a - b);
  let best = 0, cur = 0, last = null;
  for (const k of keys) { cur = last !== null && Math.round((k - last) / (7 * DAY)) === 1 ? cur + 1 : 1; best = Math.max(best, cur); last = k; }
  return best;
}

function lastSetsFor(exId, excludeId) {
  const h = history(exId).filter(x => x.wid !== excludeId);
  return h.length ? h[h.length - 1].sets : [];
}

// ---------- conquistas ----------
const BADGES = [
  ['first', '🚀', 'Decolagem', 'Primeiro treino registrado', c => c.n >= 1],
  ['w10', '🔟', 'Pegou o ritmo', '10 treinos', c => c.n >= 10],
  ['w50', '🏅', 'Rato de academia', '50 treinos', c => c.n >= 50],
  ['w100', '💯', 'Centurião', '100 treinos', c => c.n >= 100],
  ['st4', '🔥', 'Pegando fogo', '4 semanas seguidas batendo a meta', c => c.streak >= 4],
  ['st12', '☄️', 'Imparável', '12 semanas seguidas batendo a meta', c => c.streak >= 12],
  ['ton', '🐘', 'Uma tonelada', '1.000 kg de volume num treino', c => c.maxVol >= 1000],
  ['ton10', '🐋', 'Baleia', '10.000 kg de volume num treino', c => c.maxVol >= 10000],
  ['pr1', '⭐', 'Primeiro recorde', 'Bater um recorde pessoal', c => c.prs >= 1],
  ['pr25', '🌟', 'Colecionador', '25 recordes pessoais', c => c.prs >= 25],
  ['c100', '🦍', 'Clube dos 100', '100 kg no supino reto', c => records('supino').maxKg >= 100],
  ['c200', '🦬', 'Clube dos 200', '200 kg no terra', c => records('terra').maxKg >= 200],
  ['early', '🌅', 'Madrugador', 'Treinar antes das 7h', c => c.early],
  ['night', '🦉', 'Coruja', 'Treinar depois das 22h', c => c.night],
  ['long', '⏱️', 'Maratona', 'Treino de 90 min ou mais', c => c.long],
  ['photo', '📸', 'Sorria', 'Primeira foto de progresso', c => S.photoCount >= 1],
  ['weigh', '⚖️', 'Na balança', '10 pesagens registradas', c => S.body.length >= 10],
  ['goal', '🎯', 'Meta batida', 'Completar uma meta de carga', c => S.goals.some(g => g.doneAt)],
  ['gold', '🥇', 'Ouro', 'Chegar no rank Ouro em algum exercício', c => c.topRank >= 3],
  ['diamond', '💎', 'Diamante', 'Chegar no rank Diamante', c => c.topRank >= 5],
  ['total', '🏗️', 'Construtor', '100 toneladas de volume no total', c => c.totalVol >= 100000]
].map(([id, e, name, desc, test]) => ({ id, e, name, desc, test }));

function badgeCtx() {
  const ws = S.workouts;
  const ids = Object.keys(historyAll());
  return {
    n: ws.length,
    streak: Math.max(streak(), bestStreak()),
    maxVol: ws.reduce((m, w) => Math.max(m, workoutVolume(w)), 0),
    totalVol: ws.reduce((t, w) => t + workoutVolume(w), 0),
    prs: prEvents().length,
    early: ws.some(w => new Date(w.start).getHours() < 7),
    night: ws.some(w => new Date(w.start).getHours() >= 22),
    long: ws.some(w => (w.end - w.start) >= 90 * 60e3),
    topRank: ids.reduce((m, id) => Math.max(m, exRank(id).i), 0)
  };
}
function checkBadges(quiet) {
  const ctx = badgeCtx(); const fresh = [];
  for (const b of BADGES) if (!S.badges[b.id] && b.test(ctx)) { S.badges[b.id] = Date.now(); fresh.push(b); }
  if (fresh.length) {
    save();
    if (!quiet) fresh.forEach((b, i) => setTimeout(() => { toast(`Conquista: ${b.name}`, b.e); confetti({ count: 70 }); }, 900 + i * 1300));
  }
  return fresh;
}
function checkGoals() {
  let hit = [];
  for (const g of S.goals) {
    if (g.doneAt) continue;
    const ex = exById(g.exId); const r = records(g.exId);
    if ((isReps(ex) ? r.maxReps : r.maxKg) >= g.target) { g.doneAt = Date.now(); hit.push(g); }
  }
  if (hit.length) { save(); hit.forEach((g, i) => setTimeout(() => { toast(`Meta batida: ${exById(g.exId).name} ${fmt(g.target)}${isReps(exById(g.exId)) ? ' reps' : ' kg'}`, '🎯'); confetti({ count: 120 }); }, 600 + i * 1200)); }
}

// ---------- fotos (IndexedDB) ----------
const idb = (() => {
  let dbp;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open('carga-fotos', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('p', { keyPath: 'id' });
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  const tx = async (mode, fn) => { const db = await open(); return new Promise((res, rej) => { const t = db.transaction('p', mode); const req = fn(t.objectStore('p')); t.oncomplete = () => res(req && req.result); t.onerror = () => rej(t.error); }); };
  return {
    all: () => tx('readonly', s => s.getAll()).catch(() => []),
    put: p => tx('readwrite', s => s.put(p)),
    del: id => tx('readwrite', s => s.delete(id)),
    clear: () => tx('readwrite', s => s.clear()).catch(() => { })
  };
})();
async function resizeImage(file, max = 1080) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', .82);
  } finally { URL.revokeObjectURL(url); }
}

// ---------- toast / confete ----------
function toast(text, e = '✨', ms = 2600) {
  const t = document.createElement('div'); t.className = 'toast';
  t.innerHTML = `<span class="e">${e}</span><span>${esc(text)}</span>`;
  $('#toasts').appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 320); }, ms);
}

const confetti = (() => {
  const cv = $('#confetti'); const ctx = cv.getContext('2d'); let parts = [], raf = 0;
  const COLORS = ['#4f8cff', '#8b5cff', '#ffcf4d', '#ff8a3d', '#34d399', '#ff5c7a', '#ffffff'];
  function frame() {
    const dpr = devicePixelRatio || 1;
    if (cv.width !== innerWidth * dpr) { cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, innerWidth, innerHeight);
    parts = parts.filter(p => p.life > 0 && p.y < innerHeight + 40);
    for (const p of parts) {
      p.vy += .32; p.vx *= .985; p.vy *= .985; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life--;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.globalAlpha = Math.min(1, p.life / 30);
      ctx.fillStyle = p.c;
      if (p.round) { ctx.beginPath(); ctx.arc(0, 0, p.s / 2, 0, 7); ctx.fill(); }
      else ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2 * (1 + Math.sin(p.rot * 3)));
      ctx.restore();
    }
    raf = parts.length ? requestAnimationFrame(frame) : (ctx.clearRect(0, 0, innerWidth, innerHeight), 0);
  }
  return ({ x = innerWidth / 2, y = innerHeight * .35, count = 140, spread = 1 } = {}) => {
    if (reduceMotion) return;
    for (let i = 0; i < count; i++) {
      const a = -Math.PI / 2 + (Math.random() - .5) * Math.PI * 1.3 * spread, sp = 7 + Math.random() * 11;
      parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, rot: Math.random() * 6, vr: (Math.random() - .5) * .4, s: 7 + Math.random() * 7, c: COLORS[i % COLORS.length], life: 110 + Math.random() * 60, round: Math.random() < .3 });
    }
    if (!raf) raf = requestAnimationFrame(frame);
  };
})();

// ---------- sheets ----------
function openSheet(html, { onClose } = {}) {
  const w = document.createElement('div'); w.className = 'sheet-wrap';
  w.innerHTML = `<div class="sheet-bg"></div><div class="sheet" role="dialog"><div class="grab"></div>${html}</div>`;
  w._onClose = onClose;
  $('#sheets').appendChild(w);
  const sh = $('.sheet', w);
  [...sh.children].forEach((c, i) => c.style.setProperty('--i', i));
  requestAnimationFrame(() => requestAnimationFrame(() => w.classList.add('open')));
  $('.sheet-bg', w).addEventListener('click', () => closeSheet(w));
  dragToClose(w, sh);
  return w;
}
function closeSheet(w) {
  w = w || $$('#sheets .sheet-wrap:not(.closing)').pop(); if (!w || w.classList.contains('closing')) return;
  w.classList.add('closing'); w.classList.remove('open');
  const sh = $('.sheet', w); sh.style.transform = '';
  setTimeout(() => { w.remove(); w._onClose && w._onClose(); }, 320);
}
function dragToClose(w, sh) {
  let y0 = null, dy = 0;
  sh.addEventListener('pointerdown', e => {
    const top = sh.getBoundingClientRect().top;
    if (sh.scrollTop > 0 || e.clientY - top > 70 || e.target.closest('input,button,select,textarea')) return;
    y0 = e.clientY; dy = 0; sh.style.transition = 'none'; sh.setPointerCapture(e.pointerId);
  });
  sh.addEventListener('pointermove', e => {
    if (y0 === null) return; dy = Math.max(0, e.clientY - y0);
    // resistência elástica ao puxar
    sh.style.transform = `translate(-50%, ${dy < 0 ? 0 : dy * .9}px)`;
  });
  const end = () => {
    if (y0 === null) return; y0 = null; sh.style.transition = '';
    if (dy > 110) closeSheet(w); else sh.style.transform = '';
  };
  sh.addEventListener('pointerup', end); sh.addEventListener('pointercancel', end);
}
function confirmSheet(title, text, ok = 'Confirmar', danger = true) {
  return new Promise(res => {
    let done = false;
    const w = openSheet(`<h2>${esc(title)}</h2><p class="lead">${esc(text)}</p>
      <div class="row" style="gap:10px"><button class="btn grow" data-x="no">Cancelar</button><button class="btn grow ${danger ? 'danger' : 'primary'}" data-x="yes">${esc(ok)}</button></div>`,
      { onClose: () => { if (!done) res(false); } });
    w.addEventListener('click', e => { const b = e.target.closest('[data-x]'); if (!b) return; done = true; res(b.dataset.x === 'yes'); closeSheet(w); });
  });
}

// ---------- gráficos SVG ----------
function lineChart(el, pts, { unit = 'kg', dec = 1, color } = {}) {
  el.innerHTML = '';
  const W = el.clientWidth || 320, H = el.clientHeight || 200;
  if (pts.length < 2) {
    el.innerHTML = `<div class="empty" style="padding:50px 0"><p>${pts.length ? 'Treine mais uma vez para ver a curva 📈' : 'Sem dados nesse período'}</p></div>`;
    return;
  }
  const pad = { l: 34, r: 12, t: 26, b: 22 };
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  let y0 = Math.min(...ys), y1 = Math.max(...ys); const span = (y1 - y0) || Math.max(1, y1 * .1);
  y0 -= span * .15; y1 += span * .15;
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const X = x => pad.l + (x - x0) / ((x1 - x0) || 1) * (W - pad.l - pad.r);
  const Y = y => pad.t + (1 - (y - y0) / (y1 - y0)) * (H - pad.t - pad.b);
  const P = pts.map(p => [X(p.x), Y(p.y)]);
  // curva suave (Catmull-Rom → Bézier)
  let d = `M${P[0][0]},${P[0][1]}`;
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[i - 1] || P[i], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p2[0]},${p2[1]}`;
  }
  const area = `${d} L${P[P.length - 1][0]},${H - pad.b} L${P[0][0]},${H - pad.b} Z`;
  const ticks = [0, .5, 1].map(f => y0 + (y1 - y0) * (.15 + f * .7) / 1);
  const c1 = color || '#4f8cff', c2 = color || '#8b5cff';
  const step = Math.max(1, Math.ceil(pts.length / 18));
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}">
    <defs>
      <linearGradient id="lg" x1="0" x2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>
      <linearGradient id="la" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${c2}" stop-opacity=".35"/><stop offset="1" stop-color="${c2}" stop-opacity="0"/></linearGradient>
    </defs>
    ${ticks.map(t => `<line class="grid" x1="${pad.l}" x2="${W - pad.r}" y1="${Y(t)}" y2="${Y(t)}"/><text class="ax" x="${pad.l - 6}" y="${Y(t) + 3}" text-anchor="end">${fmt(t, t > 100 ? 0 : dec)}</text>`).join('')}
    <text class="ax" x="${pad.l}" y="${H - 4}">${fmtDate(x0)}</text><text class="ax" x="${W - pad.r}" y="${H - 4}" text-anchor="end">${fmtDate(x1)}</text>
    <path class="area" d="${area}" fill="url(#la)"/>
    <path class="line" d="${d}"/>
    <line class="cursor" x1="0" x2="0" y1="${pad.t - 8}" y2="${H - pad.b}" opacity="0"/>
    ${P.map((p, i) => (i % step === 0 || i === P.length - 1 || pts[i].pr) ? `<circle class="pt ${pts[i].pr ? 'pr' : ''}" cx="${p[0]}" cy="${p[1]}" r="${pts[i].pr ? 5 : 4}" style="animation-delay:${300 + i / P.length * 900}ms"/>` : '').join('')}
  </svg><div class="tip" style="opacity:0"></div>`;
  const path = $('.line', el);
  const len = path.getTotalLength();
  path.style.strokeDasharray = len; path.style.strokeDashoffset = reduceMotion ? 0 : len;
  anim(path, [{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: 1300, easing: 'cubic-bezier(.3,.7,.2,1)', fill: 'forwards' });
  if (reduceMotion) path.style.strokeDashoffset = 0;
  const tip = $('.tip', el), cur = $('.cursor', el);
  const move = e => {
    const r = el.getBoundingClientRect(); const x = (e.clientX - r.left) * (W / r.width);
    let bi = 0; P.forEach((p, i) => { if (Math.abs(p[0] - x) < Math.abs(P[bi][0] - x)) bi = i; });
    const p = pts[bi];
    tip.style.opacity = 1; tip.style.left = (P[bi][0] / W * 100) + '%';
    tip.innerHTML = `${fmt(p.y, dec)} ${unit}${p.pr ? ' 🏆' : ''}<small>${fmtDate(p.x, { day: '2-digit', month: 'short', year: '2-digit' })}</small>`;
    cur.setAttribute('x1', P[bi][0]); cur.setAttribute('x2', P[bi][0]); cur.setAttribute('opacity', 1);
  };
  el.onpointerdown = el.onpointermove = move;
  el.onpointerleave = () => { tip.style.opacity = 0; cur.setAttribute('opacity', 0); };
}
function sparkline(vals, up) {
  if (vals.length < 2) return '';
  const W = 72, H = 30, mn = Math.min(...vals), mx = Math.max(...vals), sp = (mx - mn) || 1;
  const d = vals.map((v, i) => `${i ? 'L' : 'M'}${(i / (vals.length - 1) * (W - 4) + 2).toFixed(1)},${(H - 3 - (v - mn) / sp * (H - 6)).toFixed(1)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 ${W} ${H}"><path d="${d}" stroke="${up ? '#34d399' : '#8b90a0'}"/></svg>`;
}

// contagem animada dos números
function countUps(root) {
  $$('[data-count]', root).forEach(el => {
    const to = parseFloat(el.dataset.count), dec = +(el.dataset.dec || 0);
    if (reduceMotion || !isFinite(to)) { el.textContent = fmt(to, dec); return; }
    const t0 = performance.now(), dur = 1100;
    const step = t => {
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(2, -10 * k);
      el.textContent = fmt(to * (k >= 1 ? 1 : e), dec);
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}
const rankBadge = (i, cls = '', delay = 0) => `<div class="rank r${i} ${cls}" style="--sd:${delay}s">${RANK_SHORT[i]}</div>`;

// =========================================================================
//   Telas
// =========================================================================
const view = { tab: 'home', ex: null, range: '6m', metric: 'best', muscle: 'Todos', bodyRange: 'all' };
const sel = new Set(); // fotos selecionadas

function render(still) {
  const scr = $('#screen');
  const html = ({ home: Home, progress: view.ex ? ExerciseDetail : Progress, body: Body, profile: Profile })[view.tab]();
  scr.innerHTML = html;
  [...scr.children].forEach((c, i) => { c.style.setProperty('--i', i); if (still) c.style.animation = 'none'; });
  $$('.tab').forEach(t => t.classList.toggle('on', t.dataset.tab === view.tab));
  moveBlob();
  countUps(scr);
  requestAnimationFrame(() => after[view.tab] && after[view.tab]());
  $$('.bar > i', scr).forEach(b => { const w = b.dataset.w; requestAnimationFrame(() => requestAnimationFrame(() => b.style.width = w)); });
}
function moveBlob() {
  const on = $(`.tab[data-tab="${view.tab}"]`), blob = $('#tabBlob');
  if (!on) return;
  blob.style.left = (on.offsetLeft + on.offsetWidth / 2 - 32) + 'px';
}
const after = {
  progress() {
    if (!view.ex) return;
    drawExerciseChart();
  },
  body() { drawBodyChart(); loadPhotos(); }
};

// ---------- Início ----------
function Home() {
  const name = S.settings.name;
  const hour = new Date().getHours();
  const hi = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  if (!S.workouts.length && !S.active) {
    return `<div class="top"><div><div class="sub">${hi}${name ? ', ' + esc(name) : ''} 👋</div><h1>Carga</h1></div></div>
    <div class="card hero empty">
      <div class="big">🏋️</div>
      <h3>Bora começar?</h3>
      <p>Registre seu primeiro treino e acompanhe cada quilo que você sobe.</p>
      <button class="btn primary block" data-act="start">${icon('play')} Começar treino</button>
      <button class="btn ghost block" data-act="demo" style="margin-top:6px">Ver com dados de exemplo</button>
    </div>
    ${tipsCard()}`;
  }
  const st = streak(), goal = S.settings.weekGoal;
  const ws = weekStart(Date.now());
  const thisWeek = S.workouts.filter(w => w.start >= ws);
  const daysDone = new Set(thisWeek.map(w => Math.round((dayStart(w.start) - ws) / DAY)));
  const todayIdx = Math.round((dayStart(Date.now()) - ws) / DAY);
  const month = S.workouts.filter(w => w.start >= Date.now() - 30 * DAY);
  const vol7 = S.workouts.filter(w => w.start >= Date.now() - 7 * DAY).reduce((t, w) => t + workoutVolume(w), 0);
  const prs30 = prEvents().filter(p => p.d >= Date.now() - 30 * DAY);
  const recentPR = [...prEvents()].reverse().slice(0, 3);
  const goals = S.goals.filter(g => !g.doneAt).slice(0, 3);
  const last = [...sorted()].reverse().slice(0, 4);

  return `<div class="top"><div><div class="sub">${hi}${name ? ', ' + esc(name) : ''} 👋</div><h1>Carga</h1></div>
      <button class="icon-btn" data-tab-go="profile" aria-label="Perfil">${icon('user')}</button></div>
    <div class="card hero">
      <div class="streak">
        <div class="fire ${st ? '' : 'off'}">🔥</div>
        <div class="grow"><div class="num"><span data-count="${st}">0</span> <span class="muted" style="font-size:18px">sem${st === 1 ? 'ana' : 'anas'}</span></div>
        <div class="muted small b">${st ? 'de sequência batendo a meta' : 'Bata a meta da semana pra começar a sequência'}</div></div>
      </div>
      <div class="row between" style="margin-top:14px"><span class="small b">Essa semana</span><span class="small muted b">${thisWeek.length}/${goal} treinos</span></div>
      <div class="bar" style="margin-top:8px"><i data-w="${Math.min(100, thisWeek.length / goal * 100)}%"></i></div>
      <div class="week">${['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map((l, i) => `<div class="d ${daysDone.has(i) ? 'done' : ''} ${i === todayIdx ? 'today' : ''}" style="--i:${i}"><div class="dot">${daysDone.has(i) ? '✓' : ''}</div><div class="l">${l}</div></div>`).join('')}</div>
    </div>
    ${S.active ? `<button class="card press row" data-act="resume" style="margin-top:12px;width:100%;text-align:left;border-color:rgba(79,140,255,.4)">
      <div class="go-btn live" style="margin:0;width:44px;height:44px;border-radius:14px">${icon('dumbbell')}</div>
      <div class="grow"><div class="b">Treino em andamento</div><div class="muted small">${esc(S.active.name)} · toque pra voltar</div></div>${icon('chev', 'ic chev')}</button>` : ''}
    <div class="grid3" style="margin-top:12px">
      <div class="card tight stat"><div class="v"><span data-count="${month.length}">0</span></div><div class="k">treinos / 30d</div></div>
      <div class="card tight stat"><div class="v">${vol7 >= 1000 ? `<span data-count="${vol7 / 1000}" data-dec="1">0</span><small>t</small>` : `<span data-count="${vol7}">0</span><small>kg</small>`}</div><div class="k">volume / 7d</div></div>
      <div class="card tight stat"><div class="v"><span data-count="${prs30.length}">0</span></div><div class="k">recordes / 30d</div></div>
    </div>
    <div class="h2">Frequência <span class="muted" style="letter-spacing:0;text-transform:none;font-size:12px">últimas 20 semanas</span></div>
    <div class="card tight">${heatmap()}</div>
    ${recentPR.length ? `<div class="h2">Recordes recentes 🏆</div>
      ${recentPR.map(p => { const ex = exById(p.exId); return `<button class="list-item press" data-act="open-ex" data-id="${p.exId}">
        <div class="ava">${MUSCLE_EMOJI[ex.muscle]}</div>
        <div class="grow"><div class="b ellipsis">${esc(ex.name)}</div><div class="muted small">${relDay(p.d)} · ${isReps(ex) ? `${p.value} reps` : `1RM est. ${fmt(p.value)} kg`}</div></div>
        <span class="pr-tag">+${fmt(p.value - p.prev)}${isReps(ex) ? '' : ' kg'}</span></button>`; }).join('')}` : ''}
    ${goals.length ? `<div class="h2">Metas <button class="link" data-tab-go="progress">ver todas</button></div>
      <div class="card">${goals.map(goalRow).join('<div style="height:14px"></div>')}</div>` : ''}
    <div class="h2">Últimos treinos</div>
    ${last.map(w => `<button class="list-item press" data-act="open-wo" data-id="${w.id}">
      <div class="ava">${MUSCLE_EMOJI[exById(w.exercises[0]?.exId).muscle] || '🏋️'}</div>
      <div class="grow"><div class="b ellipsis">${esc(w.name)}</div><div class="muted small">${relDay(w.start)} · ${fmtDur((w.end - w.start) / 1000)} · ${fmtVol(workoutVolume(w))}</div></div>
      ${prEvents().some(p => p.wid === w.id) ? '<span class="pr-tag">PR</span>' : ''}${icon('chev', 'ic chev')}</button>`).join('')}`;
}
function tipsCard() {
  return `<div class="h2">O que tem aqui</div><div class="card">
    ${[['📈', 'Gráfico de carga e 1RM estimado de cada exercício'], ['💎', 'Ranks de Ferro a Titã baseados no seu peso'], ['🏆', 'Recordes automáticos com confete'], ['🔥', 'Sequência semanal e calendário'], ['⚖️', 'Peso, medidas e fotos de progresso'], ['⏱️', 'Timer de descanso, metas e conquistas']]
      .map(([e, t]) => `<div class="row" style="padding:7px 0"><span style="font-size:22px">${e}</span><span class="small b">${t}</span></div>`).join('')}</div>`;
}
function heatmap() {
  const weeks = 20, now = Date.now(), ws = weekStart(now);
  const byDay = {};
  for (const w of S.workouts) { const k = dayStart(w.start); byDay[k] = (byDay[k] || 0) + workoutVolume(w) + 1; }
  const mx = Math.max(1, ...Object.values(byDay));
  let cells = '', n = 0;
  for (let k = 0; k < weeks; k++) {
    const wk = ws - k * 7 * DAY;
    for (let d = 0; d < 7; d++) {
      // uma hora de folga absorve o horário de verão
      const day = dayStart(wk + d * DAY + 3600e3); const v = byDay[day] || 0;
      const lv = !v ? '' : v / mx > .75 ? 'l4' : v / mx > .5 ? 'l3' : v / mx > .25 ? 'l2' : 'l1';
      cells += `<div class="c ${lv} ${day > now ? 'fut' : ''}" style="--i:${n++}" title="${fmtDate(day)}"></div>`;
    }
  }
  return `<div class="heat">${cells}</div>`;
}
function goalRow(g) {
  const ex = exById(g.exId); const r = records(g.exId); const cur = isReps(ex) ? r.maxReps : r.maxKg;
  const u = isReps(ex) ? ' reps' : ' kg';
  const p = clamp(cur / g.target, 0, 1);
  return `<div><div class="row between small"><span class="b ellipsis">${g.doneAt ? '✅ ' : '🎯 '}${esc(ex.name)}</span><span class="muted b">${fmt(cur)} / ${fmt(g.target)}${u}</span></div>
    <div class="bar gold" style="margin-top:8px"><i data-w="${p * 100}%"></i></div></div>`;
}

// ---------- Progresso ----------
function Progress() {
  const ids = Object.keys(historyAll());
  if (!ids.length) return `<div class="top"><h1>Progresso</h1></div>
    <div class="card empty"><div class="big">📈</div><h3>Nada por aqui ainda</h3><p>Assim que você registrar um treino, cada exercício ganha gráfico, recordes e rank.</p><button class="btn primary block" data-act="start">${icon('play')} Começar treino</button></div>`;
  const list = ids.map(id => ({ ex: exById(id), h: history(id) }))
    .filter(x => view.muscle === 'Todos' || x.ex.muscle === view.muscle)
    .sort((a, b) => b.h[b.h.length - 1].d - a.h[a.h.length - 1].d);
  const musclesUsed = MUSCLES.filter(m => ids.some(id => exById(id).muscle === m));
  // séries por grupo muscular nos últimos 7 dias
  const since = Date.now() - 7 * DAY, sets = {};
  for (const w of S.workouts) if (w.start >= since) for (const e of w.exercises) { const m = exById(e.exId).muscle; sets[m] = (sets[m] || 0) + e.sets.length; }
  const mxSets = Math.max(10, ...Object.values(sets));
  return `<div class="top"><div><div class="sub">${ids.length} exercícios acompanhados</div><h1>Progresso</h1></div></div>
    <div class="card">
      <div class="row between"><span class="b">Séries por grupo · 7 dias</span><span class="muted tiny b">ideal ~10–20</span></div>
      <div style="margin-top:12px">${MUSCLES.map(m => `<div class="row" style="margin-top:8px"><span class="small b" style="width:74px">${MUSCLE_EMOJI[m]} ${m}</span><div class="bar grow"><i data-w="${(sets[m] || 0) / mxSets * 100}%"></i></div><span class="small b muted" style="width:22px;text-align:right">${sets[m] || 0}</span></div>`).join('')}</div>
    </div>
    ${S.goals.length ? `<div class="h2">Metas</div><div class="card">${S.goals.map(goalRow).join('<div style="height:14px"></div>')}</div>` : ''}
    <div class="h2">Exercícios</div>
    <div class="chips" style="margin-bottom:12px">${['Todos', ...musclesUsed].map(m => `<button class="chip ${view.muscle === m ? 'on' : ''}" data-act="muscle" data-m="${m}">${m}</button>`).join('')}</div>
    <div>${list.map(({ ex, h }, i) => {
      const r = exRank(ex.id); const rec = records(ex.id);
      const vals = h.slice(-8).map(x => scoreOf(ex, x));
      const up = vals.length > 1 && vals[vals.length - 1] >= vals[0];
      return `<button class="list-item press" data-act="open-ex" data-id="${ex.id}" style="animation:rise .6s var(--spring) both;animation-delay:${i * 40}ms">
        ${rankBadge(r.i, '', (i % 5) * .4)}
        <div class="grow"><div class="b ellipsis">${esc(ex.name)}</div>
        <div class="muted small"><span class="rank-name r${r.i} b">${r.name}</span> · ${isReps(ex) ? `${rec.maxReps} reps` : `${fmt(rec.maxKg)} kg · 1RM ${fmt(rec.best, 0)}`}</div></div>
        ${sparkline(vals, up)}</button>`;
    }).join('')}</div>`;
}

function ExerciseDetail() {
  const ex = exById(view.ex); const rec = records(ex.id); const r = exRank(ex.id); const h = history(ex.id);
  const reps = isReps(ex); const goal = S.goals.find(g => g.exId === ex.id && !g.doneAt);
  const metrics = reps ? [['maxReps', 'Reps máx.'], ['vol', 'Volume']] : [['best', '1RM est.'], ['maxKg', 'Carga máx.'], ['vol', 'Volume']];
  if (!metrics.some(m => m[0] === view.metric)) view.metric = metrics[0][0];
  const prW = new Set(prEvents().filter(p => p.exId === ex.id).map(p => p.wid));
  return `<div class="top"><button class="icon-btn" data-act="back">${icon('back')}</button>
      <div class="grow" style="margin-left:12px;min-width:0"><div class="sub">${MUSCLE_EMOJI[ex.muscle]} ${ex.muscle}</div><h1 class="ellipsis" style="font-size:24px">${esc(ex.name)}</h1></div></div>
    <div class="card hero" style="text-align:center">
      <div style="display:flex;justify-content:center">${rankBadge(r.i, 'lg')}</div>
      <div class="rank-name r${r.i} xb" style="font-size:24px;margin-top:10px">${r.name}</div>
      ${r.next !== undefined
        ? `<div class="muted small b" style="margin:4px 0 12px">Faltam ${reps ? `${Math.ceil(r.missing)} reps` : `${fmt(r.missing)} kg no 1RM`} para <span class="rank-name r${r.i + 1}">${r.nextName}</span></div>
           <div class="bar"><i data-w="${r.progress * 100}%"></i></div>`
        : `<div class="muted small b" style="margin-top:4px">Rank máximo. Lenda. 👑</div>`}
      <div class="tiny dim b" style="margin-top:10px">Baseado em ${reps ? 'repetições máximas' : `1RM estimado ÷ peso corporal (${fmt(bodyweight())} kg)`}</div>
    </div>
    <div class="card" style="margin-top:12px">
      <div class="seg" id="metricSeg">${metrics.map(([k, l]) => `<button class="${view.metric === k ? 'on' : ''}" data-act="metric" data-k="${k}">${l}</button>`).join('')}<div class="seg-pill"></div></div>
      <div class="chart" id="exChart"></div>
      <div class="chips" style="justify-content:center;margin-top:6px">${[['1m', '1M'], ['3m', '3M'], ['6m', '6M'], ['1a', '1A'], ['all', 'Tudo']].map(([k, l]) => `<button class="chip ${view.range === k ? 'on' : ''}" data-act="range" data-k="${k}">${l}</button>`).join('')}</div>
    </div>
    <div class="h2">Recordes pessoais</div>
    <div class="grid2">
      ${reps ? `<div class="card tight stat"><div class="v"><span data-count="${rec.maxReps}">0</span><small>reps</small></div><div class="k">Mais repetições</div></div>
               <div class="card tight stat"><div class="v"><span data-count="${h.length}">0</span></div><div class="k">Treinos</div></div>`
             : `<div class="card tight stat"><div class="v"><span data-count="${rec.maxKg}" data-dec="1">0</span><small>kg</small></div><div class="k">Carga máxima</div></div>
               <div class="card tight stat"><div class="v"><span data-count="${rec.best}" data-dec="1">0</span><small>kg</small></div><div class="k">1RM estimado</div></div>
               <div class="card tight stat"><div class="v"><span data-count="${rec.vol}">0</span><small>kg</small></div><div class="k">Melhor série (kg×reps)</div></div>
               <div class="card tight stat"><div class="v"><span data-count="${rec.maxReps}">0</span><small>reps</small></div><div class="k">Mais repetições</div></div>`}
    </div>
    <div class="h2">Meta</div>
    ${goal ? `<div class="card">${goalRow(goal)}<div class="row" style="margin-top:12px;gap:8px"><button class="btn sm grow" data-act="goal" data-id="${ex.id}">${icon('edit')} Editar</button><button class="btn sm danger" data-act="goal-del" data-id="${goal.id}">${icon('trash')}</button></div></div>`
           : `<button class="list-item press" data-act="goal" data-id="${ex.id}"><div class="ava">🎯</div><div class="grow"><div class="b">Definir meta</div><div class="muted small">Ex.: ${reps ? '15 reps' : `${fmt(Math.ceil((rec.maxKg * 1.1) / 2.5) * 2.5)} kg`} até o fim do mês</div></div>${icon('plus', 'ic chev')}</button>`}
    <div class="h2">Histórico</div>
    ${[...h].reverse().slice(0, 30).map(x => `<div class="list-item">
      <div class="grow"><div class="row between"><span class="b">${fmtDate(x.d, { weekday: 'short', day: '2-digit', month: 'short' })}</span>${prW.has(x.wid) ? '<span class="pr-tag">🏆 PR</span>' : ''}</div>
      <div class="chips" style="margin-top:8px;flex-wrap:wrap">${x.sets.map(s => `<span class="chip" style="height:28px;display:inline-flex;align-items:center">${reps ? (s.kg ? `+${fmt(s.kg)}kg × ` : '') + s.reps : `${fmt(s.kg)} × ${s.reps}`}</span>`).join('')}</div></div></div>`).join('')}`;
}
function drawExerciseChart() {
  const el = $('#exChart'); if (!el) return;
  const ex = exById(view.ex);
  const cut = { '1m': 30, '3m': 91, '6m': 182, '1a': 365 }[view.range];
  const prW = new Set(prEvents().filter(p => p.exId === ex.id).map(p => p.wid));
  const pts = history(ex.id).filter(x => !cut || x.d >= Date.now() - cut * DAY).map(x => ({ x: x.d, y: x[view.metric], pr: prW.has(x.wid) }));
  lineChart(el, pts, { unit: view.metric === 'maxReps' ? 'reps' : 'kg', dec: view.metric === 'vol' || view.metric === 'maxReps' ? 0 : 1 });
  moveSeg($('#metricSeg'));
}
function moveSeg(seg) {
  if (!seg) return; const on = $('button.on', seg), pill = $('.seg-pill', seg); if (!on) return;
  pill.style.left = on.offsetLeft + 'px'; pill.style.width = on.offsetWidth + 'px';
}

// ---------- Corpo ----------
function Body() {
  const b = [...S.body].sort((a, z) => a.d - z.d);
  const cur = b.length ? b[b.length - 1].kg : null;
  const ref = b.filter(x => x.d <= Date.now() - 30 * DAY).pop() || b[0];
  const delta = cur !== null && ref ? cur - ref.kg : 0;
  const m = [...S.measures].sort((a, z) => a.d - z.d);
  const ml = m[m.length - 1], mp = m.length > 1 ? m[0] : null;
  return `<div class="top"><div><div class="sub">Peso, medidas e fotos</div><h1>Corpo</h1></div></div>
    <div class="card hero">
      <div class="row between">
        <div class="stat"><div class="k">Peso atual</div><div class="v" style="font-size:38px">${cur !== null ? `<span data-count="${cur}" data-dec="1">0</span><small>kg</small>` : '–'}</div>
        ${b.length > 1 ? `<span class="delta" style="margin-top:6px;display:inline-block">${delta > 0 ? '+' : ''}${fmt(delta)} kg em 30 dias</span>` : ''}</div>
        <button class="btn primary sm" data-act="weigh">${icon('plus')} Pesar</button>
      </div>
      <div class="chips" style="margin-top:12px">${[['3m', '3M'], ['6m', '6M'], ['1a', '1A'], ['all', 'Tudo']].map(([k, l]) => `<button class="chip ${view.bodyRange === k ? 'on' : ''}" data-act="body-range" data-k="${k}">${l}</button>`).join('')}</div>
      <div class="chart" id="bodyChart" style="height:170px"></div>
    </div>
    <div class="h2">Medidas <button class="link" data-act="measure">${ml ? 'atualizar' : 'registrar'}</button></div>
    <div class="card">${ml ? MEASURES.map(([k, l]) => {
      const v = ml.v[k]; if (v === undefined || v === '') return '';
      const prev = mp && mp.v[k] !== undefined ? v - mp.v[k] : 0;
      return `<div class="measure"><span class="b">${l}</span><span class="row" style="gap:8px"><span class="xb">${fmt(v)} cm</span>${mp ? `<span class="delta ${!prev ? '' : (prev > 0) !== SHRINK.has(k) ? 'up' : 'down'}">${prev > 0 ? '+' : ''}${fmt(prev)}</span>` : ''}</span></div>`;
    }).join('') + `<div class="tiny dim b" style="margin-top:8px">Atualizado ${relDay(ml.d).toLowerCase()}${mp ? ` · variação desde ${fmtDate(mp.d)}` : ''}</div>`
      : `<div class="empty" style="padding:14px 0"><p>Braço, cintura, coxa… registre e veja a variação com o tempo.</p><button class="btn sm primary" data-act="measure">${icon('ruler')} Registrar medidas</button></div>`}</div>
    <div class="h2">Fotos de progresso <span id="cmpBtns"></span></div>
    <div class="photos" id="photos"><label class="photo add press">${icon('camera')}<input type="file" accept="image/*" id="photoIn" hidden></label></div>
    <p class="tiny dim b" style="margin:10px 4px">Toque em duas fotos para comparar antes/depois. As fotos ficam só no seu aparelho.</p>`;
}
const SHRINK = new Set(['cintura', 'quadril']);
const MEASURES = [['braco', 'Braço'], ['peito', 'Peito'], ['cintura', 'Cintura'], ['quadril', 'Quadril'], ['coxa', 'Coxa'], ['panturrilha', 'Panturrilha']];
function drawBodyChart() {
  const el = $('#bodyChart'); if (!el) return;
  const cut = { '3m': 91, '6m': 182, '1a': 365 }[view.bodyRange];
  const pts = [...S.body].sort((a, z) => a.d - z.d).filter(x => !cut || x.d >= Date.now() - cut * DAY).map(x => ({ x: x.d, y: x.kg }));
  lineChart(el, pts, { color: '#34d399' });
}
let photosCache = [];
async function loadPhotos() {
  photosCache = (await idb.all()).sort((a, b) => b.d - a.d);
  if (S.photoCount !== photosCache.length) { S.photoCount = photosCache.length; save(); }
  const box = $('#photos'); if (!box) return;
  $$('.photo:not(.add)', box).forEach(p => p.remove());
  box.insertAdjacentHTML('beforeend', photosCache.map((p, i) => `<button class="photo ${sel.has(p.id) ? 'sel' : ''}" style="--i:${i + 1}" data-act="photo" data-id="${p.id}"><img src="${p.data}" alt=""><span class="dt">${fmtDate(p.d, { day: '2-digit', month: 'short', year: '2-digit' })}</span></button>`).join(''));
  updateCmp();
}
function updateCmp() {
  const c = $('#cmpBtns'); if (!c) return;
  c.innerHTML = sel.size === 2 ? `<button class="link" data-act="compare">comparar</button>` : sel.size === 1 ? `<button class="link" data-act="photo-del" style="color:var(--bad)">excluir</button>` : '';
  if (c.firstChild) popEl(c.firstChild);
}

// ---------- Perfil ----------
function Profile() {
  const o = overallRank(); const mr = muscleRanks();
  const unlocked = BADGES.filter(b => S.badges[b.id]).length;
  return `<div class="top"><div><div class="sub">Seu nível</div><h1>${esc(S.settings.name) || 'Perfil'}</h1></div>
      <button class="icon-btn" data-act="settings" aria-label="Ajustes">${icon('sliders')}</button></div>
    <div class="card hero" style="text-align:center">
      ${o ? `<div style="display:flex;justify-content:center">${rankBadge(o.i, 'lg')}</div>
        <div class="muted tiny b" style="margin-top:10px;letter-spacing:.1em">RANK GERAL</div>
        <div class="rank-name r${o.i} xb" style="font-size:28px">${o.name}</div>
        ${o.i < 7 ? `<div class="bar" style="margin:12px 0 6px"><i data-w="${o.progress * 100}%"></i></div><div class="muted small b">${Math.round(o.progress * 100)}% até <span class="rank-name r${o.i + 1}">${o.nextName}</span></div>` : ''}`
        : `<div class="empty" style="padding:6px 0"><div class="big">💎</div><h3>Sem rank ainda</h3><p>Treine para descobrir seu rank de Ferro a Titã.</p></div>`}
      <div class="grid3" style="margin-top:16px;text-align:left">
        <div class="stat"><div class="v"><span data-count="${S.workouts.length}">0</span></div><div class="k">treinos</div></div>
        <div class="stat"><div class="v"><span data-count="${prEvents().length}">0</span></div><div class="k">recordes</div></div>
        <div class="stat"><div class="v"><span data-count="${bestStreak()}">0</span></div><div class="k">maior sequência</div></div>
      </div>
    </div>
    ${o ? `<div class="h2">Rank por grupo muscular</div>
    <div>${MUSCLES.filter(m => mr[m]).map((m, i) => { const { ex, r } = mr[m]; return `<button class="list-item press" data-act="open-ex" data-id="${ex.id}">
      ${rankBadge(r.i, 'sm', i * .3)}<div class="grow"><div class="row between"><span class="b">${MUSCLE_EMOJI[m]} ${m}</span><span class="rank-name r${r.i} small xb">${r.name}</span></div>
      <div class="muted tiny b ellipsis" style="margin-top:2px">melhor: ${esc(ex.name)}</div>
      <div class="bar" style="height:6px;margin-top:6px"><i data-w="${r.progress * 100}%"></i></div></div></button>`; }).join('')}</div>` : ''}
    <div class="h2">Conquistas <span class="muted" style="letter-spacing:0">${unlocked}/${BADGES.length}</span></div>
    <div class="card"><div class="badges">${BADGES.map((b, i) => `<button class="badge ${S.badges[b.id] ? 'on' : ''}" style="--i:${i}" data-act="badge" data-id="${b.id}"><div class="bi">${b.e}</div><div class="bn">${b.name}</div></button>`).join('')}</div></div>
    <div class="h2">Ferramentas</div>
    <button class="list-item press" data-act="plates"><div class="ava">${icon('plate')}</div><div class="grow"><div class="b">Calculadora de anilhas</div><div class="muted small">Quanto colocar de cada lado da barra</div></div>${icon('chev', 'ic chev')}</button>
    <button class="list-item press" data-act="rm"><div class="ava">${icon('calc')}</div><div class="grow"><div class="b">Calculadora de 1RM</div><div class="muted small">Sua carga máxima e tabela de %</div></div>${icon('chev', 'ic chev')}</button>
    <button class="list-item press" data-act="routines"><div class="ava">${icon('repeat')}</div><div class="grow"><div class="b">Minhas rotinas</div><div class="muted small">${S.routines.length} salva${S.routines.length === 1 ? '' : 's'}</div></div>${icon('chev', 'ic chev')}</button>
    <div class="h2">Dados</div>
    <button class="list-item press" data-act="settings"><div class="ava">${icon('sliders')}</div><div class="grow"><div class="b">Ajustes</div><div class="muted small">Nome, peso, meta semanal, descanso</div></div>${icon('chev', 'ic chev')}</button>
    <button class="list-item press" data-act="export"><div class="ava">${icon('download')}</div><div class="grow"><div class="b">Exportar backup</div><div class="muted small">Baixa um arquivo com tudo</div></div>${icon('chev', 'ic chev')}</button>
    <label class="list-item press"><div class="ava">${icon('upload')}</div><div class="grow"><div class="b">Importar backup</div><div class="muted small">Restaura de um arquivo .json</div></div>${icon('chev', 'ic chev')}<input type="file" accept="application/json,.json" id="importIn" hidden></label>
    <button class="list-item press" data-act="demo"><div class="ava">🧪</div><div class="grow"><div class="b">Carregar dados de exemplo</div><div class="muted small">Pra ver o app cheio (substitui os atuais)</div></div>${icon('chev', 'ic chev')}</button>
    <button class="list-item press" data-act="wipe"><div class="ava" style="color:var(--bad)">${icon('trash')}</div><div class="grow"><div class="b" style="color:var(--bad)">Apagar tudo</div></div></button>
    <p class="tiny dim b" style="text-align:center;margin-top:20px">Carga · seus dados ficam só neste aparelho</p>`;
}

// =========================================================================
//   Treino ativo
// =========================================================================
let clockT = 0, rest = null, restT = 0, audio;
const WO = () => $('#workout');

function startWorkout(routine) {
  if (S.active) return openWorkout();
  const h = new Date().getHours();
  S.active = {
    id: uid(), start: Date.now(),
    name: routine ? routine.name : h < 12 ? 'Treino da manhã' : h < 18 ? 'Treino da tarde' : 'Treino da noite',
    exercises: (routine ? routine.exIds : []).map(id => newExEntry(id))
  };
  save(); openWorkout();
}
function newExEntry(exId) {
  const prev = lastSetsFor(exId);
  const n = Math.max(prev.length, 3);
  return { exId, sets: Array.from({ length: Math.min(n, 6) }, () => ({ kg: '', reps: '', done: false })) };
}
function openWorkout() {
  const el = WO(); el.hidden = false; el.classList.remove('leaving');
  renderWorkout();
  clearInterval(clockT); clockT = setInterval(tickClock, 1000);
  document.body.style.overflow = 'hidden';
}
function closeWorkout() {
  const el = WO(); el.classList.add('leaving');
  clearInterval(clockT); document.body.style.overflow = '';
  setTimeout(() => { el.hidden = true; el.classList.remove('leaving'); el.innerHTML = ''; }, 340);
  updateGo(); render();
}
function tickClock() { const c = $('#woClock'); if (c && S.active) c.textContent = fmtDur((Date.now() - S.active.start) / 1000); }

function renderWorkout(still) {
  const a = S.active; if (!a) return;
  const el = WO();
  el.classList.toggle('still', !!still);
  el.innerHTML = `<div class="wo-inner">
    <div class="wo-head">
      <button class="icon-btn" data-act="wo-min" aria-label="Minimizar">${icon('down')}</button>
      <div class="grow"><div class="t">Duração</div><div class="clock" id="woClock">${fmtDur((Date.now() - a.start) / 1000)}</div></div>
      <button class="icon-btn" data-act="rest-open" aria-label="Descanso">${icon('timer')}</button>
      <button class="btn good sm" data-act="wo-finish">${icon('flag')} Finalizar</button>
    </div>
    <input class="wo-name" id="woName" value="${esc(a.name)}" maxlength="40" aria-label="Nome do treino">
    <div class="muted small b" style="margin-top:-2px">${fmtDate(a.start, { weekday: 'long', day: '2-digit', month: 'long' })}</div>
    <div id="woList">${a.exercises.map((e, i) => exBlock(e, i)).join('')}</div>
    ${!a.exercises.length ? `<div class="empty"><div class="big">🏋️</div><h3>Treino vazio</h3><p>Adicione os exercícios que você vai fazer hoje.</p></div>` : ''}
    <button class="btn primary block" style="margin-top:16px" data-act="wo-add">${icon('plus')} Adicionar exercício</button>
    <button class="btn danger block" style="margin-top:10px" data-act="wo-discard">Descartar treino</button>
    <p class="tiny dim b" style="text-align:center;margin-top:12px">Dica: o campo vazio usa o valor da última vez. Toque no nº da série para removê-la.</p>
  </div>`;
  if (still) $$('.ex', el).forEach(x => x.style.animation = 'none');
  renderRest();
}
function exBlock(e, i) {
  const ex = exById(e.exId); const prev = lastSetsFor(e.exId, S.active.id); const reps = isReps(ex);
  return `<div class="ex" data-ei="${i}" style="animation-delay:${i * 60}ms">
    <div class="ex-head"><div class="ava" style="width:36px;height:36px;border-radius:12px;background:var(--surface-2);display:grid;place-items:center">${MUSCLE_EMOJI[ex.muscle]}</div>
      <div class="grow"><div class="n ellipsis">${esc(ex.name)}</div><div class="muted tiny b">${ex.muscle}${records(ex.id).best ? ` · 1RM ${fmt(records(ex.id).best, 0)} kg` : ''}</div></div>
      ${reps ? '' : `<button class="icon-btn" style="width:36px;height:36px" data-act="plates" data-ei="${i}" aria-label="Anilhas">${icon('plate')}</button>`}
      <button class="icon-btn" style="width:36px;height:36px" data-act="ex-menu" data-ei="${i}" aria-label="Opções">${icon('dots')}</button></div>
    <table class="sets"><thead><tr><th>Série</th><th>Anterior</th><th>${reps ? '+kg' : 'kg'}</th><th>Reps</th><th></th></tr></thead><tbody>
    ${e.sets.map((s, j) => { const p = prev[j] || prev[prev.length - 1]; return `<tr class="set-row ${s.done ? 'done' : ''}" data-ei="${i}" data-si="${j}">
      <td class="num"><button data-act="set-del" data-ei="${i}" data-si="${j}" style="width:100%;height:42px">${j + 1}</button></td>
      <td class="prev">${p ? (reps ? (p.kg ? `+${fmt(p.kg)}×` : '') + p.reps : `${fmt(p.kg)}×${p.reps}`) : '—'}</td>
      <td><input inputmode="decimal" data-f="kg" value="${s.kg}" placeholder="${p && (p.kg || !reps) ? fmt(p.kg) : reps ? '0' : ''}"></td>
      <td><input inputmode="numeric" data-f="reps" value="${s.reps}" placeholder="${p ? p.reps : ''}"></td>
      <td><button class="check ${s.done ? 'on' : ''}" data-act="set-check" data-ei="${i}" data-si="${j}" aria-label="Concluir série">${icon('check')}</button></td></tr>`; }).join('')}
    </tbody></table>
    <button class="add-set press" data-act="set-add" data-ei="${i}">+ Adicionar série</button>
  </div>`;
}

function onWorkoutInput(e) {
  const inp = e.target; if (!S.active) return;
  if (inp.id === 'woName') { S.active.name = inp.value || 'Treino'; saveSoon(); return; }
  const tr = inp.closest('tr[data-si]'); if (!tr) return;
  const s = S.active.exercises[+tr.dataset.ei].sets[+tr.dataset.si];
  s[inp.dataset.f] = inp.value; saveSoon();
}

function toggleSet(btn) {
  const ei = +btn.dataset.ei, si = +btn.dataset.si; const e = S.active.exercises[ei]; const s = e.sets[si];
  const tr = btn.closest('tr'); const ex = exById(e.exId);
  if (!s.done) {
    const [ik, ir] = [$('input[data-f=kg]', tr), $('input[data-f=reps]', tr)];
    // campo vazio herda o valor sugerido (última vez)
    if (s.kg === '' && ik.placeholder) { s.kg = ik.placeholder; ik.value = s.kg; }
    if (s.reps === '' && ir.placeholder) { s.reps = ir.placeholder; ir.value = s.reps; }
    const kg = num(s.kg) || 0, reps = num(s.reps);
    if (!(reps > 0) || (!isReps(ex) && !(kg > 0))) { jelly(tr); buzz(30); toast('Preencha carga e repetições', '✏️', 1600); return; }
    s.done = true; btn.classList.add('on'); tr.classList.add('done');
    jelly(tr); buzz(15);
    // recorde ao vivo
    const histBest = isReps(ex) ? records(ex.id).maxReps : records(ex.id).best;
    const sc = isReps(ex) ? reps : e1rm(kg, reps);
    const sessBest = Math.max(0, ...e.sets.filter((x, k) => k !== si && x.done).map(x => isReps(ex) ? num(x.reps) : e1rm(num(x.kg), num(x.reps))));
    if (histBest > 0 && sc > histBest && sc > sessBest) {
      const r = btn.getBoundingClientRect();
      confetti({ x: r.left + r.width / 2, y: r.top, count: 60, spread: .6 });
      toast(`Recorde! ${ex.name}: ${isReps(ex) ? reps + ' reps' : `1RM est. ${fmt(sc)} kg`}`, '🏆'); buzz([20, 40, 20]);
    }
    startRest(S.settings.rest);
  } else {
    s.done = false; btn.classList.remove('on'); tr.classList.remove('done'); jelly(btn);
  }
  save();
}

// ---------- timer de descanso ----------
function startRest(sec) { rest = { end: Date.now() + sec * 1000, total: sec }; renderRest(true); clearInterval(restT); restT = setInterval(tickRest, 250); }
function renderRest(fresh) {
  let pill = $('#restPill');
  if (!rest || !S.active || WO().hidden) { if (pill) { pill.classList.add('out'); setTimeout(() => pill.remove(), 300); } return; }
  if (!pill || fresh) {
    pill && pill.remove();
    WO().insertAdjacentHTML('beforeend', `<div class="rest" id="restPill"><div class="ring"><svg viewBox="0 0 50 50"><circle class="bg" cx="25" cy="25" r="21"/><circle class="fg" cx="25" cy="25" r="21" stroke-dasharray="132" stroke-dashoffset="0"/></svg></div>
      <div class="grow"><div class="tiny muted b">Descanso</div><div class="time" id="restTime"></div></div>
      <button class="icon-btn" data-act="rest-add" data-s="-15">−15</button><button class="icon-btn" data-act="rest-add" data-s="15">+15</button><button class="icon-btn" data-act="rest-skip">${icon('x')}</button></div>`);
  }
  tickRest();
}
function tickRest() {
  if (!rest) return;
  const left = Math.max(0, (rest.end - Date.now()) / 1000);
  const t = $('#restTime'); if (t) t.textContent = fmtDur(Math.ceil(left));
  const fg = $('#restPill .fg'); if (fg) fg.style.strokeDashoffset = 132 * (1 - left / rest.total);
  if (left <= 0) {
    clearInterval(restT); rest = null; beep(); buzz([200, 100, 200]);
    const pill = $('#restPill'); if (pill) { jelly(pill); setTimeout(() => renderRest(), 500); }
    toast('Descanso acabou. Bora! 💪', '⏱️');
  }
}
function beep() {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    [0, .22].forEach(dt => {
      const o = audio.createOscillator(), g = audio.createGain(); o.frequency.value = 880; o.type = 'sine';
      g.gain.setValueAtTime(.0001, audio.currentTime + dt); g.gain.exponentialRampToValueAtTime(.3, audio.currentTime + dt + .02); g.gain.exponentialRampToValueAtTime(.0001, audio.currentTime + dt + .18);
      o.connect(g).connect(audio.destination); o.start(audio.currentTime + dt); o.stop(audio.currentTime + dt + .2);
    });
  } catch { }
}

async function finishWorkout() {
  const a = S.active;
  const exs = a.exercises.map(e => ({ exId: e.exId, sets: e.sets.filter(s => s.done).map(s => ({ kg: num(s.kg) || 0, reps: Math.round(num(s.reps)) || 0 })) })).filter(e => e.sets.length);
  if (!exs.length) {
    if (await confirmSheet('Nenhuma série concluída', 'Marque as séries com ✓ pra elas contarem. Quer descartar esse treino?', 'Descartar')) discardWorkout();
    return;
  }
  const beforePR = prEvents().length; const beforeRanks = Object.fromEntries(exs.map(e => [e.exId, exRank(e.exId).i]));
  const w = { id: a.id, start: a.start, end: Date.now(), name: (a.name || 'Treino').trim(), exercises: exs };
  S.workouts.push(w); S.active = null; rest = null; clearInterval(restT); save();
  const prs = prEvents().filter(p => p.wid === w.id);
  const rankUps = exs.filter(e => exRank(e.exId).i > beforeRanks[e.exId]).map(e => ({ ex: exById(e.exId), r: exRank(e.exId) }));
  closeWorkout();
  setTimeout(() => {
    summarySheet(w, prs, rankUps);
    confetti({ count: prs.length ? 220 : 120 });
    checkGoals(); checkBadges();
  }, 380);
  void beforePR;
}
function discardWorkout() { S.active = null; rest = null; clearInterval(restT); save(); closeWorkout(); toast('Treino descartado', '🗑️'); }

function summarySheet(w, prs, rankUps = []) {
  const vol = workoutVolume(w);
  const n = S.workouts.length;
  openSheet(`<div class="celebrate"><div class="trophy">${prs.length ? '🏆' : '💪'}</div><h2>${prs.length ? `${prs.length} recorde${prs.length > 1 ? 's' : ''}!` : 'Treino concluído!'}</h2>
    <p class="lead">${n}º treino registrado. ${['Mandou bem!', 'Constância é tudo.', 'Mais um tijolo no shape.', 'Tá voando!'][n % 4]}</p></div>
    <div class="grid3">
      <div class="card tight stat"><div class="v count">${fmtDur((w.end - w.start) / 1000)}</div><div class="k">duração</div></div>
      <div class="card tight stat"><div class="v">${vol >= 1000 ? `<span data-count="${vol / 1000}" data-dec="1">0</span><small>t</small>` : `<span data-count="${vol}">0</span><small>kg</small>`}</div><div class="k">volume</div></div>
      <div class="card tight stat"><div class="v"><span data-count="${setCount(w)}">0</span></div><div class="k">séries</div></div>
    </div>
    ${rankUps.map(({ ex, r }) => `<div class="card row" style="margin-top:12px">${rankBadge(r.i)}<div class="grow"><div class="b">Subiu de rank!</div><div class="muted small">${esc(ex.name)} agora é <span class="rank-name r${r.i} b">${r.name}</span></div></div></div>`).join('')}
    ${prs.length ? `<div class="h2">Recordes</div>${prs.map(p => { const ex = exById(p.exId); return `<div class="list-item"><div class="ava">🏆</div><div class="grow"><div class="b ellipsis">${esc(ex.name)}</div><div class="muted small">${isReps(ex) ? `${p.value} reps` : `1RM est. ${fmt(p.value)} kg`}</div></div><span class="pr-tag">+${fmt(p.value - p.prev)}</span></div>`; }).join('')}` : ''}
    <button class="btn primary block" style="margin-top:18px" data-close>Fechar</button>`);
  countUps($('#sheets'));
}

// ---------- seletor de exercícios ----------
function pickExercises() {
  return new Promise(res => {
    const chosen = new Set(); let q = '', mus = 'Todos', done = false;
    const w = openSheet(`<h2>Adicionar exercícios</h2>
      <div class="search"><input class="input" id="pkQ" placeholder="Buscar exercício…" autocomplete="off">
      <div class="chips" style="margin-top:10px">${['Todos', ...MUSCLES].map(m => `<button class="chip ${m === 'Todos' ? 'on' : ''}" data-m="${m}">${m}</button>`).join('')}</div></div>
      <div id="pkList"></div>
      <button class="list-item press" data-new style="margin-top:10px"><div class="ava">${icon('plus')}</div><div class="grow"><div class="b">Criar exercício</div><div class="muted small">Não achou? Cria o seu.</div></div></button>
      <div style="position:sticky;bottom:0;padding-top:12px;background:linear-gradient(transparent,var(--surface) 40%)"><button class="btn primary block" data-ok disabled style="opacity:.5">Selecione exercícios</button></div>`,
      { onClose: () => { if (!done) res([]); } });
    const list = () => {
      const items = exercises().filter(e => (mus === 'Todos' || e.muscle === mus) && e.name.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').includes(q))
        .sort((a, b) => (history(b.id).length - history(a.id).length) || a.name.localeCompare(b.name));
      $('#pkList', w).innerHTML = items.map(e => `<button class="list-item press" data-id="${e.id}"><div class="ava">${MUSCLE_EMOJI[e.muscle]}</div>
        <div class="grow"><div class="b ellipsis">${esc(e.name)}</div><div class="muted small">${e.muscle}${history(e.id).length ? ` · ${history(e.id).length}× feito` : ''}</div></div>
        <div class="check ${chosen.has(e.id) ? 'on' : ''}" style="width:34px;height:34px">${icon('check')}</div></button>`).join('') || '<p class="muted" style="text-align:center">Nada encontrado.</p>';
    };
    const okBtn = () => { const b = $('[data-ok]', w); b.disabled = !chosen.size; b.style.opacity = chosen.size ? 1 : .5; b.textContent = chosen.size ? `Adicionar ${chosen.size} exercício${chosen.size > 1 ? 's' : ''}` : 'Selecione exercícios'; if (chosen.size) jelly(b); };
    list();
    $('#pkQ', w).addEventListener('input', e => { q = e.target.value.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, ''); list(); });
    w.addEventListener('click', async e => {
      const chip = e.target.closest('[data-m]');
      if (chip) { mus = chip.dataset.m; $$('[data-m]', w).forEach(c => c.classList.toggle('on', c === chip)); jelly(chip); list(); return; }
      const it = e.target.closest('#pkList [data-id]');
      if (it) { const id = it.dataset.id; chosen.has(id) ? chosen.delete(id) : chosen.add(id); const c = $('.check', it); c.classList.toggle('on', chosen.has(id)); jelly(c); buzz(8); okBtn(); return; }
      if (e.target.closest('[data-new]')) { const id = await customExercise(); if (id) { chosen.add(id); list(); okBtn(); } return; }
      if (e.target.closest('[data-ok]') && chosen.size) { done = true; res([...chosen]); closeSheet(w); }
    });
  });
}
function customExercise() {
  return new Promise(res => {
    let mus = 'Peito', type = 'bar', done = false;
    const w = openSheet(`<h2>Novo exercício</h2><p class="lead">Ele entra na sua biblioteca e ganha rank também.</p>
      <label class="field"><span>Nome</span><input class="input" id="cxN" placeholder="Ex.: Supino na máquina" maxlength="40"></label>
      <div class="field"><span>Grupo muscular</span><div class="chips" style="flex-wrap:wrap">${MUSCLES.map(m => `<button class="chip ${m === mus ? 'on' : ''}" data-m="${m}">${m}</button>`).join('')}</div></div>
      <div class="field"><span>Equipamento</span><div class="chips" style="flex-wrap:wrap">${Object.entries(TYPES).map(([k, l]) => `<button class="chip ${k === type ? 'on' : ''}" data-t="${k}">${l}</button>`).join('')}</div></div>
      <button class="btn primary block" data-ok style="margin-top:8px">Criar</button>`, { onClose: () => { if (!done) res(null); } });
    w.addEventListener('click', e => {
      const m = e.target.closest('[data-m]'), t = e.target.closest('[data-t]');
      if (m) { mus = m.dataset.m; $$('[data-m]', w).forEach(c => c.classList.toggle('on', c === m)); jelly(m); }
      if (t) { type = t.dataset.t; $$('[data-t]', w).forEach(c => c.classList.toggle('on', c === t)); jelly(t); }
      if (e.target.closest('[data-ok]')) {
        const name = $('#cxN', w).value.trim(); if (!name) { jelly($('#cxN', w)); return; }
        const ex = { id: 'c_' + uid(), name, muscle: mus, std: type, f: 1 };
        S.custom.push(ex); save(); done = true; res(ex.id); closeSheet(w); toast('Exercício criado', '✨');
      }
    });
  });
}

// ---------- outras sheets ----------
function workoutSheet(id) {
  const w = S.workouts.find(x => x.id === id); if (!w) return;
  const prs = new Set(prEvents().filter(p => p.wid === w.id).map(p => p.exId));
  const sh = openSheet(`<h2>${esc(w.name)}</h2><p class="lead">${fmtDate(w.start, { weekday: 'long', day: '2-digit', month: 'long' })} · ${new Date(w.start).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
    <div class="grid3"><div class="card tight stat"><div class="v count">${fmtDur((w.end - w.start) / 1000)}</div><div class="k">duração</div></div>
      <div class="card tight stat"><div class="v count" style="font-size:20px">${fmtVol(workoutVolume(w))}</div><div class="k">volume</div></div>
      <div class="card tight stat"><div class="v">${setCount(w)}</div><div class="k">séries</div></div></div>
    ${w.exercises.map(e => { const ex = exById(e.exId); return `<div class="card tight" style="margin-top:10px"><div class="row between"><span class="b">${MUSCLE_EMOJI[ex.muscle]} ${esc(ex.name)}</span>${prs.has(e.exId) ? '<span class="pr-tag">🏆 PR</span>' : ''}</div>
      <div class="chips" style="flex-wrap:wrap;margin-top:8px">${e.sets.map(s => `<span class="chip" style="height:28px;display:inline-flex;align-items:center">${isReps(ex) ? (s.kg ? `+${fmt(s.kg)}kg × ` : '') + s.reps : `${fmt(s.kg)} × ${s.reps}`}</span>`).join('')}</div></div>`; }).join('')}
    <div class="row" style="gap:10px;margin-top:16px"><button class="btn grow" data-x="rt">${icon('repeat')} Salvar como rotina</button><button class="btn danger" data-x="del">${icon('trash')}</button></div>
    <button class="btn primary block" style="margin-top:10px" data-x="again">${icon('play')} Repetir esse treino</button>`);
  sh.addEventListener('click', async e => {
    const b = e.target.closest('[data-x]'); if (!b) return;
    if (b.dataset.x === 'rt') { S.routines.push({ id: uid(), name: w.name, exIds: w.exercises.map(x => x.exId) }); save(); toast('Rotina salva', '📋'); closeSheet(sh); }
    if (b.dataset.x === 'again') { closeSheet(sh); setTimeout(() => startWorkout({ name: w.name, exIds: w.exercises.map(x => x.exId) }), 250); }
    if (b.dataset.x === 'del' && await confirmSheet('Excluir treino?', 'Recordes e gráficos serão recalculados.', 'Excluir')) {
      S.workouts = S.workouts.filter(x => x.id !== id); save(); closeSheet(sh); render(); toast('Treino excluído', '🗑️');
    }
  });
}

function startSheet() {
  if (S.active) return openWorkout();
  const last = sorted()[sorted().length - 1];
  const sh = openSheet(`<h2>Bora treinar 💪</h2><p class="lead">Escolhe uma rotina ou começa do zero.</p>
    <button class="btn primary block" data-x="empty">${icon('plus')} Treino vazio</button>
    ${last ? `<button class="list-item press" style="margin-top:12px" data-x="last"><div class="ava">${icon('repeat')}</div><div class="grow"><div class="b ellipsis">Repetir: ${esc(last.name)}</div><div class="muted small">${relDay(last.start)} · ${last.exercises.length} exercícios</div></div>${icon('chev', 'ic chev')}</button>` : ''}
    <div class="h2">Rotinas <button class="link" data-x="new">+ nova</button></div>
    ${S.routines.length ? S.routines.map(r => `<div class="list-item"><button class="grow row press" style="text-align:left" data-x="go" data-id="${r.id}"><div class="ava">📋</div><div class="grow"><div class="b ellipsis">${esc(r.name)}</div><div class="muted small ellipsis">${r.exIds.map(i => exById(i).name).join(', ') || 'sem exercícios'}</div></div></button>
      <button class="icon-btn" data-x="edit" data-id="${r.id}">${icon('edit')}</button></div>`).join('')
      : `<div class="card empty" style="padding:20px"><p style="margin:0">Salve rotinas tipo “Peito e tríceps” pra começar em 1 toque.</p></div>`}`);
  sh.addEventListener('click', e => {
    const b = e.target.closest('[data-x]'); if (!b) return;
    const r = S.routines.find(x => x.id === b.dataset.id);
    if (b.dataset.x === 'empty') { closeSheet(sh); setTimeout(() => startWorkout(), 200); }
    if (b.dataset.x === 'last') { closeSheet(sh); setTimeout(() => startWorkout({ name: last.name, exIds: last.exercises.map(x => x.exId) }), 200); }
    if (b.dataset.x === 'go') { closeSheet(sh); setTimeout(() => startWorkout(r), 200); }
    if (b.dataset.x === 'edit' || b.dataset.x === 'new') { closeSheet(sh); setTimeout(() => routineSheet(r), 250); }
  });
}
function routineSheet(r) {
  const draft = r ? { ...r, exIds: [...r.exIds] } : { id: uid(), name: '', exIds: [] };
  const sh = openSheet(`<h2>${r ? 'Editar rotina' : 'Nova rotina'}</h2>
    <label class="field"><span>Nome</span><input class="input" id="rtN" value="${esc(draft.name)}" placeholder="Ex.: Treino A — Peito e tríceps" maxlength="40"></label>
    <div id="rtList"></div>
    <button class="btn block" style="margin-top:10px" data-x="add">${icon('plus')} Adicionar exercícios</button>
    <div class="row" style="gap:10px;margin-top:12px">${r ? `<button class="btn danger" data-x="del">${icon('trash')}</button>` : ''}<button class="btn primary grow" data-x="save">Salvar rotina</button></div>`);
  const list = () => {
    $('#rtList', sh).innerHTML = draft.exIds.map((id, i) => { const ex = exById(id); return `<div class="list-item"><div class="ava">${MUSCLE_EMOJI[ex.muscle]}</div><div class="grow b ellipsis">${esc(ex.name)}</div>
      <button class="icon-btn" data-x="up" data-i="${i}" style="width:36px;height:36px;transform:rotate(90deg)">${icon('back')}</button><button class="icon-btn" data-x="rm" data-i="${i}" style="width:36px;height:36px">${icon('x')}</button></div>`; }).join('');
  };
  list();
  sh.addEventListener('click', async e => {
    const b = e.target.closest('[data-x]'); if (!b) return; const i = +b.dataset.i;
    if (b.dataset.x === 'add') { const ids = await pickExercises(); draft.exIds.push(...ids.filter(id => !draft.exIds.includes(id))); list(); }
    if (b.dataset.x === 'rm') { draft.exIds.splice(i, 1); list(); }
    if (b.dataset.x === 'up' && i > 0) { [draft.exIds[i - 1], draft.exIds[i]] = [draft.exIds[i], draft.exIds[i - 1]]; list(); jelly($$('#rtList .list-item', sh)[i - 1]); }
    if (b.dataset.x === 'del' && await confirmSheet('Excluir rotina?', 'Seus treinos continuam salvos.', 'Excluir')) { S.routines = S.routines.filter(x => x.id !== draft.id); save(); closeSheet(sh); render(true); }
    if (b.dataset.x === 'save') {
      draft.name = $('#rtN', sh).value.trim() || 'Minha rotina';
      if (!draft.exIds.length) { toast('Adicione pelo menos um exercício', '✏️'); return; }
      const k = S.routines.findIndex(x => x.id === draft.id); k >= 0 ? S.routines[k] = draft : S.routines.push(draft);
      save(); closeSheet(sh); toast('Rotina salva', '📋'); render(true);
    }
  });
}
function routinesSheet() {
  const sh = openSheet(`<h2>Minhas rotinas</h2><p class="lead">Modelos que você monta pra começar o treino rápido.</p>
    ${S.routines.map(r => `<button class="list-item press" data-id="${r.id}"><div class="ava">📋</div><div class="grow"><div class="b ellipsis">${esc(r.name)}</div><div class="muted small ellipsis">${r.exIds.map(i => exById(i).name).join(', ')}</div></div>${icon('edit', 'ic chev')}</button>`).join('')}
    <button class="btn primary block" style="margin-top:12px" data-new>${icon('plus')} Nova rotina</button>`);
  sh.addEventListener('click', e => {
    const it = e.target.closest('[data-id]'), nw = e.target.closest('[data-new]');
    if (it || nw) { closeSheet(sh); setTimeout(() => routineSheet(it && S.routines.find(r => r.id === it.dataset.id)), 250); }
  });
}

function goalSheet(exId) {
  const ex = exById(exId); const g = S.goals.find(x => x.exId === exId && !x.doneAt); const rec = records(exId); const reps = isReps(ex);
  const sugg = reps ? rec.maxReps + 3 : Math.ceil((rec.maxKg * 1.1) / 2.5) * 2.5;
  const sh = openSheet(`<h2>Meta: ${esc(ex.name)}</h2><p class="lead">Hoje seu melhor é ${reps ? `${rec.maxReps} reps` : `${fmt(rec.maxKg)} kg`}. Quando você bater a meta, rola festa. 🎉</p>
    <label class="field"><span>${reps ? 'Repetições' : 'Carga (kg)'}</span><input class="input" id="glV" inputmode="decimal" value="${g ? fmt(g.target) : fmt(sugg)}" style="font-size:28px;height:64px;text-align:center"></label>
    <div class="chips" style="justify-content:center;margin-bottom:14px">${(reps ? [1, 2, 5] : [2.5, 5, 10]).map(d => `<button class="chip" data-d="${d}">+${fmt(d)}</button>`).join('')}</div>
    <button class="btn primary block" data-ok>${icon('target')} Salvar meta</button>`);
  sh.addEventListener('click', e => {
    const d = e.target.closest('[data-d]'); const inp = $('#glV', sh);
    if (d) { inp.value = fmt((num(inp.value) || 0) + +d.dataset.d); jelly(inp); jelly(d); }
    if (e.target.closest('[data-ok]')) {
      const v = num(inp.value); if (!(v > 0)) { jelly(inp); return; }
      if (g) g.target = v; else S.goals.push({ id: uid(), exId, target: v, created: Date.now() });
      save(); closeSheet(sh); render(true); toast('Meta salva. Bora buscar!', '🎯'); checkGoals();
    }
  });
}

function weighSheet() {
  const cur = bodyweight();
  const sh = openSheet(`<h2>Pesagem</h2><p class="lead">Dica: pese sempre no mesmo horário, de manhã em jejum.</p>
    <div class="row" style="justify-content:center;gap:14px;margin:6px 0 16px">
      <button class="icon-btn" data-d="-0.1" style="width:56px;height:56px;border-radius:18px">${icon('minus')}</button>
      <input class="input" id="wV" inputmode="decimal" value="${fmt(cur)}" style="width:150px;height:72px;font-size:34px;text-align:center">
      <button class="icon-btn" data-d="0.1" style="width:56px;height:56px;border-radius:18px">${icon('plus')}</button></div>
    <button class="btn primary block" data-ok>Salvar ${icon('check')}</button>`);
  sh.addEventListener('click', e => {
    const d = e.target.closest('[data-d]'); const inp = $('#wV', sh);
    if (d) { inp.value = fmt((num(inp.value) || 0) + +d.dataset.d); jelly(inp); jelly(d); buzz(6); }
    if (e.target.closest('[data-ok]')) {
      const v = num(inp.value); if (!(v > 20 && v < 400)) { jelly(inp); return; }
      const today = dayStart(Date.now());
      S.body = S.body.filter(b => dayStart(b.d) !== today); S.body.push({ d: Date.now(), kg: v }); S.settings.bw = v;
      save(); closeSheet(sh); render(true); toast(`${fmt(v)} kg registrado`, '⚖️'); checkBadges();
    }
  });
}
function measureSheet() {
  const last = [...S.measures].sort((a, z) => z.d - a.d)[0];
  const sh = openSheet(`<h2>Medidas (cm)</h2><p class="lead">Preencha só o que quiser acompanhar.</p>
    <div class="grid2">${MEASURES.map(([k, l]) => `<label class="field" style="margin:0"><span>${l}</span><input class="input" inputmode="decimal" data-k="${k}" value="${last && last.v[k] !== undefined ? fmt(last.v[k]) : ''}" placeholder="–"></label>`).join('')}</div>
    <button class="btn primary block" style="margin-top:16px" data-ok>Salvar medidas</button>`);
  sh.addEventListener('click', e => {
    if (!e.target.closest('[data-ok]')) return;
    const v = {}; $$('input[data-k]', sh).forEach(i => { const n = num(i.value); if (n > 0) v[i.dataset.k] = n; });
    if (!Object.keys(v).length) { toast('Preencha pelo menos uma medida', '📏'); return; }
    S.measures.push({ d: Date.now(), v }); save(); closeSheet(sh); render(true); toast('Medidas salvas', '📏');
  });
}
function compareSheet() {
  const [a, b] = photosCache.filter(p => sel.has(p.id)).sort((x, y) => x.d - y.d);
  if (!a || !b) return;
  const days = Math.round((b.d - a.d) / DAY);
  const sh = openSheet(`<h2>Antes × depois</h2><p class="lead">${days} dias de diferença. Arraste pra comparar.</p>
    <div class="compare" id="cmp"><img src="${a.data}" alt="antes"><img class="after" src="${b.data}" alt="depois"><div class="handle"></div>
    <span class="lb" style="left:10px">${fmtDate(a.d)}</span><span class="lb" style="right:10px">${fmtDate(b.d)}</span></div>`);
  const c = $('#cmp', sh);
  const set = e => { const r = c.getBoundingClientRect(); c.style.setProperty('--x', clamp((e.clientX - r.left) / r.width * 100, 0, 100) + '%'); };
  c.addEventListener('pointerdown', e => { c.setPointerCapture(e.pointerId); set(e); });
  c.addEventListener('pointermove', e => { if (e.buttons || e.pressure) set(e); });
  // pequena "dica" elástica mostrando que dá pra arrastar
  if (!reduceMotion) { let t0 = performance.now(); const wig = t => { const k = (t - t0) / 1400; if (k > 1) { c.style.setProperty('--x', '50%'); return; } c.style.setProperty('--x', (50 + Math.sin(k * Math.PI * 3) * 22 * (1 - k)) + '%'); requestAnimationFrame(wig); }; setTimeout(() => { t0 = performance.now(); requestAnimationFrame(wig); }, 700); }
}

const PLATES = [[25, '#e5384f', 130, 20], [20, '#3b7bff', 130, 17], [15, '#ffcf4d', 115, 15], [10, '#34d399', 100, 13], [5, '#e8ebf0', 80, 11], [2.5, '#3a3f4b', 64, 9], [1.25, '#b9c0cc', 52, 7]];
function platesSheet(kg0) {
  let bar = S.settings.bar;
  const sh = openSheet(`<h2>Calculadora de anilhas</h2><p class="lead">Quanto vai de cada lado da barra.</p>
    <label class="field"><span>Carga total (kg)</span><input class="input" id="plV" inputmode="decimal" value="${kg0 ? fmt(kg0) : '60'}" style="font-size:28px;height:64px;text-align:center"></label>
    <div class="field"><span>Barra</span><div class="seg" id="plBar">${[20, 15, 10, 0].map(b => `<button class="${b === bar ? 'on' : ''}" data-b="${b}">${b ? b + ' kg' : 'Sem barra'}</button>`).join('')}<div class="seg-pill"></div></div></div>
    <div id="plOut"></div>`);
  const out = () => {
    const total = num($('#plV', sh).value) || 0; let side = Math.max(0, (total - bar) / 2); const used = [];
    for (const [w] of PLATES) while (side >= w - 1e-9) { used.push(w); side -= w; }
    const rest = side;
    $('#plOut', sh).innerHTML = `<div class="plates"><div class="barbar"></div><div class="side"><div class="sleeve"></div>${used.map((w, i) => { const p = PLATES.find(x => x[0] === w); return `<div class="plate" style="--i:${i};background:${p[1]};height:${p[2]}px;width:${p[3]}px"></div>`; }).join('')}<div class="sleeve-end"></div></div></div>
      <div class="plate-legend">${used.length ? Object.entries(used.reduce((m, w) => (m[w] = (m[w] || 0) + 1, m), {})).sort((a, b) => b[0] - a[0]).map(([w, n]) => `<span>${n}× ${fmt(+w, 2)} kg</span>`).join('') : '<span class="muted">Só a barra 😄</span>'}</div>
      <p class="muted small b" style="text-align:center;margin-top:10px">por lado${rest > .01 ? ` · sobra ${fmt(rest * 2, 2)} kg que não fecha com anilhas` : ''}</p>`;
  };
  out(); requestAnimationFrame(() => moveSeg($('#plBar', sh)));
  let t; $('#plV', sh).addEventListener('input', () => { clearTimeout(t); t = setTimeout(out, 250); });
  sh.addEventListener('click', e => {
    const b = e.target.closest('[data-b]'); if (!b) return;
    bar = +b.dataset.b; $$('#plBar button', sh).forEach(x => x.classList.toggle('on', x === b)); moveSeg($('#plBar', sh)); out();
  });
}
function rmSheet() {
  const sh = openSheet(`<h2>Calculadora de 1RM</h2><p class="lead">Estimativa pela fórmula de Epley.</p>
    <div class="grid2"><label class="field"><span>Carga (kg)</span><input class="input" id="rmK" inputmode="decimal" value="80"></label><label class="field"><span>Repetições</span><input class="input" id="rmR" inputmode="numeric" value="8"></label></div>
    <div id="rmOut"></div>`);
  const out = () => {
    const k = num($('#rmK', sh).value), r = Math.round(num($('#rmR', sh).value));
    const rm = e1rm(k, r);
    $('#rmOut', sh).innerHTML = rm ? `<div class="card hero" style="text-align:center"><div class="muted small b">Seu 1RM estimado</div><div class="stat"><div class="v" style="font-size:44px"><span data-count="${rm}" data-dec="1">0</span><small>kg</small></div></div></div>
      <div class="card" style="margin-top:10px">${[[95, 2], [90, 4], [85, 6], [80, 8], [75, 10], [70, 12], [65, 15], [60, 20]].map(([p, rp]) => `<div class="measure"><span class="b">${p}%</span><span class="muted small b">~${rp} reps</span><span class="xb">${fmt(Math.round(rm * p / 100 / 1.25) * 1.25, 2)} kg</span></div>`).join('')}</div>` : '';
    countUps($('#rmOut', sh));
  };
  out(); let t; sh.addEventListener('input', () => { clearTimeout(t); t = setTimeout(out, 300); });
}
function settingsSheet() {
  const s = S.settings; let sex = s.sex, goal = s.weekGoal, restS = s.rest;
  const sh = openSheet(`<h2>Ajustes</h2>
    <label class="field"><span>Seu nome</span><input class="input" id="stN" value="${esc(s.name)}" placeholder="Como te chamo?" maxlength="24"></label>
    <div class="grid2"><label class="field"><span>Peso corporal (kg)</span><input class="input" id="stW" inputmode="decimal" value="${fmt(bodyweight())}"></label>
    <div class="field"><span>Ranks para</span><div class="seg" id="stSex"><button data-sx="m" class="${sex === 'm' ? 'on' : ''}">Homem</button><button data-sx="f" class="${sex === 'f' ? 'on' : ''}">Mulher</button><div class="seg-pill"></div></div></div></div>
    <div class="field"><span>Meta de treinos por semana</span><div class="chips">${[1, 2, 3, 4, 5, 6, 7].map(n => `<button class="chip ${n === goal ? 'on' : ''}" data-g="${n}" style="width:40px;padding:0">${n}</button>`).join('')}</div></div>
    <div class="field"><span>Descanso padrão</span><div class="chips">${[45, 60, 90, 120, 180, 240].map(n => `<button class="chip ${n === restS ? 'on' : ''}" data-r="${n}">${fmtDur(n)}</button>`).join('')}</div></div>
    <button class="btn primary block" style="margin-top:8px" data-ok>Salvar</button>`);
  requestAnimationFrame(() => moveSeg($('#stSex', sh)));
  sh.addEventListener('click', e => {
    const x = e.target.closest('[data-sx],[data-g],[data-r]');
    if (x) {
      if (x.dataset.sx) { sex = x.dataset.sx; $$('[data-sx]', sh).forEach(b => b.classList.toggle('on', b === x)); moveSeg($('#stSex', sh)); }
      if (x.dataset.g) { goal = +x.dataset.g; $$('[data-g]', sh).forEach(b => b.classList.toggle('on', b === x)); }
      if (x.dataset.r) { restS = +x.dataset.r; $$('[data-r]', sh).forEach(b => b.classList.toggle('on', b === x)); }
      jelly(x); buzz(6);
    }
    if (e.target.closest('[data-ok]')) {
      s.name = $('#stN', sh).value.trim(); s.sex = sex; s.weekGoal = goal; s.rest = restS;
      const bw = num($('#stW', sh).value);
      if (bw > 20 && bw < 400 && Math.abs(bw - bodyweight()) > .01) { const t = dayStart(Date.now()); S.body = S.body.filter(b => dayStart(b.d) !== t); S.body.push({ d: Date.now(), kg: bw }); s.bw = bw; }
      save(); closeSheet(sh); render(true); toast('Ajustes salvos', '⚙️');
    }
  });
}

async function exportData() {
  const photos = await idb.all();
  const blob = new Blob([JSON.stringify({ app: 'carga', v: 1, at: Date.now(), data: S, photos })], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `carga-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast('Backup exportado', '💾');
}
async function importData(file) {
  try {
    const j = JSON.parse(await file.text());
    if (j.app !== 'carga' || !j.data) throw new Error('formato');
    if (!await confirmSheet('Restaurar backup?', `Isso substitui os dados atuais pelos do arquivo (${(j.data.workouts || []).length} treinos).`, 'Restaurar', false)) return;
    S = { ...DEFAULTS(), ...j.data, settings: { ...DEFAULTS().settings, ...j.data.settings } }; save();
    await idb.clear(); for (const p of j.photos || []) await idb.put(p);
    render(); updateGo(); toast('Backup restaurado', '✅'); confetti({ count: 90 });
  } catch { toast('Arquivo inválido', '⚠️'); }
}

// ---------- dados de exemplo ----------
function demoData() {
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const routines = [
    { id: uid(), name: 'Treino A — Peito e tríceps', exIds: ['supino', 'supino-inc', 'crucifixo', 'triceps-pulley', 'triceps-testa'] },
    { id: uid(), name: 'Treino B — Costas e bíceps', exIds: ['barra-fixa', 'remada', 'puxada', 'rosca', 'rosca-mart'] },
    { id: uid(), name: 'Treino C — Pernas e ombros', exIds: ['agacha', 'leg-press', 'extensora', 'desenv', 'elev-lat'] }
  ];
  const start = { supino: 62, 'supino-inc': 48, crucifixo: 12, 'triceps-pulley': 25, 'triceps-testa': 22, 'barra-fixa': 4, remada: 55, puxada: 50, rosca: 26, 'rosca-mart': 12, agacha: 70, 'leg-press': 150, extensora: 40, desenv: 36, 'elev-lat': 7 };
  const gain = { supino: 22, 'supino-inc': 14, crucifixo: 6, 'triceps-pulley': 12, 'triceps-testa': 10, 'barra-fixa': 6, remada: 22, puxada: 20, rosca: 10, 'rosca-mart': 6, agacha: 40, 'leg-press': 90, extensora: 22, desenv: 14, 'elev-lat': 4 };
  const workouts = []; const weeks = 16; const now = Date.now();
  let n = 0;
  for (let wk = weeks; wk >= 0; wk--) {
    const days = [0, 2, 4, 5].filter(d => wk === 0 ? true : rnd() > .2);
    for (const d of days) {
      const t = weekStart(now) - wk * 7 * DAY + d * DAY + (17 + Math.floor(rnd() * 4)) * 3600e3 + Math.floor(rnd() * 50) * 60e3;
      if (t > now - 2 * 3600e3) continue;
      const r = routines[n % 3]; n++;
      const prog = 1 - wk / weeks;
      const exs = r.exIds.map(id => {
        const ex = exById(id); const base = start[id] + gain[id] * prog * (0.92 + rnd() * .12);
        const sets = Array.from({ length: 3 + (rnd() > .6 ? 1 : 0) }, (_, k) => isReps(ex)
          ? { kg: 0, reps: Math.max(1, Math.round(base - k + (rnd() - .5) * 2)) }
          : { kg: Math.round(base / 2.5) * 2.5 - (k === 3 ? 5 : 0), reps: Math.max(4, Math.round(10 - prog * 3 - k * .7 + (rnd() - .5) * 2)) });
        return { exId: id, sets };
      });
      workouts.push({ id: uid(), start: t, end: t + (50 + Math.floor(rnd() * 40)) * 60e3, name: r.name, exercises: exs });
    }
  }
  const body = []; for (let i = 0; i <= weeks * 2; i++) body.push({ d: now - (weeks * 2 - i) * 3.5 * DAY, kg: Math.round((80 - i * .14 + (rnd() - .5) * .8) * 10) / 10 });
  const measures = [
    { d: now - 110 * DAY, v: { braco: 35.5, peito: 101, cintura: 88, quadril: 99, coxa: 57, panturrilha: 37 } },
    { d: now - 55 * DAY, v: { braco: 36.4, peito: 103, cintura: 86, quadril: 98.5, coxa: 58.2, panturrilha: 37.4 } },
    { d: now - 6 * DAY, v: { braco: 37.2, peito: 104.5, cintura: 84, quadril: 98, coxa: 59.5, panturrilha: 37.8 } }
  ];
  S = { ...DEFAULTS(), workouts, routines, body, measures, settings: { ...DEFAULTS().settings, name: S.settings.name, bw: body[body.length - 1].kg },
    goals: [{ id: uid(), exId: 'supino', target: 100, created: now - 20 * DAY }, { id: uid(), exId: 'agacha', target: 120, created: now - 10 * DAY }, { id: uid(), exId: 'barra-fixa', target: 12, created: now - 5 * DAY }] };
  save(); checkBadges(true);
}

// =========================================================================
//   Eventos
// =========================================================================
const ACT = {
  start: startSheet,
  resume: openWorkout,
  demo: async () => {
    if (S.workouts.length && !await confirmSheet('Carregar exemplo?', 'Seus treinos atuais serão substituídos pelos dados de exemplo.', 'Carregar')) return;
    demoData(); view.tab = 'home'; render(); confetti({ count: 120 }); toast('Dados de exemplo carregados', '🧪');
  },
  'open-ex': el => { view.tab = 'progress'; view.ex = el.dataset.id; scrollTo(0, 0); render(); },
  'open-wo': el => workoutSheet(el.dataset.id),
  back: () => { view.ex = null; render(); },
  muscle: el => { view.muscle = el.dataset.m; render(true); const on = $(`.chip[data-m="${view.muscle}"]`); jelly(on); $$('#screen .list-item').forEach((x, i) => { x.style.animation = 'none'; x.offsetWidth; x.style.animation = `rise .6s var(--spring) both ${i * 35}ms`; }); },
  metric: el => { view.metric = el.dataset.k; $$('#metricSeg button').forEach(b => b.classList.toggle('on', b === el)); drawExerciseChart(); },
  range: el => { view.range = el.dataset.k; $$('[data-act=range]').forEach(b => b.classList.toggle('on', b === el)); jelly(el); drawExerciseChart(); },
  'body-range': el => { view.bodyRange = el.dataset.k; $$('[data-act=body-range]').forEach(b => b.classList.toggle('on', b === el)); jelly(el); drawBodyChart(); },
  goal: el => goalSheet(el.dataset.id),
  'goal-del': async el => { if (await confirmSheet('Remover meta?', '', 'Remover')) { S.goals = S.goals.filter(g => g.id !== el.dataset.id); save(); render(true); } },
  weigh: weighSheet,
  measure: measureSheet,
  photo: el => { const id = el.dataset.id; if (sel.has(id)) sel.delete(id); else { if (sel.size >= 2) sel.delete([...sel][0]); sel.add(id); } $$('.photo[data-id]').forEach(p => p.classList.toggle('sel', sel.has(p.dataset.id))); jelly(el); buzz(8); updateCmp(); },
  compare: compareSheet,
  'photo-del': async () => { if (!await confirmSheet('Excluir foto?', 'Ela some do aparelho.', 'Excluir')) return; for (const id of sel) await idb.del(id); sel.clear(); loadPhotos(); },
  settings: settingsSheet,
  plates: el => { const ei = el.dataset.ei; let kg; if (ei !== undefined && S.active) { const e = S.active.exercises[+ei]; let si = e.sets.findIndex(x => !x.done); if (si < 0) si = e.sets.length - 1; kg = num(e.sets[si]?.kg) || num($(`tr[data-ei="${ei}"][data-si="${si}"] input[data-f=kg]`)?.placeholder); } platesSheet(kg); },
  rm: rmSheet,
  routines: routinesSheet,
  badge: el => { const b = BADGES.find(x => x.id === el.dataset.id); const on = S.badges[b.id]; jelly(el); toast(`${b.name}: ${b.desc}${on ? ` · ${fmtDate(on)}` : ''}`, on ? b.e : '🔒', 2200); },
  export: exportData,
  wipe: async () => {
    if (!await confirmSheet('Apagar tudo?', 'Treinos, medidas, fotos e conquistas somem deste aparelho. Exporte um backup antes se quiser guardar.', 'Apagar tudo')) return;
    S = DEFAULTS(); save(); await idb.clear(); view.ex = null; view.tab = 'home'; render(); updateGo(); toast('Tudo apagado', '🧹');
  },
  // treino
  'wo-min': () => { closeWorkout(); toast('Treino continua rodando', '⏱️', 1800); },
  'wo-add': async () => {
    const ids = await pickExercises(); if (!ids.length) return;
    const n0 = S.active.exercises.length;
    ids.forEach(id => S.active.exercises.push(newExEntry(id))); save(); renderWorkout(true);
    $$('.ex', WO()).slice(n0).forEach((x, i) => { x.style.animation = ''; x.style.animationDelay = i * 70 + 'ms'; });
    $$('.ex', WO())[n0]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  },
  'wo-finish': finishWorkout,
  'wo-discard': async () => { if (await confirmSheet('Descartar treino?', 'Nada desse treino será salvo.', 'Descartar')) discardWorkout(); },
  'set-check': el => toggleSet(el),
  'set-add': el => {
    const e = S.active.exercises[+el.dataset.ei]; const l = e.sets[e.sets.length - 1];
    e.sets.push({ kg: l ? l.kg : '', reps: l ? l.reps : '', done: false }); save(); renderWorkout(true);
    const rows = $$(`tr[data-ei="${el.dataset.ei}"]`, WO()); popEl(rows[rows.length - 1]); jelly($(`.ex[data-ei="${el.dataset.ei}"] .add-set`, WO()));
  },
  'set-del': el => {
    const e = S.active.exercises[+el.dataset.ei]; if (e.sets.length <= 1) { jelly(el.closest('tr')); return; }
    const tr = el.closest('tr');
    const a = anim(tr, [{ transform: 'none', opacity: 1 }, { transform: 'translateX(40px) scale(.9)', opacity: 0 }], { duration: 220, easing: 'ease-in', fill: 'forwards' });
    const go = () => { e.sets.splice(+el.dataset.si, 1); save(); renderWorkout(true); };
    a ? a.onfinish = go : go();
  },
  'ex-menu': el => {
    const i = +el.dataset.ei; const ex = exById(S.active.exercises[i].exId);
    const sh = openSheet(`<h2>${esc(ex.name)}</h2>
      <button class="list-item press" data-x="hist"><div class="ava">${icon('chart')}</div><div class="grow b">Ver progresso</div>${icon('chev', 'ic chev')}</button>
      ${i > 0 ? `<button class="list-item press" data-x="up"><div class="ava" style="transform:rotate(90deg)">${icon('back')}</div><div class="grow b">Mover pra cima</div></button>` : ''}
      <button class="list-item press" data-x="rm"><div class="ava" style="color:var(--bad)">${icon('trash')}</div><div class="grow b" style="color:var(--bad)">Remover do treino</div></button>`);
    sh.addEventListener('click', e => {
      const b = e.target.closest('[data-x]'); if (!b) return; closeSheet(sh);
      if (b.dataset.x === 'rm') { S.active.exercises.splice(i, 1); save(); renderWorkout(true); }
      if (b.dataset.x === 'up') { const a = S.active.exercises; [a[i - 1], a[i]] = [a[i], a[i - 1]]; save(); renderWorkout(true); jelly($$('.ex', WO())[i - 1]); }
      if (b.dataset.x === 'hist') { if (!history(ex.id).length) { toast('Ainda sem histórico desse exercício', '📈'); return; } closeWorkout(); ACT['open-ex']({ dataset: { id: ex.id } }); }
    });
  },
  'rest-open': () => {
    const sh = openSheet(`<h2>Timer de descanso</h2><p class="lead">Começa sozinho quando você conclui uma série.</p>
      <div class="grid3">${[30, 60, 90, 120, 180, 240].map(n => `<button class="btn" data-s="${n}">${fmtDur(n)}</button>`).join('')}</div>`);
    sh.addEventListener('click', e => { const b = e.target.closest('[data-s]'); if (!b) return; closeSheet(sh); startRest(+b.dataset.s); });
  },
  'rest-add': el => { if (!rest) return; rest.end += +el.dataset.s * 1000; rest.total = Math.max(rest.total + +el.dataset.s, 1); if (rest.end < Date.now()) rest.end = Date.now(); jelly(el); tickRest(); },
  'rest-skip': () => { rest = null; clearInterval(restT); renderRest(); }
};

document.addEventListener('click', e => {
  const tabBtn = e.target.closest('.tab');
  if (tabBtn) {
    const t = tabBtn.dataset.tab; jelly($('.ti', tabBtn) || tabBtn); buzz(6);
    if (t === 'train') { startSheet(); return; }
    if (view.tab === t && view.ex) view.ex = null;
    view.tab = t; scrollTo(0, 0); render(); return;
  }
  const go = e.target.closest('[data-tab-go]');
  if (go) { view.tab = go.dataset.tabGo; view.ex = null; scrollTo(0, 0); render(); return; }
  if (e.target.closest('[data-close]')) { closeSheet(); return; }
  const a = e.target.closest('[data-act]');
  if (a && ACT[a.dataset.act]) ACT[a.dataset.act](a, e);
});
document.addEventListener('input', e => { if (e.target.closest('#workout')) onWorkoutInput(e); });
document.addEventListener('change', async e => {
  if (e.target.id === 'photoIn' && e.target.files[0]) {
    try {
      const data = await resizeImage(e.target.files[0]);
      await idb.put({ id: uid(), d: Date.now(), data }); toast('Foto salva', '📸');
      await loadPhotos(); checkBadges();
      popEl($('.photo[data-id]'));
    } catch { toast('Não consegui abrir essa imagem', '⚠️'); }
    e.target.value = '';
  }
  if (e.target.id === 'importIn' && e.target.files[0]) { await importData(e.target.files[0]); e.target.value = ''; }
});
// selecionar tudo ao focar facilita trocar a carga
document.addEventListener('focusin', e => { if (e.target.matches('.sets input, #glV, #wV, #plV')) setTimeout(() => e.target.select(), 0); });
addEventListener('resize', () => { moveBlob(); $$('.seg').forEach(moveSeg); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) { tickClock(); tickRest(); } });

function updateGo() { $('.go-btn').classList.toggle('live', !!S.active); }

// ícones da tab bar
$$('[data-icon]').forEach(s => s.innerHTML = icon(s.dataset.icon));

// ---------- início ----------
render();
updateGo();
if (S.active) openWorkout();
checkBadges(true);
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => { });
