// ============================================================
//  Wheel of Names — groups, Excel paste, random split, sounds
// ============================================================

// ---------- Config ----------
const STORAGE_KEY = "wheel-of-names-state-v2";
const LEGACY_KEY = "wheel-of-names-list-v1";
const MUTE_KEY = "wheel-of-names-muted";
const MUSIC_KEY = "wheel-of-names-music";
const SPIN_MS = 5200;
const COLORS = [
  "#FF6B6B", "#FFD93D", "#6BCB77", "#4D96FF",
  "#B983FF", "#FF922B", "#20C997", "#F06595",
  "#845EC2", "#00C9A7", "#F9A826", "#4B4453"
];

// ---------- Random helpers (uniform, crypto-backed) ----------
function randInt(n) {
  if (n <= 1) return 0;
  if (window.crypto && crypto.getRandomValues) {
    const limit = Math.floor(0x100000000 / n) * n; // rejection sampling: no modulo bias
    const buf = new Uint32Array(1);
    do { crypto.getRandomValues(buf); } while (buf[0] >= limit);
    return buf[0] % n;
  }
  return Math.floor(Math.random() * n);
}

function randFloat() {
  return randInt(1000000) / 1000000;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ============================================================
//  Sound (WebAudio — synthesized, no audio files, works offline)
// ============================================================
const Sound = (() => {
  let ctx = null;
  let master = null;
  let muted = false;
  try { muted = localStorage.getItem(MUTE_KEY) === "1"; } catch (e) {}

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.85;
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function tone(freq, opts) {
    if (muted) return;
    const o = Object.assign({ at: 0, dur: 0.15, type: "sine", vol: 0.25, to: null, attack: 0.005 }, opts || {});
    const c = ensure();
    if (!c) return;
    const t0 = c.currentTime + o.at;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = o.type;
    osc.frequency.setValueAtTime(freq, t0);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t0 + o.dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.vol, t0 + o.attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + o.dur + 0.03);
  }

  // ---------- Background music (original generative loop: C - Am - F - G) ----------
  const BPM = 104;
  const STEP = 60 / BPM / 2; // one eighth note
  const MUSIC_LEVEL = 0.22;
  const CHORDS = [
    { root: 130.81, notes: [261.63, 329.63, 392.0, 523.25] }, // C
    { root: 110.0,  notes: [220.0, 261.63, 329.63, 440.0] },  // Am
    { root: 87.31,  notes: [174.61, 220.0, 261.63, 349.23] }, // F
    { root: 98.0,   notes: [196.0, 246.94, 293.66, 392.0] }   // G
  ];
  const PENTA = [523.25, 587.33, 659.25, 783.99, 880.0];

  let musicWanted = false; // saved preference
  try { musicWanted = localStorage.getItem(MUSIC_KEY) === "1"; } catch (e) {}
  let musicGain = null;
  let musicTimer = null;
  let nextNoteTime = 0;
  let musicStep = 0;
  let noiseBuf = null;

  function mVoice(freq, t, dur, type, vol, to) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(musicGain);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  function mHat(t) {
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.1), ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
    src.connect(hp);
    hp.connect(g);
    g.connect(musicGain);
    src.start(t);
    src.stop(t + 0.06);
  }

  function playStep(step, t) {
    const chord = CHORDS[Math.floor(step / 8) % CHORDS.length];
    const s = step % 8;

    if (s === 0 || s === 4) mVoice(130, t, 0.18, "sine", 0.55, 45); // kick
    if (s % 2 === 1) mHat(t);                                        // off-beat hat

    if (s === 0 || s === 3 || s === 6) mVoice(chord.root, t, STEP * 1.7, "triangle", 0.4);
    if (s === 4) mVoice(chord.root * 1.5, t, STEP * 1.7, "triangle", 0.32);

    if (s === 0) { // soft pad
      mVoice(chord.notes[0], t, STEP * 7.5, "sine", 0.09);
      mVoice(chord.notes[2], t, STEP * 7.5, "sine", 0.07);
    }

    // melody: random walk over chord tones + pentatonic, with rests
    if (Math.random() < (s % 2 === 0 ? 0.85 : 0.55)) {
      const pool = chord.notes.concat(chord.notes, PENTA);
      const f = pool[Math.floor(Math.random() * pool.length)] * (Math.random() < 0.2 ? 2 : 1);
      mVoice(f, t, STEP * 1.6, "triangle", 0.2);
    }
  }

  function musicSchedule() {
    while (nextNoteTime < ctx.currentTime + 0.25) {
      playStep(musicStep, nextNoteTime);
      nextNoteTime += STEP;
      musicStep++;
    }
  }

  function startMusic() {
    const c = ensure();
    if (!c || musicTimer) return;
    if (!musicGain) {
      musicGain = c.createGain();
      musicGain.connect(c.destination);
    }
    const now = c.currentTime;
    musicGain.gain.cancelScheduledValues(now);
    musicGain.gain.setValueAtTime(0.0001, now);
    musicGain.gain.linearRampToValueAtTime(MUSIC_LEVEL, now + 0.6);
    nextNoteTime = now + 0.08;
    musicStep = 0;
    musicTimer = setInterval(musicSchedule, 50);
  }

  function stopMusic() {
    if (!musicTimer) return;
    clearInterval(musicTimer);
    musicTimer = null;
    if (ctx && musicGain) {
      const now = ctx.currentTime;
      musicGain.gain.cancelScheduledValues(now);
      musicGain.gain.setValueAtTime(musicGain.gain.value, now);
      musicGain.gain.linearRampToValueAtTime(0.0001, now + 0.25);
    }
  }

  // don't burn battery / keep playing when the app is in the background
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopMusic();
    else if (musicWanted && ctx) startMusic();
  });

  return {
    // Must be called from a user gesture (tap) at least once — iOS/Android requirement.
    unlock() {
      ensure();
      if (musicWanted && !musicTimer) startMusic(); // saved "music on" resumes after the first tap
    },
    isMusicOn() { return musicWanted; },
    setMusic(v) {
      musicWanted = !!v;
      try { localStorage.setItem(MUSIC_KEY, musicWanted ? "1" : "0"); } catch (e) {}
      if (musicWanted) startMusic(); else stopMusic();
    },
    // dip the music briefly so the fanfare is clear
    duck() {
      if (!ctx || !musicGain || !musicTimer) return;
      const g = musicGain.gain;
      const now = ctx.currentTime;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(0.05, now + 0.12);
      g.linearRampToValueAtTime(MUSIC_LEVEL, now + 2.4);
    },
    isMuted() { return muted; },
    setMuted(v) {
      muted = !!v;
      try { localStorage.setItem(MUTE_KEY, muted ? "1" : "0"); } catch (e) {}
      if (!muted) ensure();
    },

    // Wheel peg clicking past the pointer
    tick() {
      tone(1100 + randInt(200), { dur: 0.045, type: "triangle", vol: 0.2, to: 620 });
    },
    // Small UI tap
    click() {
      tone(700, { dur: 0.05, type: "triangle", vol: 0.14 });
    },
    // Names added
    add() {
      tone(520, { dur: 0.09, type: "triangle", vol: 0.2 });
      tone(780, { at: 0.08, dur: 0.14, type: "triangle", vol: 0.2 });
    },
    // Name removed / drawn out
    remove() {
      tone(520, { dur: 0.16, type: "triangle", vol: 0.2, to: 260 });
    },
    // Invalid action
    error() {
      tone(180, { dur: 0.2, type: "sawtooth", vol: 0.12 });
    },
    // Wheel starts spinning
    spinStart() {
      tone(200, { dur: 0.4, type: "sine", vol: 0.16, to: 700 });
    },
    // Random split: rapid shuffling blips then a chime
    shuffle() {
      for (let i = 0; i < 16; i++) {
        tone(280 + randInt(700), { at: i * 0.055, dur: 0.05, type: "square", vol: 0.06 });
      }
      [523.25, 659.25, 783.99].forEach((f) =>
        tone(f, { at: 0.95, dur: 0.45, type: "triangle", vol: 0.14 })
      );
    },
    // Winner fanfare
    win() {
      this.duck();
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
        tone(f, { at: i * 0.11, dur: 0.2, type: "triangle", vol: 0.24 })
      );
      [523.25, 659.25, 783.99, 1046.5].forEach((f) =>
        tone(f, { at: 0.5, dur: 0.9, type: "sine", vol: 0.1 })
      );
      tone(2093, { at: 0.5, dur: 0.5, type: "sine", vol: 0.05 });
    }
  };
})();

// ============================================================
//  State
// ============================================================
function makeGroup(name, names) {
  return { name: name, names: names || [], drawn: [] };
}

function defaultState() {
  return {
    groups: [makeGroup("วงล้อ", ["ก้อง", "แนน", "โบว์", "อาร์ต", "มิว", "ฟิล์ม"])],
    active: 0,
    sample: true // the built-in demo names; replaced without asking on first import
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && Array.isArray(s.groups) && s.groups.length) {
        s.groups.forEach((g) => {
          g.name = g.name ? String(g.name) : "กลุ่ม";
          g.names = Array.isArray(g.names) ? g.names.map(String) : [];
          g.drawn = Array.isArray(g.drawn) ? g.drawn.map(String) : [];
        });
        s.active = Math.min(Math.max(0, s.active | 0), s.groups.length - 1);
        s.sample = false;
        return s;
      }
    }
    // migrate the old single-list version
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const arr = JSON.parse(legacy);
      if (Array.isArray(arr)) {
        return { groups: [makeGroup("วงล้อ", arr.map(String))], active: 0, sample: false };
      }
    }
  } catch (e) {}
  return defaultState();
}

let state = loadState();
let currentRotation = 0;
let isSpinning = false;
let winningIndex = -1;
let winningGroupIdx = -1;

// every save comes from a user action, so the demo names are no longer "untouched"
function saveState() {
  state.sample = false;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
}

function cur() {
  return state.groups[state.active];
}

// ---------- Elements ----------
const $ = (id) => document.getElementById(id);
const canvas = $("wheelCanvas");
const ctx = canvas.getContext("2d");
const pointerEl = $("pointer");
const nameInput = $("nameInput");
const addBtn = $("addBtn");
const namesList = $("namesList");
const emptyMsg = $("emptyMsg");
const countLabel = $("countLabel");
const clearAllBtn = $("clearAllBtn");
const spinBtn = $("spinBtn");
const modalBackdrop = $("modalBackdrop");
const winnerNameEl = $("winnerName");
const winnerGroupEl = $("winnerGroup");
const keepBtn = $("keepBtn");
const removeBtn = $("removeBtn");
const installBtn = $("installBtn");
const soundBtn = $("soundBtn");
const musicBtn = $("musicBtn");
const groupTabs = $("groupTabs");
const groupTitle = $("groupTitle");
const groupSub = $("groupSub");
const renameBtn = $("renameBtn");
const deleteGroupBtn = $("deleteGroupBtn");
const drawnPanel = $("drawnPanel");
const drawnList = $("drawnList");
const drawnCount = $("drawnCount");
const restoreAllBtn = $("restoreAllBtn");
const bulkInput = $("bulkInput");
const bulkInfo = $("bulkInfo");
const dedupeChk = $("dedupeChk");
const bulkAddBtn = $("bulkAddBtn");
const splitMode = $("splitMode");
const splitNum = $("splitNum");
const splitBtn = $("splitBtn");
const summaryBody = $("summaryBody");
const copyAllBtn = $("copyAllBtn");
const toastEl = $("toast");

// ---------- Toast ----------
let toastTimer = null;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2400);
}

// ============================================================
//  Parsing names pasted from Excel
// ============================================================
// - one row = one name
// - several columns in a row (tab-separated) are joined with a space → full name
// - purely numeric cells in a multi-column row (row numbers) are dropped
// - a single line with commas and no tabs/newlines is split on commas
function parseNames(text) {
  text = String(text || "").replace(/\r/g, "");
  let lines;
  if (!/[\n\t]/.test(text) && text.indexOf(",") !== -1) {
    lines = text.split(",");
  } else {
    lines = text.split("\n");
  }
  const out = [];
  for (const line of lines) {
    let cells = line
      .split("\t")
      .map((c) => c.trim().replace(/^"(.*)"$/, "$1").trim())
      .filter(Boolean);
    if (cells.length > 1) cells = cells.filter((c) => !/^\d+[.)]?$/.test(c));
    const name = cells.join(" ").replace(/\s+/g, " ").trim();
    if (name) out.push(name);
  }
  return out;
}

function dedupeNames(list, existing) {
  const seen = new Set((existing || []).map((n) => n.toLowerCase()));
  const out = [];
  let dup = 0;
  for (const n of list) {
    const k = n.toLowerCase();
    if (seen.has(k)) { dup++; continue; }
    seen.add(k);
    out.push(n);
  }
  return { list: out, dup: dup };
}

function updateBulkInfo() {
  const parsed = parseNames(bulkInput.value);
  if (!parsed.length) {
    bulkInfo.textContent = "ยังไม่ได้วางรายชื่อ";
    return;
  }
  const dup = dedupeNames(parsed).dup;
  let msg = `พบ ${parsed.length} ชื่อ`;
  if (dup > 0) msg += ` • ซ้ำ ${dup} ชื่อ (${dedupeChk.checked ? "จะตัดออก" : "คงไว้"})`;
  bulkInfo.textContent = msg;
}

// ============================================================
//  Rendering
// ============================================================
function colorFor(i, n) {
  // avoid the last slice matching the first when n % 12 === 1
  if (n > 1 && i === n - 1 && i % COLORS.length === 0) return COLORS[(i + 6) % COLORS.length];
  return COLORS[i % COLORS.length];
}

function resizeCanvasForDPR() {
  const dpr = window.devicePixelRatio || 1;
  const size = canvas.clientWidth;
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function drawWheel() {
  resizeCanvasForDPR();
  const names = cur().names;
  const size = canvas.clientWidth;
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 4;

  ctx.clearRect(0, 0, size, size);

  if (names.length === 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = "#2b2b3d";
    ctx.fill();
    ctx.fillStyle = "#888";
    ctx.font = "16px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(cur().drawn.length ? "สุ่มครบทุกคนแล้ว 🎉" : "เพิ่มชื่อเพื่อเริ่ม", cx, cy);
    return;
  }

  const n = names.length;
  const segAngle = (Math.PI * 2) / n;
  const startOffset = -Math.PI / 2; // slice 0 starts at the top, going clockwise

  names.forEach((name, i) => {
    const start = startOffset + i * segAngle;
    const end = start + segAngle;

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, start, end);
    ctx.closePath();
    ctx.fillStyle = colorFor(i, n);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.15)";
    ctx.lineWidth = n > 60 ? 1 : 2;
    ctx.stroke();

    // Label: shrink to fit the slice; skip when the slice is too thin to read.
    const rawArc = radius * 0.72 * segAngle * 0.85;
    if (rawArc < 5.5) return;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(start + segAngle / 2);
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#151526";

    const label = String(name);
    const textRight = radius - 12;
    const hubRadius = radius * 0.24;
    const availableWidth = Math.max(42, textRight - hubRadius - 8);
    let fontSize = Math.min(17, rawArc);

    while (fontSize > 5.5) {
      ctx.font = `800 ${fontSize}px "Noto Sans Thai", "Segoe UI", sans-serif`;
      if (ctx.measureText(label).width <= availableWidth) break;
      fontSize -= 0.5;
    }

    ctx.font = `800 ${fontSize}px "Noto Sans Thai", "Segoe UI", sans-serif`;
    ctx.lineWidth = Math.max(1.5, fontSize * 0.16);
    ctx.strokeStyle = "rgba(255,255,255,0.72)";
    ctx.strokeText(label, textRight, 0);
    ctx.fillText(label, textRight, 0);
    ctx.restore();
  });
}

function renderTabs() {
  groupTabs.innerHTML = "";
  const multi = state.groups.length > 1;
  groupTabs.style.display = multi ? "flex" : "none";
  if (!multi) return;

  state.groups.forEach((g, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "tab" + (i === state.active ? " active" : "");
    const done = g.names.length === 0 && g.drawn.length > 0;
    b.textContent = `${done ? "✓ " : ""}${g.name} · ${g.names.length}`;
    b.addEventListener("click", () => {
      if (isSpinning || i === state.active) return;
      state.active = i;
      saveState();
      Sound.click();
      renderAll();
    });
    groupTabs.appendChild(b);
  });

  const a = groupTabs.querySelector(".tab.active");
  if (a && a.scrollIntoView) a.scrollIntoView({ inline: "center", block: "nearest" });
}

function renderGroupHead() {
  const g = cur();
  groupTitle.textContent = g.name;
  let sub = `เหลือในวง ${g.names.length} ชื่อ`;
  if (g.drawn.length) sub += ` • สุ่มออกแล้ว ${g.drawn.length}`;
  groupSub.textContent = sub;
  deleteGroupBtn.style.display = state.groups.length > 1 ? "inline-block" : "none";
}

function renderNamesList() {
  const g = cur();
  const names = g.names;
  namesList.innerHTML = "";

  if (names.length === 0) {
    emptyMsg.style.display = "block";
    emptyMsg.textContent = g.drawn.length
      ? "สุ่มครบทุกคนในกลุ่มนี้แล้ว 🎉"
      : "ยังไม่มีชื่อ เพิ่มอย่างน้อย 2 ชื่อเพื่อเริ่มหมุน";
  } else {
    emptyMsg.style.display = "none";
    names.forEach((name, i) => {
      const li = document.createElement("li");

      const nameSpan = document.createElement("span");
      nameSpan.className = "name-text";

      const swatch = document.createElement("span");
      swatch.className = "swatch";
      swatch.style.background = colorFor(i, names.length);

      nameSpan.appendChild(swatch);
      nameSpan.appendChild(document.createTextNode(name));

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.textContent = "✕";
      delBtn.setAttribute("aria-label", "ลบชื่อ " + name);
      delBtn.addEventListener("click", () => {
        if (isSpinning) return;
        names.splice(i, 1);
        saveState();
        Sound.remove();
        renderAll();
      });

      li.appendChild(nameSpan);
      li.appendChild(delBtn);
      namesList.appendChild(li);
    });
  }

  countLabel.textContent = `ทั้งหมด ${names.length} ชื่อ`;
  updateSpinButton();
}

function updateSpinButton() {
  const n = cur().names.length;
  spinBtn.disabled = isSpinning || n < 1;
  if (n === 0) spinBtn.textContent = "วงนี้ไม่มีชื่อแล้ว";
  else if (n === 1) spinBtn.textContent = "🎯 จับคนสุดท้าย";
  else spinBtn.textContent = "🎯 หมุนวงล้อ";
}

function renderDrawn() {
  const g = cur();
  drawnPanel.style.display = g.drawn.length ? "block" : "none";
  drawnCount.textContent = g.drawn.length;
  drawnList.innerHTML = "";
  g.drawn.forEach((name, i) => {
    const li = document.createElement("li");
    const span = document.createElement("span");
    span.className = "name-text";
    span.textContent = name;
    const back = document.createElement("button");
    back.type = "button";
    back.textContent = "↩";
    back.setAttribute("aria-label", "ใส่กลับเข้าวง " + name);
    back.addEventListener("click", () => {
      if (isSpinning) return;
      g.drawn.splice(i, 1);
      g.names.push(name);
      saveState();
      Sound.add();
      renderAll();
    });
    li.appendChild(span);
    li.appendChild(back);
    drawnList.appendChild(li);
  });
}

function renderSummary() {
  summaryBody.innerHTML = "";
  state.groups.forEach((g) => {
    const box = document.createElement("div");
    box.className = "sum-group";

    const head = document.createElement("strong");
    head.textContent = `${g.name} (${g.names.length + g.drawn.length} คน)`;
    box.appendChild(head);

    const p = document.createElement("p");
    const parts = g.drawn.map((n, i) => `${i + 1}) ${n}`).concat(g.names);
    p.textContent = parts.length ? parts.join(" • ") : "—";
    box.appendChild(p);
    summaryBody.appendChild(box);
  });
}

function renderAll() {
  renderTabs();
  renderGroupHead();
  renderNamesList();
  renderDrawn();
  renderSummary();
  drawWheel();
}

// ============================================================
//  Adding names
// ============================================================
function addNamesFromInput() {
  const raw = nameInput.value;
  if (!raw.trim()) return;
  const parts = raw.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
  cur().names.push(...parts);
  nameInput.value = "";
  saveState();
  Sound.add();
  renderAll();
}

addBtn.addEventListener("click", () => {
  Sound.unlock();
  addNamesFromInput();
});
nameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    Sound.unlock();
    addNamesFromInput();
  }
});

clearAllBtn.addEventListener("click", () => {
  const g = cur();
  if (isSpinning || (g.names.length === 0 && g.drawn.length === 0)) return;
  if (confirm(`ล้างชื่อทั้งหมดใน "${g.name}" ใช่หรือไม่?`)) {
    g.names = [];
    g.drawn = [];
    saveState();
    Sound.remove();
    renderAll();
  }
});

// ---------- Bulk paste from Excel ----------
bulkInput.addEventListener("input", updateBulkInfo);
dedupeChk.addEventListener("change", updateBulkInfo);

bulkAddBtn.addEventListener("click", () => {
  Sound.unlock();
  if (isSpinning) return;
  let list = parseNames(bulkInput.value);
  if (!list.length) {
    toast("ยังไม่ได้วางรายชื่อ");
    Sound.error();
    return;
  }
  const g = cur();
  let skipped = 0;
  if (dedupeChk.checked) {
    const r = dedupeNames(list, g.names.concat(g.drawn));
    list = r.list;
    skipped = r.dup;
  }
  if (!list.length) {
    toast("ชื่อทั้งหมดซ้ำกับที่มีอยู่แล้ว");
    Sound.error();
    return;
  }
  g.names.push(...list);
  bulkInput.value = "";
  updateBulkInfo();
  saveState();
  Sound.add();
  renderAll();
  toast(`เพิ่ม ${list.length} ชื่อเข้า "${g.name}"` + (skipped ? ` (ข้ามที่ซ้ำ ${skipped})` : ""));
});

// ============================================================
//  Random split into groups
// ============================================================
function splitIntoGroups() {
  Sound.unlock();
  if (isSpinning) return;

  let pool = parseNames(bulkInput.value);
  const fromInput = pool.length > 0;
  if (!fromInput) {
    pool = [];
    state.groups.forEach((g) => { pool.push(...g.drawn, ...g.names); });
  }
  if (dedupeChk.checked) pool = dedupeNames(pool).list;

  if (pool.length < 2) {
    toast("ต้องมีอย่างน้อย 2 ชื่อ");
    Sound.error();
    return;
  }

  const num = Math.floor(Number(splitNum.value));
  if (!(num >= 1)) {
    toast("กรอกจำนวนกลุ่ม/จำนวนคนให้ถูกต้อง");
    Sound.error();
    return;
  }

  let k = splitMode.value === "groups" ? num : Math.ceil(pool.length / num);
  k = Math.max(1, Math.min(k, pool.length));

  const hasExisting = !state.sample && state.groups.some((g) => g.names.length || g.drawn.length);
  if (hasExisting) {
    const ok = confirm(
      `จะแบ่ง ${pool.length} ชื่อ เป็น ${k} กลุ่ม\nกลุ่มเดิมทั้งหมด (รวมผลที่สุ่มออกแล้ว) จะถูกแทนที่ ดำเนินการต่อใช่หรือไม่?`
    );
    if (!ok) return;
  }

  // Shuffle once, then deal into k groups whose sizes differ by at most 1.
  const shuffled = shuffle(pool);
  const base = Math.floor(pool.length / k);
  const extra = pool.length % k;
  const groups = [];
  let idx = 0;
  for (let i = 0; i < k; i++) {
    const size = base + (i < extra ? 1 : 0);
    groups.push(makeGroup(`กลุ่ม ${i + 1}`, shuffled.slice(idx, idx + size)));
    idx += size;
  }

  state.groups = groups;
  state.active = 0;
  saveState();
  bulkInput.value = "";
  updateBulkInfo();
  currentRotation = 0;
  canvas.style.transform = "rotate(0deg)";
  renderAll();
  Sound.shuffle();
  toast(`แบ่ง ${pool.length} ชื่อ เป็น ${k} กลุ่มแล้ว`);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

splitBtn.addEventListener("click", splitIntoGroups);

// ---------- Group rename / delete ----------
renameBtn.addEventListener("click", () => {
  if (isSpinning) return;
  const name = prompt("ชื่อกลุ่ม", cur().name);
  if (name === null) return;
  const trimmed = name.trim();
  if (!trimmed) return;
  cur().name = trimmed;
  saveState();
  Sound.click();
  renderAll();
});

deleteGroupBtn.addEventListener("click", () => {
  if (isSpinning || state.groups.length < 2) return;
  const g = cur();
  if (!confirm(`ลบ "${g.name}" พร้อมรายชื่อในกลุ่มนี้ใช่หรือไม่?`)) return;
  state.groups.splice(state.active, 1);
  state.active = Math.min(state.active, state.groups.length - 1);
  saveState();
  Sound.remove();
  renderAll();
});

restoreAllBtn.addEventListener("click", () => {
  const g = cur();
  if (isSpinning || !g.drawn.length) return;
  g.names.push(...g.drawn);
  g.drawn = [];
  saveState();
  Sound.add();
  renderAll();
});

// ---------- Copy all groups (paste into Excel: one column per group) ----------
function buildCopyText() {
  const cols = state.groups.map((g) => g.drawn.concat(g.names));
  const rows = Math.max(0, ...cols.map((c) => c.length));
  const lines = [state.groups.map((g) => g.name).join("\t")];
  for (let r = 0; r < rows; r++) {
    lines.push(cols.map((c) => (r < c.length ? c[r] : "")).join("\t"));
  }
  return lines.join("\n");
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch (_) {}
    ta.remove();
    return ok;
  }
}

copyAllBtn.addEventListener("click", async () => {
  const ok = await copyText(buildCopyText());
  toast(ok ? "คัดลอกแล้ว วางใน Excel ได้เลย (1 คอลัมน์ = 1 กลุ่ม)" : "คัดลอกไม่สำเร็จ");
  if (ok) Sound.add(); else Sound.error();
});

// ============================================================
//  Spinning (JS-driven so the tick sound matches the pegs)
// ============================================================
function applyRotation(deg) {
  canvas.style.transform = `rotate(${deg}deg)`;
}

// index of the slice currently under the pointer (top) for a given rotation
function sliceAt(rotationDeg, n) {
  const eff = (360 - (((rotationDeg % 360) + 360) % 360)) % 360;
  return Math.floor(eff / (360 / n)) % n;
}

function bumpPointer() {
  if (!pointerEl.animate) return;
  pointerEl.animate(
    [
      { transform: "translateX(-50%) rotate(-18deg)" },
      { transform: "translateX(-50%) rotate(0deg)" }
    ],
    { duration: 120, easing: "ease-out" }
  );
}

function spinWheel() {
  if (isSpinning) return;
  Sound.unlock();

  const g = cur();
  const n = g.names.length;
  if (n < 1) return;

  winningGroupIdx = state.active;

  // Only one name left: nothing to spin, just reveal it.
  if (n === 1) {
    winningIndex = 0;
    Sound.win();
    showWinner(g.names[0]);
    return;
  }

  isSpinning = true;
  updateSpinButton();
  Sound.spinStart();

  // Decide the winner first (uniform), then spin so the wheel lands on it.
  winningIndex = randInt(n);
  const seg = 360 / n;
  const inSlice = 0.12 + randFloat() * 0.76; // stay clear of the slice edges
  const desiredEff = (winningIndex + inSlice) * seg;
  const desiredMod = (360 - desiredEff + 360) % 360;
  const curMod = ((currentRotation % 360) + 360) % 360;
  const delta = (desiredMod - curMod + 360) % 360;
  const spins = 5 + randInt(3);

  const from = currentRotation;
  const to = from + spins * 360 + delta;
  const t0 = performance.now();
  let lastIdx = sliceAt(from, n);
  let lastTick = 0;

  function frame(now) {
    const t = Math.min(1, Math.max(0, (now - t0) / SPIN_MS));
    const eased = 1 - Math.pow(1 - t, 4); // ease-out quart
    const rot = from + (to - from) * eased;
    applyRotation(rot);

    const idx = sliceAt(rot, n);
    if (idx !== lastIdx) {
      lastIdx = idx;
      if (now - lastTick > 28) { // don't machine-gun the speakers when it's fast
        Sound.tick();
        bumpPointer();
        lastTick = now;
      }
    }

    if (t < 1) {
      requestAnimationFrame(frame);
    } else {
      currentRotation = to % 360;
      applyRotation(currentRotation);
      isSpinning = false;
      updateSpinButton();
      Sound.win();
      showWinner(g.names[winningIndex]);
    }
  }
  requestAnimationFrame(frame);
}

spinBtn.addEventListener("click", spinWheel);

// ============================================================
//  Winner modal
// ============================================================
function showWinner(name) {
  winnerNameEl.textContent = name;
  const g = state.groups[winningGroupIdx];
  winnerGroupEl.textContent = state.groups.length > 1 && g ? `จาก ${g.name}` : "";
  modalBackdrop.classList.add("show");
}

function hideWinner() {
  modalBackdrop.classList.remove("show");
}

keepBtn.addEventListener("click", () => {
  Sound.click();
  hideWinner();
});

removeBtn.addEventListener("click", () => {
  const g = state.groups[winningGroupIdx];
  if (g && winningIndex >= 0 && winningIndex < g.names.length) {
    const [name] = g.names.splice(winningIndex, 1);
    g.drawn.push(name);
    saveState();
    Sound.remove();
    renderAll();
  }
  hideWinner();
});

modalBackdrop.addEventListener("click", (e) => {
  if (e.target === modalBackdrop) hideWinner();
});

// ============================================================
//  Sound toggle
// ============================================================
function renderSoundBtn() {
  const on = !Sound.isMuted();
  soundBtn.textContent = on ? "🔊" : "🔇";
  soundBtn.setAttribute("aria-pressed", String(on));
  soundBtn.setAttribute("aria-label", on ? "ปิดเสียง" : "เปิดเสียง");
}

soundBtn.addEventListener("click", () => {
  Sound.setMuted(!Sound.isMuted());
  renderSoundBtn();
  if (!Sound.isMuted()) Sound.click();
});

// ============================================================
//  Music toggle
// ============================================================
function renderMusicBtn() {
  const on = Sound.isMusicOn();
  musicBtn.classList.toggle("off", !on);
  musicBtn.setAttribute("aria-pressed", String(on));
  musicBtn.setAttribute("aria-label", on ? "ปิดเพลง" : "เปิดเพลง");
}

musicBtn.addEventListener("click", () => {
  Sound.setMusic(!Sound.isMusicOn());
  renderMusicBtn();
  toast(Sound.isMusicOn() ? "🎵 เปิดเพลงแล้ว" : "ปิดเพลงแล้ว");
});

// iOS/Android only allow audio after a user gesture — unlock on the first touch anywhere.
["pointerdown", "touchstart", "keydown"].forEach((evt) =>
  window.addEventListener(evt, () => Sound.unlock(), { once: true, passive: true })
);

// ---------- Resize ----------
window.addEventListener("resize", () => {
  drawWheel();
});

// ---------- PWA install prompt ----------
let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  installBtn.style.display = "inline-block";
});

installBtn.addEventListener("click", async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  installBtn.style.display = "none";
});

window.addEventListener("appinstalled", () => {
  installBtn.style.display = "none";
});

// ---------- Service worker ----------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

// ---------- Init ----------
renderSoundBtn();
renderMusicBtn();
renderAll();
