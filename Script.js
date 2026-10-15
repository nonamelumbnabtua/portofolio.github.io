const $ = s => document.querySelector(s);
const pad = n => String(n).padStart(2, '0');
const esc = s => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// Penyimpanan di browser (localStorage)
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};

/* ---------- Tab ---------- */
document.querySelectorAll('.tab').forEach(b => b.onclick = () => {
  document.querySelectorAll('.tab,.panel').forEach(e => e.classList.remove('active'));
  b.classList.add('active');
  $('#' + b.dataset.p).classList.add('active');
});

/* ---------- Jam real time ---------- */
$('#cZone').textContent = Intl.DateTimeFormat().resolvedOptions().timeZone;

function tickClock() {
  const d = new Date();
  $('#cTime').textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  $('#cDate').textContent = d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

/* ---------- Alarm ---------- */
let alarms = store.get('alarms', []);
let lastFired = '', audio = null, beepTimer = null;

function renderAlarms() {
  const el = $('#aList');
  if (!alarms.length) { el.innerHTML = '<div class="empty">Belum ada alarm.</div>'; return; }
  el.innerHTML = alarms.map(a => `
    <div class="item">
      <div><div class="t">${a.time}</div><div class="l">${esc(a.label || 'Alarm')}</div></div>
      <div class="row" style="margin:0">
        <label class="sw"><input type="checkbox" ${a.on ? 'checked' : ''} onchange="toggleAlarm(${a.id}, this.checked)"><i></i></label>
        <button class="x" onclick="delAlarm(${a.id})" aria-label="Hapus">✕</button>
      </div>
    </div>`).join('');
}

function addAlarm() {
  const t = $('#aTime').value;
  if (!t) return;
  alarms.push({ id: Date.now(), time: t, label: $('#aLabel').value.trim(), on: true });
  alarms.sort((a, b) => a.time.localeCompare(b.time));
  $('#aLabel').value = '';
  saveAlarms();
}
function toggleAlarm(id, on) { alarms.find(a => a.id === id).on = on; saveAlarms(); }
function delAlarm(id) { alarms = alarms.filter(a => a.id !== id); saveAlarms(); }
function saveAlarms() { store.set('alarms', alarms); renderAlarms(); }

function checkAlarms() {
  const d = new Date();
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const key = hm + d.toDateString();
  if (lastFired === key) return;
  const hit = alarms.find(a => a.on && a.time === hm);
  if (hit) { lastFired = key; ring(hit); }
}

function beep() {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = 'square';
    o.frequency.value = 880;
    g.gain.value = 0.15;
    o.connect(g); g.connect(audio.destination);
    o.start(); o.stop(audio.currentTime + 0.25);
  } catch (e) {}
}

function ring(a) {
  $('#ringTxt').textContent = '⏰ ' + a.time + ' — ' + (a.label || 'Alarm');
  $('#ring').classList.add('on');
  clearInterval(beepTimer);
  beep();
  beepTimer = setInterval(beep, 600);
  setTimeout(stopRing, 60000); // berhenti otomatis setelah 1 menit
}
function stopRing() { $('#ring').classList.remove('on'); clearInterval(beepTimer); }

// Browser baru mengizinkan suara setelah ada klik pertama
document.addEventListener('click', () => {
  try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); audio.resume(); } catch (e) {}
}, { once: true });

/* ---------- Jam dunia ---------- */
const ZONES = ['Asia/Jakarta','Asia/Makassar','Asia/Jayapura','Asia/Singapore','Asia/Tokyo','Asia/Seoul','Asia/Dubai','Asia/Kolkata','Europe/London','Europe/Paris','Europe/Moscow','Africa/Cairo','America/New_York','America/Chicago','America/Los_Angeles','America/Sao_Paulo','Australia/Sydney','Pacific/Auckland'];
let myZones = store.get('zones', ['Asia/Tokyo', 'Europe/London', 'America/New_York']);
$('#wSel').innerHTML = ZONES.map(z => `<option>${z}</option>`).join('');

function addZone() {
  const z = $('#wSel').value;
  if (!myZones.includes(z)) { myZones.push(z); store.set('zones', myZones); renderWorld(); }
}
function delZone(z) { myZones = myZones.filter(x => x !== z); store.set('zones', myZones); renderWorld(); }

function renderWorld() {
  const el = $('#wList');
  if (!myZones.length) { el.innerHTML = '<div class="empty">Tambahkan kota/zona waktu.</div>'; return; }
  el.innerHTML = myZones.map(z => `
    <div class="item">
      <div><div style="font-size:1.1rem">${z.split('/')[1].replace(/_/g, ' ')}</div><div class="l" data-d="${z}"></div></div>
      <div class="row" style="margin:0">
        <div class="t" data-t="${z}">--:--:--</div>
        <button class="x" onclick="delZone('${z}')" aria-label="Hapus">✕</button>
      </div>
    </div>`).join('');
  tickWorld();
}

function tickWorld() {
  const now = new Date();
  const local = new Date(now.toLocaleString('en-US'));
  myZones.forEach(z => {
    const t = document.querySelector(`[data-t="${z}"]`);
    const d = document.querySelector(`[data-d="${z}"]`);
    if (!t) return;
    t.textContent = now.toLocaleTimeString('en-GB', { timeZone: z, hour12: false });
    const diff = Math.round((new Date(now.toLocaleString('en-US', { timeZone: z })) - local) / 18e5) / 2;
    d.textContent = now.toLocaleDateString('id-ID', { timeZone: z, weekday: 'short', day: 'numeric', month: 'short' })
      + ' · ' + (diff === 0 ? 'Sama dengan lokal' : (diff > 0 ? '+' : '') + diff + ' jam');
  });
}

/* ---------- Stopwatch ---------- */
let swRun = false, swStart = 0, swAcc = 0, swRaf = 0, laps = [];
const fmt = ms => {
  const c = Math.floor(ms / 10) % 100, s = Math.floor(ms / 1000) % 60, m = Math.floor(ms / 60000);
  return `${pad(m)}:${pad(s)}.${pad(c)}`;
};
const swNow = () => swAcc + (swRun ? performance.now() - swStart : 0);

function swLoop() {
  $('#sTime').textContent = fmt(swNow());
  if (swRun) swRaf = requestAnimationFrame(swLoop);
}
function swToggle() {
  if (swRun) {
    swAcc += performance.now() - swStart;
    swRun = false;
    $('#sGo').textContent = 'Lanjut';
  } else {
    swStart = performance.now();
    swRun = true;
    $('#sGo').textContent = 'Jeda';
    swLoop();
  }
}
function swLap() {
  if (!swNow()) return;
  laps.unshift(swNow());
  $('#laps').innerHTML = laps.map((l, i) => `<div class="lap"><span>Lap ${laps.length - i}</span><span>${fmt(l)}</span></div>`).join('');
}
function swReset() {
  swRun = false; swAcc = 0; laps = [];
  cancelAnimationFrame(swRaf);
  $('#sTime').textContent = '00:00.00';
  $('#sGo').textContent = 'Mulai';
  $('#laps').innerHTML = '';
}

/* ---------- Mulai ---------- */
renderAlarms();
renderWorld();
tickClock();
setInterval(() => { tickClock(); tickWorld(); checkAlarms(); }, 250);