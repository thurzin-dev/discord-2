// Teste ponta-a-ponta: 3 Chromes headless (dispositivos de mídia falsos = tom de áudio real)
// entram na mesma sala e verificamos malha completa, áudio chegando (bytes + nível), chat e tela.
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BASE = process.argv[2] || 'http://localhost:8142/';
const ROOM = 'e2e-' + Math.random().toString(36).slice(2, 8);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const NAMES = ['Alice', 'Bob', 'Carol'];
const SIMULTANEOUS = process.argv.includes('--simultaneous');

async function launch(i) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'd2-e2e-' + i + '-'));
  return puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    userDataDir: dir,
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
      '--auto-select-desktop-capture-source=Entire screen',
      '--no-first-run', '--no-default-browser-check',
      '--disable-features=WebRtcHideLocalIpsWithMdns',
    ],
  });
}

const snapshot = async (page) => page.evaluate(async () => {
  const out = [];
  for (const e of state.peers.values()) {
    const pc = e.mic && e.mic.peerConnection;
    let inb = 0, level = 0, ice = null;
    if (pc) {
      ice = pc.iceConnectionState;
      const st = await pc.getStats();
      st.forEach(r => { if (r.type === 'inbound-rtp' && r.kind === 'audio') { inb = r.bytesReceived; level = r.audioLevel || 0; } });
    }
    let screenW = 0;
    const tile = document.querySelector(`.tile[data-key="${CSS.escape(e.id)}"] video`);
    if (tile) screenW = tile.videoWidth;
    out.push({ name: e.name, slot: e.slot, data: !!(e.data && e.data.open), ice, inb, level: +level.toFixed(3), sharing: e.sharing, screenW, retries: e.micRetries });
  }
  return { me: state.myId, micReal: state.micIsReal, muted: state.muted, peers: out,
    chat: document.getElementById('chat-log').innerText.replace(/\n/g, ' | '),
    participants: document.getElementById('participant-count').textContent,
    status: document.getElementById('conn-status').textContent,
    banner: document.getElementById('banner').textContent };
});

(async () => {
  const browsers = [], pages = [];
  const errors = [];
  try {
    for (let i = 0; i < 3; i++) {
      const b = await launch(i); browsers.push(b);
      const p = await b.newPage(); pages.push(p);
      p.on('pageerror', (e) => errors.push(`[${NAMES[i]}] pageerror: ${e.message}`));
      p.on('console', (m) => { if (m.type() === 'error') errors.push(`[${NAMES[i]}] console.error: ${m.text()}`); });
      await p.goto(`${BASE}?sala=${ROOM}`, { waitUntil: 'networkidle2' });
    }
    console.log('Sala:', ROOM, 'URL:', BASE, SIMULTANEOUS ? '(entrada simultânea)' : '(entrada sequencial)');

    const join = async (i) => {
      const p = pages[i];
      await p.evaluate((n) => { document.getElementById('name-input').value = n; }, NAMES[i]);
      await p.click('#join-btn');
    };
    if (SIMULTANEOUS) {
      await Promise.all(pages.map((_, i) => join(i)));
    } else {
      for (let i = 0; i < 3; i++) { await join(i); await new Promise(r => setTimeout(r, 2500)); }
    }
    await new Promise(r => setTimeout(r, 12000));

    console.log('\n=== Estado após entrar ===');
    for (let i = 0; i < 3; i++) console.log(JSON.stringify(await snapshot(pages[i]), null, 0));

    // Chat
    await pages[1].evaluate(() => { document.getElementById('chat-input').value = 'oi pessoal'; document.getElementById('chat-form').requestSubmit(); });
    await new Promise(r => setTimeout(r, 1000));
    const chatOk = (await Promise.all(pages.map(p => p.evaluate(() => document.getElementById('chat-log').innerText.includes('oi pessoal'))))).every(Boolean);
    console.log('\nChat recebido por todos:', chatOk);

    // Mute
    await pages[0].click('#mic-btn');
    await new Promise(r => setTimeout(r, 800));
    const muteSeen = await pages[2].evaluate(() => [...state.peers.values()].find(e => e.name === 'Alice').muted);
    console.log('Mute da Alice visto pela Carol:', muteSeen);
    await pages[0].click('#mic-btn');

    // Tela
    let screenResult = 'não testado';
    try {
      await pages[0].click('#share-btn');
      await new Promise(r => setTimeout(r, 6000));
      const sharing = await pages[0].evaluate(() => !!state.screenStream);
      const seen = await Promise.all([1, 2].map(i => pages[i].evaluate(() => {
        const e = [...state.peers.values()].find(e => e.name === 'Alice');
        const v = document.querySelector(`.tile[data-key="${CSS.escape(e.id)}"] video`);
        return v ? `${v.videoWidth}x${v.videoHeight}` : 'sem tile';
      })));
      screenResult = `Alice compartilhando=${sharing}; Bob vê ${seen[0]}; Carol vê ${seen[1]}`;
      await pages[0].click('#share-btn');
      await new Promise(r => setTimeout(r, 1500));
      const gone = await Promise.all([1, 2].map(i => pages[i].evaluate(() => document.querySelectorAll('.tile').length)));
      screenResult += `; após parar, tiles restantes: ${gone.join(',')}`;
    } catch (e) { screenResult = 'erro: ' + e.message; }
    console.log('Tela:', screenResult);

    // Sair
    await pages[1].click('#leave-btn');
    await new Promise(r => setTimeout(r, 3000));
    const after = await Promise.all([0, 2].map(i => pages[i].evaluate(() => [...state.peers.values()].map(e => e.name).join(','))));
    console.log('Após Bob sair, Alice vê:', after[0], '| Carol vê:', after[1]);

    console.log('\n=== Estado final ===');
    for (const i of [0, 2]) console.log(JSON.stringify(await snapshot(pages[i]), null, 0));
    console.log('\nErros de página/console:', errors.length ? errors : 'nenhum');
  } catch (e) {
    console.error('FALHA:', e);
  } finally {
    for (const b of browsers) { try { await b.close(); } catch (_) {} }
  }
})();
