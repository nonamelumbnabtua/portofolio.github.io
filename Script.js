const $ = s => document.querySelector(s);
const pad = n => String(n).padStart(2, '0');
const esc = s => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};

document.querySelectorAll('.tab').forEach(b => b.onclick = () => {
  document.querySelectorAll('.tab,.panel').forEach(e => e.classList.remove('active'));
  b.classList.add('active');
  $('#' + b.dataset.p).classList.add('active');
  if(b.dataset.p === 'world') {
    resizeGlobe();
  }
});

$('#cZone').textContent = Intl.DateTimeFormat().resolvedOptions().timeZone;

function tickClock() {
  const d = new Date();
  $('#cTime').textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  $('#cDate').textContent = d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

const dbReady = new Promise(res => {
  try {
    const r = indexedDB.open('jam-digital', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('songs');
    r.onsuccess = () => res(r.result);
    r.onerror = () => res(null);
  } catch (e) { res(null); }
});
async function songTx(mode, fn) {
  const db = await dbReady;
  if (!db) return null;
  return new Promise(res => {
    try {
      const t = db.transaction('songs', mode);
      const req = fn(t.objectStore('songs'));
      t.oncomplete = () => res(req && req.result !== undefined ? req.result : true);
      t.onerror = () => res(null);
    } catch (e) { res(null); }
  });
}
const songPut = (id, blob) => songTx('readwrite', s => s.put(blob, id));
const songGet = id => songTx('readonly', s => s.get(id));
const songDel = id => songTx('readwrite', s => s.delete(id));

let alarms = store.get('alarms', []);
let lastFired = '', beepCtx = null, beepTimer = null;
let ringAudio = null, ringUrl = null, ringStop = null, ringAlarm = null, snoozeTimer = null;
let pendingFile = null;

const fmtT = sec => `${Math.floor(sec / 60)}:${pad(Math.floor(sec % 60))}`;
function parseT(str) {
  str = (str || '').trim();
  if (!str) return 0;
  const p = str.split(':').map(Number);
  if (p.some(isNaN)) return 0;
  return p.length === 1 ? p[0] : p[0] * 60 + p[1];
}

$('#aFile').onchange = e => {
  const f = e.target.files[0];
  if (!f) return;
  pendingFile = f;
  $('#aFileName').textContent = '🎵 ' + f.name;
  const prev = $('#aPrev');
  if (prev.src) URL.revokeObjectURL(prev.src);
  prev.src = URL.createObjectURL(f);
  prev.hidden = false;
};
function setFromPlayer(id) { $('#' + id).value = fmtT($('#aPrev').currentTime); }

function renderAlarms() {
  const el = $('#aList');
  if (!alarms.length) { el.innerHTML = '<div class="empty">Belum ada alarm.</div>'; return; }
  el.innerHTML = alarms.map(a => {
    const song = a.songName
      ? `🎵 ${esc(a.songName)} (${fmtT(a.start || 0)}${a.end ? ' – ' + fmtT(a.end) : ' – akhir'})`
      : 'Bunyi bip';
    return `
    <div class="item">
      <div><div class="t">${a.time}</div><div class="l">${esc(a.label || 'Alarm')}</div><div class="l">${song}</div></div>
      <div class="row" style="margin:0">
        <label class="sw"><input type="checkbox" ${a.on ? 'checked' : ''} onchange="toggleAlarm(${a.id}, this.checked)"><i></i></label>
        <button class="x" onclick="delAlarm(${a.id})" aria-label="Hapus">✕</button>
      </div>
    </div>`;
  }).join('');
}

async function addAlarm() {
  const t = $('#aTime').value;
  if (!t) return;
  const id = Date.now();
  const start = parseT($('#aStart').value);
  let end = parseT($('#aEnd').value);
  if (end <= start) end = 0;
  const a = { id, time: t, label: $('#aLabel').value.trim(), on: true, start, end };
  if (pendingFile) {
    const ok = await songPut(id, pendingFile);
    if (ok) a.songName = pendingFile.name;
  }
  alarms.push(a);
  alarms.sort((x, y) => x.time.localeCompare(y.time));
  pendingFile = null;
  $('#aFile').value = ''; $('#aLabel').value = ''; $('#aStart').value = ''; $('#aEnd').value = '';
  $('#aFileName').textContent = 'Belum ada lagu (akan memakai bunyi bip)';
  const prev = $('#aPrev'); prev.pause(); prev.hidden = true;
  saveAlarms();
}
function toggleAlarm(id, on) { alarms.find(a => a.id === id).on = on; saveAlarms(); }
function delAlarm(id) { alarms = alarms.filter(a => a.id !== id); songDel(id); saveAlarms(); }
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
    beepCtx = beepCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = beepCtx.createOscillator(), g = beepCtx.createGain();
    o.type = 'square'; o.frequency.value = 880; g.gain.value = 0.15;
    o.connect(g); g.connect(beepCtx.destination);
    o.start(); o.stop(beepCtx.currentTime + 0.25);
  } catch (e) {}
}
function startBeep() { clearInterval(beepTimer); beep(); beepTimer = setInterval(beep, 600); }

async function ring(a) {
  stopRing();
  ringAlarm = a;
  $('#mTime').textContent = a.time;
  $('#mLabel').textContent = a.label || 'Alarm';
  $('#modal').classList.add('on');

  const blob = a.songName ? await songGet(a.id) : null;
  if (blob instanceof Blob) {
    ringUrl = URL.createObjectURL(blob);
    ringAudio = new Audio(ringUrl);
    const start = a.start || 0, end = a.end || 0;
    ringAudio.addEventListener('loadedmetadata', () => {
      ringAudio.currentTime = Math.min(start, ringAudio.duration || start);
      ringAudio.play().catch(startBeep);
    });
    ringAudio.addEventListener('timeupdate', () => {
      if (end && ringAudio.currentTime >= end) ringAudio.currentTime = start;
    });
    ringAudio.addEventListener('ended', () => { ringAudio.currentTime = start; ringAudio.play().catch(() => {}); });
  } else {
    startBeep();
  }
  clearTimeout(ringStop);
  ringStop = setTimeout(stopRing, 120000);
}

function stopRing() {
  $('#modal').classList.remove('on');
  clearInterval(beepTimer);
  clearTimeout(ringStop);
  if (ringAudio) { ringAudio.pause(); ringAudio = null; }
  if (ringUrl) { URL.revokeObjectURL(ringUrl); ringUrl = null; }
}

function snooze() {
  const a = ringAlarm;
  stopRing();
  if (!a) return;
  clearTimeout(snoozeTimer);
  snoozeTimer = setTimeout(() => ring(a), 5 * 60000);
}

document.addEventListener('click', () => {
  try { beepCtx = beepCtx || new (window.AudioContext || window.webkitAudioContext)(); beepCtx.resume(); } catch (e) {}
}, { once: true });

/* ---------- Jam dunia & Globe 3D Interaktif dengan Gambar Peta ---------- */
const ZONE_DATA = [
  { zone: 'Asia/Jakarta', name: 'Jakarta', lat: -6.2088, lon: 106.8456 },
  { zone: 'Asia/Makassar', name: 'Makassar', lat: -5.1477, lon: 119.4327 },
  { zone: 'Asia/Jayapura', name: 'Jayapura', lat: -2.5337, lon: 140.7181 },
  { zone: 'Asia/Singapore', name: 'Singapore', lat: 1.3521, lon: 103.8198 },
  { zone: 'Asia/Tokyo', name: 'Tokyo', lat: 35.6762, lon: 139.6503 },
  { zone: 'Asia/Seoul', name: 'Seoul', lat: 37.5665, lon: 126.9780 },
  { zone: 'Asia/Dubai', name: 'Dubai', lat: 25.2048, lon: 55.2708 },
  { zone: 'Asia/Kolkata', name: 'Kolkata', lat: 22.5726, lon: 88.3639 },
  { zone: 'Europe/London', name: 'London', lat: 51.5074, lon: -0.1278 },
  { zone: 'Europe/Paris', name: 'Paris', lat: 48.8566, lon: 2.3522 },
  { zone: 'Europe/Moscow', name: 'Moscow', lat: 55.7558, lon: 37.6173 },
  { zone: 'Africa/Cairo', name: 'Cairo', lat: 30.0444, lon: 31.2357 },
  { zone: 'America/New_York', name: 'New York', lat: 40.7128, lon: -74.0060 },
  { zone: 'America/Chicago', name: 'Chicago', lat: 41.8781, lon: -87.6298 },
  { zone: 'America/Los_Angeles', name: 'Los Angeles', lat: 34.0522, lon: -118.2437 },
  { zone: 'America/Sao_Paulo', name: 'Sao Paulo', lat: -23.5505, lon: -46.6333 },
  { zone: 'Australia/Sydney', name: 'Sydney', lat: -33.8688, lon: 151.2093 },
  { zone: 'Pacific/Auckland', name: 'Auckland', lat: -36.8485, lon: 174.7633 }
];

let myZones = store.get('zones', ['Asia/Tokyo', 'Europe/London', 'America/New_York']);
$('#wSel').innerHTML = ZONE_DATA.map(item => `<option value="${item.zone}">${item.zone}</option>`).join('');

let selectedCity = null;
let globeRotX = 0.3;
let globeRotY = 0;
let isDraggingGlobe = false;
let startMouseX = 0, startMouseY = 0;
let animAngle = 0;

// Memuat Gambar Peta dari src="img/world-map-1024x607.jpg"
const worldMapImg = new Image();
worldMapImg.src = 'img/world-map-1024x607.jpg';
worldMapImg.onload = () => {
  drawGlobe();
};

function addZoneByName(z) {
  if (z && !myZones.includes(z)) {
    myZones.push(z);
    store.set('zones', myZones);
    renderWorld();
  }
}

function addZone() {
  addZoneByName($('#wSel').value);
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

  if (selectedCity) {
    $('#popupCityTime').textContent = now.toLocaleTimeString('en-GB', { timeZone: selectedCity.zone, hour12: false });
    $('#popupCityDate').textContent = now.toLocaleDateString('id-ID', { timeZone: selectedCity.zone, weekday: 'short', day: 'numeric', month: 'short' });
  }
}

const canvas = $('#globeCanvas');
const ctx = canvas.getContext('2d');

function resizeGlobe() {
  const container = $('#globeContainer');
  const size = Math.min(container.clientWidth - 20, 300);
  canvas.width = size;
  canvas.height = size;
  drawGlobe();
}
window.addEventListener('resize', resizeGlobe);

function drawGlobe() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const radius = Math.min(cx, cy) - 20;

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();

  // Pemetaan Gambar Peta Mengikuti Lengkungan Bola Globe
  if (worldMapImg.complete && worldMapImg.naturalWidth !== 0) {
    const imgW = radius * 4;
    const imgH = radius * 2;
    const offsetX = cx - imgW / 2 + (globeRotY / (Math.PI * 2)) * imgW;
    
    for (let i = -1; i <= 1; i++) {
      ctx.drawImage(worldMapImg, offsetX + (i * imgW), cy - radius, imgW, imgH);
    }
  } else {
    ctx.fillStyle = '#1e3a8a';
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
  }

  animAngle += 0.08;

  // Render Titik Pin Kota pada Globe
  ZONE_DATA.forEach(city => {
    const phi = (city.lat * Math.PI) / 180;
    const lambda = (city.lon * Math.PI) / 180 + globeRotY;

    const x3d = radius * Math.cos(phi) * Math.sin(lambda);
    const y3d = radius * Math.sin(phi);
    const z3d = radius * Math.cos(phi) * Math.cos(lambda);

    const rotX = x3d;
    const rotY = y3d * Math.cos(globeRotX) - z3d * Math.sin(globeRotX);
    const rotZ = y3d * Math.sin(globeRotX) + z3d * Math.cos(globeRotX);

    if (rotZ > 0) {
      const screenX = cx + rotX;
      const screenY = cy - rotY;
      const isAdded = myZones.includes(city.zone);
      const isSelected = selectedCity && selectedCity.zone === city.zone;

      if (isSelected) {
        ctx.beginPath();
        const radiusAnim = 8 + Math.sin(animAngle) * 4;
        ctx.arc(screenX, screenY, radiusAnim + 4, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 159, 10, 0.9)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.arc(screenX, screenY, isAdded ? 6 : 4, 0, Math.PI * 2);
      ctx.fillStyle = isSelected ? '#ff3b30' : (isAdded ? '#ff9f0a' : '#fff');
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#000';
      ctx.stroke();

      ctx.fillStyle = '#fff';
      ctx.font = '10px Outfit, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(city.name, screenX, screenY - 8);
    }
  });

  ctx.restore();

  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#555';
  ctx.stroke();

  if (!isDraggingGlobe) {
    globeRotY += 0.002;
  }
}

setInterval(() => {
  if ($('#world').classList.contains('active')) {
    drawGlobe();
  }
}, 40);

canvas.addEventListener('mousedown', e => {
  isDraggingGlobe = true;
  startMouseX = e.clientX;
  startMouseY = e.clientY;
});
window.addEventListener('mousemove', e => {
  if (!isDraggingGlobe) return;
  const dx = e.clientX - startMouseX;
  const dy = e.clientY - startMouseY;
  startMouseX = e.clientX;
  startMouseY = e.clientY;

  globeRotY += dx * 0.005;
  globeRotX = Math.max(-1, Math.min(1, globeRotX + dy * 0.005));
  drawGlobe();
});
window.addEventListener('mouseup', () => { isDraggingGlobe = false; });

canvas.addEventListener('touchstart', e => {
  isDraggingGlobe = true;
  startMouseX = e.touches[0].clientX;
  startMouseY = e.touches[0].clientY;
});
window.addEventListener('touchmove', e => {
  if (!isDraggingGlobe) return;
  const dx = e.touches[0].clientX - startMouseX;
  const dy = e.touches[0].clientY - startMouseY;
  startMouseX = e.touches[0].clientX;
  startMouseY = e.touches[0].clientY;

  globeRotY += dx * 0.005;
  globeRotX = Math.max(-1, Math.min(1, globeRotX + dy * 0.005));
  drawGlobe();
});
window.addEventListener('touchend', () => { isDraggingGlobe = false; });

canvas.addEventListener('click', e => {
  const rect = canvas.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const clickY = e.clientY - rect.top;
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const radius = Math.min(cx, cy) - 20;

  let clickedCityObj = null;
  let minDist = 999;

  ZONE_DATA.forEach(city => {
    const phi = (city.lat * Math.PI) / 180;
    const lambda = (city.lon * Math.PI) / 180 + globeRotY;

    const x3d = radius * Math.cos(phi) * Math.sin(lambda);
    const y3d = radius * Math.sin(phi);
    const z3d = radius * Math.cos(phi) * Math.cos(lambda);

    const rotX = x3d;
    const rotY = y3d * Math.cos(globeRotX) - z3d * Math.sin(globeRotX);
    const rotZ = y3d * Math.sin(globeRotX) + z3d * Math.cos(globeRotX);

    if (rotZ > 0) {
      const screenX = cx + rotX;
      const screenY = cy - rotY;
      const dist = Math.hypot(clickX - screenX, clickY - screenY);
      if (dist < 15 && dist < minDist) {
        minDist = dist;
        clickedCityObj = city;
      }
    }
  });

  if (clickedCityObj) {
    selectedCity = clickedCityObj;
    const now = new Date();
    $('#popupCityName').textContent = selectedCity.name + ' (' + selectedCity.zone.split('/')[1].replace(/_/g, ' ') + ')';
    $('#popupCityTime').textContent = now.toLocaleTimeString('en-GB', { timeZone: selectedCity.zone, hour12: false });
    $('#popupCityDate').textContent = now.toLocaleDateString('id-ID', { timeZone: selectedCity.zone, weekday: 'short', day: 'numeric', month: 'short' });
    
    const addBtn = $('#popupAddBtn');
    if (myZones.includes(selectedCity.zone)) {
      addBtn.textContent = 'Sudah ditambahkan';
      addBtn.disabled = true;
      addBtn.style.opacity = '0.6';
    } else {
      addBtn.textContent = 'Tambah ke Jam Dunia';
      addBtn.disabled = false;
      addBtn.style.opacity = '1';
      addBtn.onclick = () => {
        addZoneByName(selectedCity.zone);
        closeGlobePopup();
      };
    }
    $('#globePopup.globe-popup').style.display = 'block';
    drawGlobe();
  }
});

function closeGlobePopup() {
  selectedCity = null;
  $('#globePopup.globe-popup').style.display = 'none';
  drawGlobe();
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

renderAlarms();
renderWorld();
tickClock();
resizeGlobe();
setInterval(() => { tickClock(); tickWorld(); checkAlarms(); }, 250);