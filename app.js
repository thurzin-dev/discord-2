/* =====================================================================
   Discord 2 — chamada de voz + compartilhamento de tela, P2P (WebRTC)
   ---------------------------------------------------------------------
   Como funciona:
   - Cada sala tem até MAX_SLOTS "vagas". O ID de cada pessoa no servidor
     de sinalização (PeerJS cloud) é determinístico: <prefixo>-<sala>-<vaga>.
   - Ao entrar, você tenta a vaga 0, 1, 2… até conseguir uma livre.
   - Depois tenta abrir uma conexão de dados com todas as outras vagas.
     As vagas vazias falham ("peer-unavailable") e são ignoradas.
   - Quando a conexão de dados abre, a pessoa com a MENOR vaga liga (mic).
     A outra atende com o próprio mic → 1 conexão de mídia por par.
   - Compartilhamento de tela = uma segunda chamada de mídia por par,
     sempre iniciada por quem compartilha (metadata.type = "screen").
   - Chat, nome, estado de mute e de tela viajam pela conexão de dados.
   ===================================================================== */

'use strict';

const ROOM_PREFIX = 'd2v1';
const MAX_SLOTS = 12;
const SPEAK_THRESHOLD = 0.02;
const MIC_WATCHDOG_MS = 20000;
const DEBUG = new URLSearchParams(location.search).has('debug');

const ICE_CONFIG = {
  iceServers: [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] },
    // Relay público (Open Relay Project, Metered). Só entra em ação quando o
    // P2P direto não é possível (roteadores muito restritivos / CGNAT).
    { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
  ],
  iceCandidatePoolSize: 2,
};

const $ = (id) => document.getElementById(id);

const ui = {
  lobby: $('lobby'), call: $('call'),
  joinForm: $('join-form'), nameInput: $('name-input'), roomInput: $('room-input'),
  randomRoom: $('random-room'), joinBtn: $('join-btn'), lobbyError: $('lobby-error'),
  lobbyMicSelect: $('lobby-mic-select'), lobbyMicTest: $('lobby-mic-test'),
  lobbyMeter: $('lobby-meter-bar'), lobbyMicStatus: $('lobby-mic-status'),
  roomName: $('room-name'), inviteBtn: $('invite-btn'), connStatus: $('conn-status'),
  participants: $('participants'), participantCount: $('participant-count'),
  stage: $('stage'), stageEmpty: $('stage-empty'), banner: $('banner'),
  micBtn: $('mic-btn'), deafenBtn: $('deafen-btn'), shareBtn: $('share-btn'),
  settingsBtn: $('settings-btn'), chatToggleBtn: $('chat-toggle-btn'), leaveBtn: $('leave-btn'),
  chatLog: $('chat-log'), chatForm: $('chat-form'), chatInput: $('chat-input'),
  settingsModal: $('settings-modal'), settingsClose: $('settings-close'),
  micSelect: $('mic-select'), settingsMeter: $('settings-meter-bar'), shareQuality: $('share-quality'),
  toast: $('toast'),
};

/* ------------------------------ Estado ------------------------------ */
const state = {
  name: '', room: '', slot: -1, myId: '',
  peer: null,
  peers: new Map(),          // peerId -> entry (ver makeEntry)
  pendingData: new Map(),    // peerId -> DataConnection ainda não aberta (saída)
  knownSlots: new Set(),     // vagas que sabemos estar ocupadas (vale a pena insistir)
  localStream: null,         // stream com a track do mic (ou silêncio)
  micTrack: null,
  micIsReal: false,
  muted: false,
  deafened: false,
  screenStream: null,
  inCall: false,
  audioCtx: null,
  localAnalyser: null,
  mutedByDeafen: false,
  analysers: [],             // {stream, analyser, buf, onLevel}
  reconnectTries: 0,
  leaving: false,
};

function makeEntry(peerId, slot) {
  return {
    id: peerId, slot, name: 'Vaga ' + slot,
    data: null, mic: null, screenIn: null, screenOut: null,
    stream: null, audioEl: null, screenTile: null,
    muted: false, sharing: false, volume: 1,
    micRetries: 0, micRetryTimer: null, micWatchdog: null,
    el: null, analyser: null, announced: false, leaveTimer: null,
  };
}

/* ------------------------------ Utils ------------------------------ */
function idFor(room, slot) { return `${ROOM_PREFIX}-${room}-${slot}`; }
function slotFromId(id) {
  const m = /-(\d+)$/.exec(id || '');
  return m ? parseInt(m[1], 10) : -1;
}
function sanitizeRoom(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 32);
}
function randomRoom() {
  const a = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
}
function colorFor(str) {
  let h = 0;
  for (const c of String(str)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `hsl(${h % 360} 60% 45%)`;
}
function initials(name) {
  return (name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function timeNow() {
  const d = new Date();
  return d.toTimeString().slice(0, 5);
}
let toastTimer = null;
function toast(msg, ms = 2600) {
  ui.toast.textContent = msg;
  ui.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { ui.toast.hidden = true; }, ms);
}
function setBanner(msg) {
  if (!msg) { ui.banner.hidden = true; ui.banner.textContent = ''; return; }
  ui.banner.textContent = msg;
  ui.banner.hidden = false;
}
function setConnStatus(text, cls) {
  ui.connStatus.textContent = text;
  ui.connStatus.className = 'conn-status' + (cls ? ' ' + cls : '');
}
function getAudioCtx() {
  if (!state.audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    state.audioCtx = new AC();
  }
  if (state.audioCtx.state === 'suspended') state.audioCtx.resume().catch(() => {});
  return state.audioCtx;
}

/* --------------------------- Microfone --------------------------- */
function micConstraints(deviceId) {
  const audio = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1,
  };
  if (deviceId && deviceId !== 'default-any') audio.deviceId = { exact: deviceId };
  return { audio, video: false };
}

async function getMic(deviceId) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error('Este navegador não suporta captura de microfone (precisa de HTTPS ou localhost).');
  }
  try {
    return await navigator.mediaDevices.getUserMedia(micConstraints(deviceId));
  } catch (e) {
    // Se o device escolhido sumiu, tenta qualquer um.
    if (deviceId && (e.name === 'OverconstrainedError' || e.name === 'NotFoundError')) {
      return await navigator.mediaDevices.getUserMedia(micConstraints(null));
    }
    throw e;
  }
}

function micErrorMessage(e) {
  switch (e && e.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Permissão do microfone negada. Clique no cadeado na barra de endereço, permita o microfone e recarregue a página.';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'Nenhum microfone encontrado. Conecte um microfone/headset e tente de novo.';
    case 'NotReadableError':
    case 'TrackStartError':
      return 'O microfone está sendo usado por outro programa (Discord, OBS, jogo…). Feche-o e tente de novo.';
    default:
      return 'Não foi possível acessar o microfone: ' + (e && (e.message || e.name) || 'erro desconhecido');
  }
}

// Stream de silêncio: permite entrar "só ouvindo" quando não há microfone.
function silentStream() {
  const ctx = getAudioCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  gain.gain.value = 0;
  const dst = ctx.createMediaStreamDestination();
  osc.connect(gain).connect(dst);
  osc.start();
  const track = dst.stream.getAudioTracks()[0];
  track.enabled = false;
  return dst.stream;
}

async function listMics(selects) {
  let devices = [];
  try { devices = await navigator.mediaDevices.enumerateDevices(); } catch (_) { /* ignore */ }
  const mics = devices.filter(d => d.kind === 'audioinput');
  for (const sel of selects) {
    const current = sel.value;
    sel.innerHTML = '';
    const optAny = document.createElement('option');
    optAny.value = 'default-any';
    optAny.textContent = mics.length ? 'Padrão do sistema' : 'Nenhum microfone detectado';
    sel.appendChild(optAny);
    mics.forEach((m, i) => {
      const o = document.createElement('option');
      o.value = m.deviceId;
      o.textContent = m.label || `Microfone ${i + 1}`;
      sel.appendChild(o);
    });
    if ([...sel.options].some(o => o.value === current)) sel.value = current;
  }
}

/* --------------------- Medidor / detecção de fala --------------------- */
function attachAnalyser(stream, onLevel) {
  try {
    const ctx = getAudioCtx();
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    src.connect(analyser);
    const rec = { stream, src, analyser, buf: new Uint8Array(analyser.fftSize), onLevel };
    state.analysers.push(rec);
    return rec;
  } catch (e) {
    console.warn('Analyser indisponível', e);
    return null;
  }
}
function detachAnalyser(rec) {
  if (!rec) return;
  try { rec.src.disconnect(); } catch (_) { /* ignore */ }
  state.analysers = state.analysers.filter(r => r !== rec);
}
function levelLoop() {
  for (const r of state.analysers) {
    r.analyser.getByteTimeDomainData(r.buf);
    let sum = 0;
    for (let i = 0; i < r.buf.length; i++) { const v = (r.buf[i] - 128) / 128; sum += v * v; }
    const rms = Math.sqrt(sum / r.buf.length);
    try { r.onLevel(rms); } catch (_) { /* ignore */ }
  }
  requestAnimationFrame(levelLoop);
}
requestAnimationFrame(levelLoop);

/* ------------------------------ Lobby ------------------------------ */
let lobbyTestStream = null;
let lobbyTestAnalyser = null;

async function lobbyTestMic() {
  ui.lobbyMicStatus.textContent = 'Pedindo permissão…';
  try {
    if (lobbyTestStream) lobbyTestStream.getTracks().forEach(t => t.stop());
    detachAnalyser(lobbyTestAnalyser);
    lobbyTestStream = await getMic(ui.lobbyMicSelect.value);
    await listMics([ui.lobbyMicSelect, ui.micSelect]); // agora com labels
    const label = lobbyTestStream.getAudioTracks()[0].label || 'microfone';
    ui.lobbyMicStatus.textContent = `✅ ${label} — fale algo e veja a barra se mexer.`;
    lobbyTestAnalyser = attachAnalyser(lobbyTestStream, (rms) => {
      ui.lobbyMeter.style.width = Math.min(100, rms * 400) + '%';
    });
  } catch (e) {
    ui.lobbyMicStatus.textContent = '⚠️ ' + micErrorMessage(e);
    ui.lobbyMeter.style.width = '0%';
  }
}

function stopLobbyTest() {
  if (lobbyTestStream) lobbyTestStream.getTracks().forEach(t => t.stop());
  lobbyTestStream = null;
  detachAnalyser(lobbyTestAnalyser);
  lobbyTestAnalyser = null;
  ui.lobbyMeter.style.width = '0%';
}

ui.lobbyMicTest.addEventListener('click', lobbyTestMic);
ui.lobbyMicSelect.addEventListener('change', () => { if (lobbyTestStream) lobbyTestMic(); });
ui.randomRoom.addEventListener('click', () => { ui.roomInput.value = randomRoom(); });

(function initLobby() {
  const params = new URLSearchParams(location.search);
  const room = sanitizeRoom(params.get('sala') || params.get('room') || '');
  try {
    ui.nameInput.value = localStorage.getItem('d2.name') || '';
    ui.roomInput.value = room || localStorage.getItem('d2.room') || '';
  } catch (_) { ui.roomInput.value = room; }
  if (!ui.roomInput.value) ui.roomInput.value = randomRoom();
  listMics([ui.lobbyMicSelect, ui.micSelect]);
  if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
    navigator.mediaDevices.addEventListener('devicechange', () => listMics([ui.lobbyMicSelect, ui.micSelect]));
  }
  if (!window.isSecureContext) {
    ui.lobbyMicStatus.textContent = '⚠️ Esta página não está em HTTPS: o navegador vai bloquear o microfone.';
  }
})();

ui.joinForm.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  ui.lobbyError.hidden = true;
  const name = ui.nameInput.value.trim();
  const room = sanitizeRoom(ui.roomInput.value);
  if (!name) { showLobbyError('Digite seu nome.'); return; }
  if (!room) { showLobbyError('Digite um código de sala (letras e números).'); return; }
  if (typeof Peer === 'undefined') { showLobbyError('Biblioteca de conexão não carregou. Verifique sua internet e recarregue.'); return; }
  ui.roomInput.value = room;
  try { localStorage.setItem('d2.name', name); localStorage.setItem('d2.room', room); } catch (_) { /* ignore */ }

  ui.joinBtn.disabled = true;
  ui.joinBtn.textContent = 'Entrando…';
  getAudioCtx(); // cria o AudioContext dentro do gesto do usuário
  try {
    await joinRoom(name, room);
  } catch (e) {
    console.error(e);
    showLobbyError(e && e.message ? e.message : String(e));
    await leaveRoom(true);
  } finally {
    ui.joinBtn.disabled = false;
    ui.joinBtn.textContent = 'Entrar na call';
  }
});
function showLobbyError(msg) { ui.lobbyError.textContent = msg; ui.lobbyError.hidden = false; }

/* ------------------------------ Entrar ------------------------------ */
async function joinRoom(name, room) {
  state.name = name; state.room = room; state.leaving = false;

  // 1) Microfone (ou silêncio se não der)
  let micWarning = '';
  stopLobbyTest();
  try {
    state.localStream = await getMic(ui.lobbyMicSelect.value);
    state.micIsReal = true;
  } catch (e) {
    state.localStream = silentStream();
    state.micIsReal = false;
    micWarning = micErrorMessage(e) + ' Você entrou só ouvindo.';
  }
  state.micTrack = state.localStream.getAudioTracks()[0];
  state.micTrack.enabled = !state.muted && state.micIsReal;

  // 2) Pegar uma vaga na sala
  setConnStatus('Conectando ao servidor…');
  const { peer, slot } = await claimSlot(room);
  state.peer = peer; state.slot = slot; state.myId = peer.id;
  state.knownSlots = new Set();
  for (let i = 0; i < slot; i++) state.knownSlots.add(i);

  // 3) UI
  showCall();
  ui.roomName.textContent = room;
  setBanner(micWarning);
  if (micWarning) toast('Sem microfone: você entrou só ouvindo.');
  history.replaceState(null, '', `${location.pathname}?sala=${encodeURIComponent(room)}`);
  renderParticipants();
  updateControls();
  addSysMessage(`Você entrou na sala "${room}".`);

  // 4) Nível do próprio mic (indicador de fala + medidor dos ajustes)
  if (state.micIsReal) attachLocalAnalyser();

  // 5) Descobrir quem já está na sala
  wirePeer(peer);
  discoverPeers();
  setConnStatus('Conectado', 'ok');
}

function attachLocalAnalyser() {
  detachAnalyser(state.localAnalyser);
  state.localAnalyser = attachAnalyser(new MediaStream([state.micTrack]), (rms) => {
    ui.settingsMeter.style.width = Math.min(100, rms * 400) + '%';
    const speaking = rms > SPEAK_THRESHOLD && !state.muted && state.micIsReal;
    const me = ui.participants.querySelector('[data-self]');
    if (me) me.classList.toggle('speaking', speaking);
  });
}

function claimSlot(room, start = 0) {
  return new Promise((resolve, reject) => {
    const tryslot = (slot) => {
      if (slot >= MAX_SLOTS) { reject(new Error(`A sala "${room}" está cheia (máx. ${MAX_SLOTS} pessoas).`)); return; }
      const id = idFor(room, slot);
      const t0 = performance.now();
      const peer = new Peer(id, { config: ICE_CONFIG, debug: DEBUG ? 3 : 0 });
      if (DEBUG) console.log('[claim] tentando', id);
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try { peer.destroy(); } catch (_) { /* ignore */ }
        reject(new Error('Não foi possível conectar ao servidor de sinalização (tempo esgotado). Verifique sua internet e tente de novo.'));
      }, 15000);
      peer.on('open', () => {
        if (DEBUG) console.log('[claim] open', id, Math.round(performance.now() - t0) + 'ms');
        if (settled) return;
        settled = true; clearTimeout(timer);
        resolve({ peer, slot });
      });
      peer.on('error', (err) => {
        if (DEBUG) console.log('[claim] error', id, err.type, Math.round(performance.now() - t0) + 'ms');
        if (settled) return;
        settled = true; clearTimeout(timer);
        if (err.type === 'unavailable-id') {
          try { peer.destroy(); } catch (_) { /* ignore */ }
          tryslot(slot + 1);
        } else {
          try { peer.destroy(); } catch (_) { /* ignore */ }
          reject(new Error(describePeerError(err)));
        }
      });
    };
    tryslot(start);
  });
}

function describePeerError(err) {
  switch (err && err.type) {
    case 'browser-incompatible': return 'Seu navegador não suporta chamadas WebRTC. Use Chrome, Edge ou Firefox atualizados.';
    case 'network': case 'socket-error': case 'socket-closed': case 'server-error':
      return 'Falha ao conectar no servidor de sinalização. Verifique sua internet (ou se um firewall bloqueia WebSocket) e tente de novo.';
    case 'ssl-unavailable': return 'Servidor sem SSL disponível.';
    case 'invalid-id': return 'Código de sala inválido. Use só letras, números e hífen.';
    default: return (err && err.message) || 'Erro desconhecido de conexão.';
  }
}

/* --------------------------- Eventos do Peer --------------------------- */
function wirePeer(peer) {
  peer.on('connection', onIncomingData);
  peer.on('call', onIncomingCall);
  peer.on('disconnected', () => {
    if (state.leaving || peer !== state.peer) return;
    setConnStatus('Reconectando ao servidor…');
    scheduleReconnect();
  });
  peer.on('close', () => {
    if (state.leaving || peer !== state.peer) return;
    setConnStatus('Desconectado', 'bad');
  });
  peer.on('error', (err) => {
    if (peer !== state.peer) return;
    if (err.type === 'peer-unavailable') {
      // Vaga vazia: limpa a tentativa pendente.
      const m = /peer\s+(\S+)/i.exec(err.message || '');
      const id = m ? m[1] : null;
      if (id && state.pendingData.has(id)) {
        const c = state.pendingData.get(id);
        c.__unavailable = true;
        state.knownSlots.delete(slotFromId(id));
        state.pendingData.delete(id);
        try { c.close(); } catch (_) { /* ignore */ }
      }
      return;
    }
    console.warn('Peer error', err.type, err);
    if (['network', 'socket-error', 'socket-closed', 'server-error'].includes(err.type)) {
      setConnStatus('Problema de rede…', 'bad');
      scheduleReconnect();
    }
  });
}

let reconnectTimer = null;
function scheduleReconnect() {
  if (reconnectTimer || state.leaving) return;
  const delay = Math.min(15000, 1000 * Math.pow(2, state.reconnectTries));
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    const peer = state.peer;
    if (!peer || state.leaving) return;
    if (peer.destroyed) { setConnStatus('Conexão perdida. Saia e entre de novo.', 'bad'); return; }
    if (peer.disconnected) {
      state.reconnectTries++;
      try { peer.reconnect(); } catch (e) { console.warn(e); }
      // Se reconectar, o PeerJS emite 'open' de novo.
      peer.once('open', () => {
        state.reconnectTries = 0;
        setConnStatus('Conectado', 'ok');
        discoverPeers();
      });
      if (state.reconnectTries < 8) scheduleReconnect();
      else setConnStatus('Sem conexão com o servidor. Saia e entre de novo.', 'bad');
    }
  }, delay);
}

const PENDING_TIMEOUT_MS = 15000;
const PENDING_MAX_TRIES = 3;
const LEAVE_GRACE_MS = 1500;
const PRESENCE_EVERY_MS = 10000;

/* Descoberta: tento abrir uma conexão de dados com TODAS as outras vagas.
   Garantia importante: quando eu recebo a vaga S, todas as vagas menores
   estavam ocupadas (por isso não consegui pegá-las), logo já estão
   registradas no servidor → minha conexão de saída para elas sempre chega.
   Já a conexão para uma vaga maior pode falhar se a pessoa ainda estiver
   entrando; nesse caso ELA vai se conectar comigo. Por isso a regra de
   desempate em conexão dupla é: vence a conexão iniciada pela MAIOR vaga. */
function discoverPeers() {
  if (!state.peer || state.peer.disconnected) return;
  for (let s = 0; s < MAX_SLOTS; s++) connectToSlot(s, 1);
}

function connectToSlot(s, attempt) {
  if (!state.peer || state.peer.disconnected || state.leaving) return;
  if (s === state.slot) return;
  const id = idFor(state.room, s);
  const entry = state.peers.get(id);
  if (entry && entry.data && entry.data.open) return;
  if (state.pendingData.has(id)) return;
  const conn = state.peer.connect(id, {
    reliable: true, serialization: 'json',
    metadata: { name: state.name, slot: state.slot },
  });
  if (!conn) return;
  conn.__initiatorSlot = state.slot;
  conn.__unavailable = false;
  state.pendingData.set(id, conn);
  const drop = () => {
    if (state.pendingData.get(id) === conn) state.pendingData.delete(id);
  };
  const timer = setTimeout(() => {
    if (conn.open) return;
    drop();
    try { conn.close(); } catch (_) { /* ignore */ }
    // Demorou demais sem o servidor dizer que a vaga está vazia: pode ser
    // sinalização/ICE lento. Tenta de novo algumas vezes.
    if (!conn.__unavailable && state.knownSlots.has(s) && attempt < PENDING_MAX_TRIES) {
      setTimeout(() => connectToSlot(s, attempt + 1), 1000);
    }
  }, PENDING_TIMEOUT_MS);
  conn.on('open', () => { clearTimeout(timer); drop(); acceptData(conn, s, false); });
  conn.on('error', () => { clearTimeout(timer); drop(); });
  conn.on('close', () => { clearTimeout(timer); drop(); });
}

// Fofoca de presença: cada um conta para os outros quem está vendo.
// Se eu souber de uma vaga ocupada com a qual não estou conectado, eu ligo.
function connectedSlots() {
  return [...state.peers.values()].filter(e => e.data && e.data.open).map(e => e.slot);
}
function sendPresence() {
  if (!state.inCall) return;
  broadcast({ type: 'presence', slots: connectedSlots() });
}
setInterval(sendPresence, PRESENCE_EVERY_MS);

/* ------------------------ Conexões de dados ------------------------ */
function onIncomingData(conn) {
  const theirId = conn.peer;
  if (!theirId.startsWith(`${ROOM_PREFIX}-${state.room}-`)) {
    conn.on('open', () => { try { conn.close(); } catch (_) { /* ignore */ } });
    return;
  }
  const theirSlot = (conn.metadata && Number.isInteger(conn.metadata.slot)) ? conn.metadata.slot : slotFromId(theirId);
  conn.__initiatorSlot = theirSlot;
  // Nunca recusa: aceita e, se ficar duplicada, resolve em acceptData().
  if (conn.open) acceptData(conn, theirSlot, true);
  else conn.on('open', () => acceptData(conn, theirSlot, true));
}

function acceptData(conn, theirSlot, incoming) {
  const theirId = conn.peer;
  let entry = state.peers.get(theirId);
  if (!entry) {
    entry = makeEntry(theirId, theirSlot);
    state.peers.set(theirId, entry);
  }
  clearTimeout(entry.leaveTimer); entry.leaveTimer = null;

  if (entry.data && entry.data !== conn && entry.data.open) {
    // Conexão dupla: vence a iniciada pela maior vaga; empate → a mais nova.
    const oldInit = entry.data.__initiatorSlot ?? -1;
    const newInit = conn.__initiatorSlot ?? -1;
    if (newInit >= oldInit) {
      const old = entry.data;
      entry.data = null;
      try { old.close(); } catch (_) { /* ignore */ }
    } else {
      try { conn.close(); } catch (_) { /* ignore */ }
      return;
    }
  }
  entry.data = conn;
  state.knownSlots.add(entry.slot);
  if (incoming && conn.metadata && conn.metadata.name) entry.name = String(conn.metadata.name).slice(0, 24);

  conn.on('data', (msg) => { if (entry.data === conn) onData(entry, conn, msg); });
  conn.on('close', () => {
    if (entry.data !== conn) return; // conexão antiga/duplicada: ignora
    entry.data = null;
    // Dá um tempinho: pode ser só uma troca de conexão duplicada.
    clearTimeout(entry.leaveTimer);
    entry.leaveTimer = setTimeout(() => {
      if (state.peers.get(theirId) === entry && !(entry.data && entry.data.open)) removePeer(theirId, true);
    }, LEAVE_GRACE_MS);
  });
  conn.on('error', (e) => console.warn('data error', theirId, e));

  sendTo(entry, { type: 'hello', name: state.name, muted: state.muted || !state.micIsReal, sharing: !!state.screenStream });
  sendTo(entry, { type: 'presence', slots: connectedSlots() });
  renderParticipants();
  // Só anuncia quando o nome é conhecido (conexão de entrada traz o nome na metadata;
  // na de saída, esperamos o 'hello').
  if (incoming && !entry.announced) { entry.announced = true; addSysMessage(`${entry.name} entrou.`); }

  // Menor vaga inicia a chamada de voz.
  if (state.slot < entry.slot) startMicCall(entry);
  // Se estou compartilhando, mando a tela pra quem chegou.
  if (state.screenStream) startScreenCall(entry);
}


function sendTo(entry, obj) {
  if (entry.data && entry.data.open) {
    try { entry.data.send(obj); } catch (e) { console.warn('send falhou', e); }
  }
}
function broadcast(obj) { for (const e of state.peers.values()) sendTo(e, obj); }

function onData(entry, conn, msg) {
  if (!msg || typeof msg !== 'object') return;
  switch (msg.type) {
    case 'hello':
      entry.name = String(msg.name || entry.name).slice(0, 24);
      entry.muted = !!msg.muted;
      entry.sharing = !!msg.sharing;
      if (!entry.announced) { entry.announced = true; addSysMessage(`${entry.name} entrou.`); }
      renderParticipants();
      break;
    case 'mute':
      entry.muted = !!msg.muted;
      renderParticipants();
      break;
    case 'screen':
      entry.sharing = !!msg.on;
      renderParticipants();
      break;
    case 'chat':
      addChatMessage(entry.name, String(msg.text || '').slice(0, 500));
      break;
    case 'presence':
      if (Array.isArray(msg.slots)) {
        for (const s of msg.slots) {
          if (!Number.isInteger(s) || s < 0 || s >= MAX_SLOTS || s === state.slot) continue;
          state.knownSlots.add(s);
          const e2 = state.peers.get(idFor(state.room, s));
          if (e2 && e2.data && e2.data.open) continue;
          connectToSlot(s, 1);
        }
      }
      break;
    case 'mic-retry':
      // A outra pessoa (maior vaga) fechou a chamada travada e pediu outra.
      if (state.slot < entry.slot) {
        const old = entry.mic; entry.mic = null;
        clearTimeout(entry.micWatchdog); entry.micWatchdog = null;
        if (old) { try { old.close(); } catch (_) { /* ignore */ } }
        detachRemoteAudio(entry);
        startMicCall(entry);
      }
      break;
    default: break;
  }
}

/* ------------------------- Chamadas de mídia ------------------------- */
function callOptions(type) {
  return { metadata: { type, name: state.name, slot: state.slot } };
}

function startMicCall(entry) {
  if (!state.peer || state.peer.disconnected) return;
  if (entry.mic) return; // já existe (pendente ou aberta): nunca duplica
  const call = state.peer.call(entry.id, state.localStream, callOptions('mic'));
  if (!call) return;
  bindMicCall(entry, call);
}

// Fecha a chamada de voz atual e, se eu for a menor vaga, liga de novo.
function restartMicCall(entry) {
  const old = entry.mic;
  entry.mic = null;
  clearTimeout(entry.micWatchdog); entry.micWatchdog = null;
  if (old) { try { old.close(); } catch (_) { /* ignore */ } }
  detachRemoteAudio(entry);
  if (state.slot < entry.slot) startMicCall(entry);
  else sendTo(entry, { type: 'mic-retry' }); // pede pra quem liga refazer a chamada
  renderParticipants();
}

function onIncomingCall(call) {
  const theirId = call.peer;
  const entry = state.peers.get(theirId);
  const type = (call.metadata && call.metadata.type) || 'mic';
  if (!entry) {
    // Ainda não temos dados dele? Aceita mesmo assim (dados chegam logo).
    const e = makeEntry(theirId, slotFromId(theirId));
    if (call.metadata && call.metadata.name) e.name = String(call.metadata.name).slice(0, 24);
    state.peers.set(theirId, e);
    renderParticipants();
    return onIncomingCall(call);
  }
  if (type === 'screen') {
    if (entry.screenIn && entry.screenIn !== call) { try { entry.screenIn.close(); } catch (_) { /* ignore */ } }
    entry.screenIn = call;
    call.answer(); // só recebe
    bindScreenIn(entry, call);
    return;
  }
  // mic: só a menor vaga liga. Se chegou outra chamada, é um retry → a mais nova vence.
  if (entry.mic && entry.mic !== call) {
    const old = entry.mic;
    entry.mic = null;
    try { old.close(); } catch (_) { /* ignore */ }
    detachRemoteAudio(entry);
  }
  call.answer(state.localStream);
  bindMicCall(entry, call);
}

function bindMicCall(entry, call) {
  entry.mic = call;
  let gotStream = false;
  clearTimeout(entry.micWatchdog);
  entry.micWatchdog = setTimeout(() => {
    if (entry.mic !== call || state.leaving) return;
    const pc = call.peerConnection;
    const ok = pc && ['connected', 'completed'].includes(pc.iceConnectionState) && gotStream;
    if (ok) return;
    if (entry.micRetries < 5) {
      entry.micRetries++;
      restartMicCall(entry);
    } else {
      toast(`Não consegui conectar o áudio com ${entry.name}. Peçam para sair e entrar de novo.`, 5000);
    }
  }, MIC_WATCHDOG_MS);
  call.on('stream', (remote) => {
    if (gotStream && entry.stream && entry.stream.id === remote.id) return;
    gotStream = true;
    attachRemoteAudio(entry, remote);
  });
  call.on('close', () => {
    if (entry.mic !== call) return;
    entry.mic = null;
    clearTimeout(entry.micWatchdog); entry.micWatchdog = null;
    detachRemoteAudio(entry);
    // Se a pessoa ainda está na sala (dados abertos), tenta religar.
    if (state.peers.has(entry.id) && entry.data && entry.data.open && !state.leaving) {
      if (entry.micRetries < 5) {
        entry.micRetries++;
        clearTimeout(entry.micRetryTimer);
        entry.micRetryTimer = setTimeout(() => {
          if (state.slot < entry.slot) startMicCall(entry);
        }, 1500 * entry.micRetries);
      }
    }
    renderParticipants();
  });
  call.on('error', (e) => console.warn('mic call error', entry.id, e));
  watchIce(call, entry, 'voz');
}

function watchIce(call, entry, label) {
  const attach = () => {
    const pc = call.peerConnection;
    if (!pc) return false;
    pc.addEventListener('iceconnectionstatechange', () => {
      const s = pc.iceConnectionState;
      if (s === 'connected' || s === 'completed') { if (label === 'voz') entry.micRetries = 0; renderParticipants(); }
      if (s === 'failed') {
        toast(`Conexão de ${label} com ${entry.name} falhou. Tentando de novo…`);
        if (label === 'voz' && entry.mic === call) restartMicCall(entry);
      }
    });
    return true;
  };
  if (!attach()) setTimeout(attach, 500);
}

function attachRemoteAudio(entry, stream) {
  detachRemoteAudio(entry);
  entry.stream = stream;
  const audio = document.createElement('audio');
  audio.autoplay = true;
  audio.setAttribute('playsinline', '');
  audio.srcObject = stream;
  audio.volume = entry.volume;
  audio.muted = state.deafened;
  audio.style.display = 'none';
  document.body.appendChild(audio);
  audio.play().catch(() => {
    // Autoplay bloqueado: destrava no próximo clique.
    const unlock = () => { audio.play().catch(() => {}); document.removeEventListener('click', unlock); };
    document.addEventListener('click', unlock);
    toast('Clique em qualquer lugar para liberar o áudio.');
  });
  entry.audioEl = audio;
  entry.analyser = attachAnalyser(stream, (rms) => {
    if (!entry.el) return;
    entry.el.classList.toggle('speaking', rms > SPEAK_THRESHOLD && !state.deafened);
  });
  renderParticipants();
}

function detachRemoteAudio(entry) {
  if (entry.audioEl) { try { entry.audioEl.srcObject = null; entry.audioEl.remove(); } catch (_) { /* ignore */ } }
  entry.audioEl = null;
  entry.stream = null;
  detachAnalyser(entry.analyser);
  entry.analyser = null;
  if (entry.el) entry.el.classList.remove('speaking');
}

/* ------------------------- Tela compartilhada ------------------------- */
function shareConstraints() {
  const q = parseInt(ui.shareQuality.value, 10) || 720;
  const dims = { 480: [854, 480], 720: [1280, 720], 1080: [1920, 1080] }[q] || [1280, 720];
  return {
    video: { width: { ideal: dims[0] }, height: { ideal: dims[1] }, frameRate: { ideal: 30, max: 30 } },
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    // Chrome: preferir a aba/janela atual ficar fora da lista não é possível; ok.
    selfBrowserSurface: 'exclude',
    systemAudio: 'include',
  };
}

async function startScreenShare() {
  if (state.screenStream) return;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
    toast('Seu navegador não suporta compartilhar tela (use Chrome/Edge no PC).');
    return;
  }
  let stream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia(shareConstraints());
  } catch (e) {
    if (e && e.name !== 'NotAllowedError') toast('Não deu para compartilhar: ' + (e.message || e.name));
    return;
  }
  state.screenStream = stream;
  const vtrack = stream.getVideoTracks()[0];
  if (vtrack) {
    try { vtrack.contentHint = 'motion'; } catch (_) { /* ignore */ }
    vtrack.addEventListener('ended', () => stopScreenShare());
  }
  addScreenTile('self', stream, `${state.name} (você)`, true);
  for (const entry of state.peers.values()) startScreenCall(entry);
  broadcast({ type: 'screen', on: true });
  updateControls();
  renderParticipants();
}

function startScreenCall(entry) {
  if (!state.screenStream || !state.peer || state.peer.disconnected) return;
  if (!entry.data || !entry.data.open) return;
  if (entry.screenOut) { try { entry.screenOut.close(); } catch (_) { /* ignore */ } }
  const call = state.peer.call(entry.id, state.screenStream, callOptions('screen'));
  if (!call) return;
  entry.screenOut = call;
  call.on('close', () => { if (entry.screenOut === call) entry.screenOut = null; });
  call.on('error', (e) => console.warn('screen out error', e));
  watchIce(call, entry, 'tela');
}

function stopScreenShare() {
  if (!state.screenStream) return;
  const s = state.screenStream;
  state.screenStream = null;
  s.getTracks().forEach(t => { try { t.stop(); } catch (_) { /* ignore */ } });
  for (const entry of state.peers.values()) {
    if (entry.screenOut) { try { entry.screenOut.close(); } catch (_) { /* ignore */ } entry.screenOut = null; }
  }
  removeScreenTile('self');
  broadcast({ type: 'screen', on: false });
  updateControls();
  renderParticipants();
}

function bindScreenIn(entry, call) {
  let attached = null;
  call.on('stream', (remote) => {
    if (attached === remote.id) return;
    attached = remote.id;
    addScreenTile(entry.id, remote, entry.name, false);
    entry.sharing = true;
    renderParticipants();
  });
  call.on('close', () => {
    if (entry.screenIn === call) entry.screenIn = null;
    removeScreenTile(entry.id);
  });
  call.on('error', (e) => console.warn('screen in error', e));
}

function addScreenTile(key, stream, label, isSelf) {
  removeScreenTile(key);
  const tile = document.createElement('div');
  tile.className = 'tile';
  tile.dataset.key = key;
  const video = document.createElement('video');
  video.autoplay = true;
  video.playsInline = true;
  video.muted = isSelf || state.deafened; // não ouvir a própria tela (eco)
  video.srcObject = stream;
  video.play().catch(() => {});
  const lab = document.createElement('div');
  lab.className = 'tile-label';
  lab.textContent = `🖥️ ${label}`;
  const fs = document.createElement('button');
  fs.className = 'tile-fs';
  fs.title = 'Tela cheia';
  fs.textContent = '⛶';
  fs.addEventListener('click', () => {
    const el = tile;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
  });
  video.addEventListener('dblclick', () => fs.click());
  tile.append(video, lab, fs);
  ui.stage.appendChild(tile);
  updateStage();
}

function removeScreenTile(key) {
  const t = ui.stage.querySelector(`.tile[data-key="${CSS.escape(key)}"]`);
  if (t) {
    const v = t.querySelector('video');
    if (v) { try { v.srcObject = null; } catch (_) { /* ignore */ } }
    t.remove();
  }
  updateStage();
}

function updateStage() {
  const tiles = ui.stage.querySelectorAll('.tile');
  ui.stageEmpty.hidden = tiles.length > 0;
  ui.stage.classList.toggle('single', tiles.length === 1);
}

/* ----------------------------- Sair / limpar ----------------------------- */
function removePeer(peerId, announce) {
  const entry = state.peers.get(peerId);
  if (!entry) return;
  state.peers.delete(peerId);
  state.knownSlots.delete(entry.slot);
  clearTimeout(entry.micRetryTimer);
  clearTimeout(entry.micWatchdog);
  clearTimeout(entry.leaveTimer);
  for (const c of [entry.data, entry.mic, entry.screenIn, entry.screenOut]) {
    if (c) { try { c.close(); } catch (_) { /* ignore */ } }
  }
  detachRemoteAudio(entry);
  removeScreenTile(peerId);
  renderParticipants();
  if (announce) addSysMessage(`${entry.name} saiu.`);
}

async function leaveRoom(silent) {
  state.leaving = true;
  clearTimeout(reconnectTimer); reconnectTimer = null;
  for (const id of [...state.peers.keys()]) removePeer(id, false);
  for (const c of state.pendingData.values()) { try { c.close(); } catch (_) { /* ignore */ } }
  state.pendingData.clear();
  state.knownSlots.clear();
  if (state.screenStream) {
    state.screenStream.getTracks().forEach(t => { try { t.stop(); } catch (_) { /* ignore */ } });
    state.screenStream = null;
  }
  removeScreenTile('self');
  if (state.peer) { try { state.peer.destroy(); } catch (_) { /* ignore */ } }
  state.peer = null; state.slot = -1; state.myId = '';
  if (state.localStream) state.localStream.getTracks().forEach(t => { try { t.stop(); } catch (_) { /* ignore */ } });
  state.localStream = null; state.micTrack = null;
  detachAnalyser(state.localAnalyser); state.localAnalyser = null;
  state.deafened = false;
  state.reconnectTries = 0;
  ui.chatLog.innerHTML = '';
  ui.participants.innerHTML = '';
  setBanner('');
  state.inCall = false;
  if (!silent) toast('Você saiu da call.');
  showLobby();
  listMics([ui.lobbyMicSelect, ui.micSelect]);
}

window.addEventListener('beforeunload', () => {
  if (state.peer) { try { state.peer.destroy(); } catch (_) { /* ignore */ } }
});
window.addEventListener('pagehide', () => {
  if (state.peer) { try { state.peer.destroy(); } catch (_) { /* ignore */ } }
});

/* ------------------------------ Controles ------------------------------ */
function setMuted(muted) {
  state.muted = muted;
  if (state.micTrack) state.micTrack.enabled = !muted && state.micIsReal;
  broadcast({ type: 'mute', muted: state.muted || !state.micIsReal });
  updateControls();
  renderParticipants();
}
function setDeafened(deaf) {
  state.deafened = deaf;
  for (const e of state.peers.values()) {
    if (e.audioEl) e.audioEl.muted = deaf;
  }
  ui.stage.querySelectorAll('.tile').forEach(t => {
    if (t.dataset.key === 'self') return;
    const v = t.querySelector('video');
    if (v) v.muted = deaf;
  });
  if (deaf && !state.muted) { state.mutedByDeafen = true; setMuted(true); }
  else if (!deaf && state.mutedByDeafen) { state.mutedByDeafen = false; setMuted(false); }
  else updateControls();
}
function updateControls() {
  ui.micBtn.classList.toggle('off', state.muted || !state.micIsReal);
  ui.micBtn.querySelector('.ctl-icon').textContent = (state.muted || !state.micIsReal) ? '🔇' : '🎙️';
  ui.micBtn.querySelector('.ctl-label').textContent = !state.micIsReal ? 'Sem mic' : (state.muted ? 'Mutado' : 'Mic');
  ui.deafenBtn.classList.toggle('off', state.deafened);
  ui.deafenBtn.querySelector('.ctl-label').textContent = state.deafened ? 'Surdo' : 'Áudio';
  ui.shareBtn.classList.toggle('on', !!state.screenStream);
  ui.shareBtn.querySelector('.ctl-label').textContent = state.screenStream ? 'Parar de compartilhar' : 'Compartilhar tela';
}

ui.micBtn.addEventListener('click', async () => {
  if (!state.micIsReal) {
    // Tenta de novo pegar o microfone.
    try {
      await switchMic(ui.micSelect.value, true);
    } catch (e) { toast(micErrorMessage(e), 4000); }
    return;
  }
  setMuted(!state.muted);
});
ui.deafenBtn.addEventListener('click', () => setDeafened(!state.deafened));
ui.shareBtn.addEventListener('click', () => { if (state.screenStream) stopScreenShare(); else startScreenShare(); });
ui.leaveBtn.addEventListener('click', () => leaveRoom(false));
ui.chatToggleBtn.addEventListener('click', () => ui.call.classList.toggle('chat-hidden'));
ui.settingsBtn.addEventListener('click', async () => {
  await listMics([ui.lobbyMicSelect, ui.micSelect]);
  ui.settingsModal.hidden = false;
});
ui.settingsClose.addEventListener('click', () => { ui.settingsModal.hidden = true; });
ui.settingsModal.addEventListener('click', (e) => { if (e.target === ui.settingsModal) ui.settingsModal.hidden = true; });
ui.micSelect.addEventListener('change', async () => {
  try { await switchMic(ui.micSelect.value, false); toast('Microfone trocado.'); }
  catch (e) { toast(micErrorMessage(e), 4000); }
});
ui.inviteBtn.addEventListener('click', async () => {
  const url = `${location.origin}${location.pathname}?sala=${encodeURIComponent(state.room)}`;
  try { await navigator.clipboard.writeText(url); toast('Link copiado! Manda pros seus amigos.'); }
  catch (_) { prompt('Copie o link de convite:', url); }
});
document.addEventListener('keydown', (e) => {
  if (!state.inCall) return;
  const tag = (e.target && e.target.tagName) || '';
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  if (e.key === 'm' || e.key === 'M') { if (state.micIsReal) setMuted(!state.muted); }
});

async function switchMic(deviceId, forceReal) {
  const newStream = await getMic(deviceId);
  const newTrack = newStream.getAudioTracks()[0];
  newTrack.enabled = !state.muted;
  // Troca a track em todas as conexões de voz sem renegociar.
  for (const e of state.peers.values()) {
    const pc = e.mic && e.mic.peerConnection;
    if (!pc) continue;
    const sender = pc.getSenders().find(s => s.track && s.track.kind === 'audio');
    if (sender) { try { await sender.replaceTrack(newTrack); } catch (err) { console.warn('replaceTrack', err); } }
  }
  const old = state.micTrack;
  state.localStream = newStream;
  state.micTrack = newTrack;
  const wasReal = state.micIsReal;
  state.micIsReal = true;
  if (old) { try { old.stop(); } catch (_) { /* ignore */ } }
  attachLocalAnalyser();
  if (!wasReal || forceReal) { setBanner(''); setMuted(false); toast('Microfone ligado!'); }
  else { broadcast({ type: 'mute', muted: state.muted }); updateControls(); }
  // Quem eu ainda não tinha ligado (chamadas futuras) usa o novo localStream.
  for (const e of state.peers.values()) if (!e.mic && state.slot < e.slot) startMicCall(e);
  renderParticipants();
}

/* -------------------------------- Chat -------------------------------- */
ui.chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = ui.chatInput.value.trim();
  if (!text) return;
  ui.chatInput.value = '';
  broadcast({ type: 'chat', text });
  addChatMessage(state.name + ' (você)', text);
});
function addChatMessage(who, text) {
  const div = document.createElement('div');
  div.className = 'msg';
  div.innerHTML = `<span class="who">${escapeHtml(who)}</span>${escapeHtml(text)}<span class="when">${timeNow()}</span>`;
  ui.chatLog.appendChild(div);
  ui.chatLog.scrollTop = ui.chatLog.scrollHeight;
}
function addSysMessage(text) {
  const div = document.createElement('div');
  div.className = 'msg sys';
  div.textContent = `${timeNow()} · ${text}`;
  ui.chatLog.appendChild(div);
  ui.chatLog.scrollTop = ui.chatLog.scrollHeight;
}

/* ---------------------------- Participantes ---------------------------- */
function renderParticipants() {
  if (!state.inCall) return;
  const list = ui.participants;
  const keepSpeaking = new Set([...list.querySelectorAll('.participant.speaking')].map(li => li.dataset.id));
  list.innerHTML = '';

  const items = [{ self: true, id: 'self', name: state.name, slot: state.slot, muted: state.muted || !state.micIsReal, sharing: !!state.screenStream, connected: true }];
  for (const e of [...state.peers.values()].sort((a, b) => a.slot - b.slot)) {
    items.push({ self: false, id: e.id, name: e.name, slot: e.slot, muted: e.muted, sharing: e.sharing, connected: !!e.stream, entry: e });
  }
  ui.participantCount.textContent = items.length;

  for (const it of items) {
    const li = document.createElement('li');
    li.className = 'participant' + (keepSpeaking.has(it.id) ? ' speaking' : '');
    li.dataset.id = it.id;
    if (it.self) li.dataset.self = '1';
    const icons = [];
    if (it.muted) icons.push('<span title="Mutado">🔇</span>');
    if (it.sharing) icons.push('<span title="Compartilhando tela">🖥️</span>');
    if (!it.self && !it.connected) icons.push('<span title="Conectando áudio…">⏳</span>');
    li.innerHTML = `
      <div class="avatar" style="background:${colorFor(it.name + it.slot)}">${escapeHtml(initials(it.name))}</div>
      <div>
        <div class="participant-name">${escapeHtml(it.name)}${it.self ? ' <span class="participant-sub">(você)</span>' : ''}</div>
        <div class="participant-sub">${it.self ? 'Vaga ' + it.slot : (it.connected ? 'Áudio conectado' : 'Conectando áudio…')}</div>
      </div>
      <div class="participant-icons">${icons.join('')}</div>
      ${it.self ? '' : `<label class="vol">🔊 <input type="range" min="0" max="100" value="${Math.round((it.entry.volume || 1) * 100)}"> <span>${Math.round((it.entry.volume || 1) * 100)}%</span></label>`}
    `;
    if (!it.self) {
      it.entry.el = li;
      const range = li.querySelector('input[type=range]');
      const pct = li.querySelector('.vol span');
      range.addEventListener('input', () => {
        const v = parseInt(range.value, 10) / 100;
        it.entry.volume = v;
        pct.textContent = Math.round(v * 100) + '%';
        if (it.entry.audioEl) it.entry.audioEl.volume = Math.min(1, v);
        // acima de 100% precisaria de GainNode; mantemos 100% como teto real.
      });
    }
    list.appendChild(li);
  }
}

/* ------------------------------- Telas ------------------------------- */
function showCall() {
  state.inCall = true;
  ui.lobby.hidden = true;
  ui.call.hidden = false;
  if (window.innerWidth <= 900) ui.call.classList.add('chat-hidden');
}
function showLobby() {
  ui.call.hidden = true;
  ui.lobby.hidden = false;
  ui.settingsModal.hidden = true;
}
