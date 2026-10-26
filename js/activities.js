// Generadores de preguntas y el motor que las ejecuta.
// Método pinyin: se aprende escuchando, leyendo pinyin y hablando; los caracteres son opcionales.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---- Preferencia: mostrar caracteres chinos ----
export function showHanzi() {
  try { return localStorage.getItem('chino.verCaracteres') === '1'; } catch { return false; }
}
export function setShowHanzi(on) {
  try { localStorage.setItem('chino.verCaracteres', on ? '1' : '0'); } catch { /* sin almacenamiento */ }
}
// Línea pequeña con el carácter, solo si el usuario la ha activado.
export const hzLine = (hanzi, cls = 'hzsmall') => (showHanzi() && hanzi ? `<div class="${cls}">${esc(hanzi)}</div>` : '');

// ---- Audio (voz del navegador en chino) ----
let zhVoice = null;
function pickVoice() {
  const voices = window.speechSynthesis?.getVoices() || [];
  zhVoice = voices.find((v) => /zh[-_]CN/i.test(v.lang)) || voices.find((v) => /^zh/i.test(v.lang)) || null;
}
if ('speechSynthesis' in window) {
  pickVoice();
  window.speechSynthesis.onvoiceschanged = pickVoice;
}
export const canSpeak = () => 'speechSynthesis' in window;
export function speak(text, rate = 0.8) {
  if (!canSpeak()) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'zh-CN';
  u.rate = rate;
  if (zhVoice) u.voice = zhVoice;
  window.speechSynthesis.speak(u);
}

// ---- Pinyin y tonos ----
const TONES = { a: 'āáǎà', e: 'ēéěè', i: 'īíǐì', o: 'ōóǒò', u: 'ūúǔù', ü: 'ǖǘǚǜ' };
const MARKED = {};
for (const [base, marks] of Object.entries(TONES)) [...marks].forEach((m, t) => { MARKED[m] = [base, t]; MARKED[m.toUpperCase()] = [base.toUpperCase(), t]; });

// Quita las tildes de tono (mantiene la ü).
export const stripTones = (py) => [...String(py || '')].map((c) => (MARKED[c] ? MARKED[c][0] : c)).join('');
const toneless = (py) => stripTones(py).toLowerCase().replace(/[^a-zü]/g, '');

// Variantes del mismo pinyin con otros tonos, para el ejercicio de tonos.
function toneVariants(py, n = 3) {
  const chars = [...py];
  const pos = chars.map((c, i) => (MARKED[c] ? i : -1)).filter((i) => i >= 0);
  if (!pos.length) return [];
  const out = new Set();
  for (let tries = 0; tries < 60 && out.size < n; tries++) {
    const v = [...chars];
    const change = shuffle(pos).slice(0, 1 + Math.floor(Math.random() * Math.min(2, pos.length)));
    for (const i of change) {
      const [base, t] = MARKED[chars[i]];
      const lower = base.toLowerCase();
      let nt = Math.floor(Math.random() * 3);
      if (nt >= t) nt++;
      const m = TONES[lower][nt];
      v[i] = base === lower ? m : m.toUpperCase();
    }
    const s = v.join('');
    if (s !== py) out.add(s);
  }
  return [...out];
}

// ---- Tipos de actividad ----
export const ACTIVIDADES = {
  escuchar:    { ico: '🎧', nombre: 'Escuchar', desc: 'Oye y elige qué significa' },
  tonos:       { ico: '🎵', nombre: 'Tonos', desc: 'Oye y elige los tonos' },
  significado: { ico: '🔤', nombre: 'Leer pinyin', desc: 'Pinyin → español' },
  decir:       { ico: '💬', nombre: '¿Cómo se dice?', desc: 'Español → pinyin' },
  ordenar:     { ico: '🧩', nombre: 'Ordenar frases', desc: 'Construye la frase en pinyin' },
  hablar:      { ico: '🎤', nombre: 'Hablar', desc: 'Dilo en voz alta' },
};

// Elementos que se pueden preguntar: vocabulario + frases.
function items(lesson) {
  return [...(lesson.vocabulario || []), ...(lesson.frases || [])].filter((x) => x.hanzi && x.es && x.pinyin);
}
const orderable = (lesson) => (lesson.frases || []).filter((f) => (f.palabrasPinyin || []).filter((w) => !isPunct(w)).length > 1);
const isPunct = (w) => /^[，。？！、,.?!]+$/.test(w);

// Una opción incorrecta no puede ser otra forma válida de la respuesta.
function ambiguous(item, x) {
  return x.hanzi === item.hanzi || x.es === item.es || toneless(x.pinyin) === toneless(item.pinyin);
}

function distractors(item, pool, field, n = 3) {
  const seen = new Set([item[field]]);
  const out = [];
  for (const x of shuffle(pool)) {
    if (!x[field] || seen.has(x[field]) || ambiguous(item, x)) continue;
    seen.add(x[field]);
    out.push(x);
    if (out.length === n) break;
  }
  return out;
}

function choice(item, pool, { prompt, field, pyOptions = false, audio = null }) {
  const opts = shuffle([item, ...distractors(item, pool, field)]).map((x) => ({
    html: esc(x[field]) + (pyOptions ? hzLine(x.hanzi, 'hzopt') : ''), correct: x[field] === item[field],
  }));
  return { kind: 'choice', prompt, options: opts, pyOptions, audio, item };
}

const sayBtn = `<button class="speak big-speak" data-say aria-label="Escuchar">🔊</button>`;

const gen = {
  escuchar: (it, pool) => choice(it, pool, {
    field: 'es', audio: it.hanzi,
    prompt: `${sayBtn}<div class="hint">Escucha y elige qué significa</div>`,
  }),
  tonos: (it) => {
    const opts = shuffle([it.pinyin, ...toneVariants(it.pinyin)]).map((p) => ({ html: esc(p), correct: p === it.pinyin }));
    return {
      kind: 'choice', item: it, audio: it.hanzi, pyOptions: true, options: opts,
      prompt: `${sayBtn}<div class="mid py">${esc(stripTones(it.pinyin))}</div><div class="hint">¿Con qué tonos se dice?</div>`,
    };
  },
  significado: (it, pool) => choice(it, pool, {
    field: 'es', audio: it.hanzi,
    prompt: `<div class="big py">${esc(it.pinyin)}</div>${hzLine(it.hanzi)}<div class="hint">¿Qué significa?</div>`,
  }),
  decir: (it, pool) => choice(it, pool, {
    field: 'pinyin', pyOptions: true,
    prompt: `<div class="mid">${esc(it.es)}</div><div class="hint">¿Cómo se dice en chino?</div>`,
  }),
  ordenar: (fr) => ({ kind: 'order', item: fr, words: fr.palabrasPinyin.filter((w) => !isPunct(w)).map((w) => w.toLowerCase()) }),
  hablar: (it) => ({ kind: 'speak', item: it }),
};

// Qué actividades tienen sentido con el contenido de la lección.
export function availableActivities(lesson, poolSize) {
  const out = [];
  const n = items(lesson).length;
  if (n >= 2 && poolSize >= 4) out.push('escuchar');
  if (items(lesson).some((x) => toneVariants(x.pinyin).length >= 2)) out.push('tonos');
  if (n >= 2 && poolSize >= 4) out.push('significado', 'decir');
  if (orderable(lesson).length) out.push('ordenar');
  if (n) out.push('hablar');
  if (!canSpeak()) return out.filter((t) => t !== 'escuchar' && t !== 'tonos');
  return out;
}

const tonable = (x) => toneVariants(x.pinyin).length >= 2;

// pool = elementos de esta lección y anteriores (para tener distractores suficientes).
export function buildQuestions(tipo, lesson, pool, max = 10) {
  if (tipo === 'ordenar') return shuffle(orderable(lesson)).slice(0, max).map((f) => gen.ordenar(f));
  let src = items(lesson);
  if (tipo === 'tonos') src = src.filter(tonable);
  if (tipo === 'hablar') {
    // Mezcla palabras clave y frases cortas.
    const core = src.filter((x) => !/práctica/.test(x.nota || ''));
    return shuffle(core).slice(0, max).map((it) => gen.hablar(it));
  }
  return shuffle(src).slice(0, max).map((it) => gen[tipo](it, pool));
}

export function buildExam(lesson, pool, total = 15) {
  const tipos = availableActivities(lesson, pool.length).filter((t) => t !== 'hablar');
  const qs = [];
  // En el examen pesan más las palabras clave que las de práctica de pronunciación.
  const extra = (x) => /práctica/.test(x.nota || '');
  const src = [...shuffle(items(lesson).filter((x) => !extra(x))), ...shuffle(items(lesson).filter(extra))];
  const frases = shuffle(orderable(lesson));
  const choiceTipos = tipos.filter((t) => t !== 'ordenar');
  const nOrder = tipos.includes('ordenar') ? Math.min(frases.length, Math.ceil(total / 5)) : 0;
  frases.slice(0, nOrder).forEach((f) => qs.push(gen.ordenar(f)));
  let i = 0;
  while (qs.length < total && choiceTipos.length && src.length && i < total * 4) {
    const it = src[i % src.length];
    const t = choiceTipos[i % choiceTipos.length];
    if (t !== 'tonos' || tonable(it)) qs.push(gen[t](it, pool));
    i++;
  }
  return shuffle(qs);
}

// ---- Reconocimiento de voz ----
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
// En el iPhone, con la web añadida a la pantalla de inicio, el reconocimiento no funciona aunque exista.
const iosStandalone = navigator.standalone === true || (/iP(hone|ad|od)/.test(navigator.userAgent) && matchMedia('(display-mode: standalone)').matches);
export const canListen = () => !!Recognition && !iosStandalone;
let activeRec = null;
// Plan B para cualquier móvil: grabarse y escucharse.
export const canRecord = () => !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
let activeRecorder = null;
// Para el micrófono si se sale del ejercicio.
export function stopListening() {
  try { activeRec?.abort(); } catch { /* ya parado */ }
  activeRec = null;
  try { if (activeRecorder?.state === 'recording') activeRecorder.stop(); } catch { /* ya parado */ }
  activeRecorder = null;
}

// Graba hasta `max` ms (o hasta llamar a stopListening) y devuelve una URL con el audio, o null si falla.
async function recordVoice(max = 7000) {
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { return { error: 'not-allowed' }; }
  return new Promise((resolve) => {
    const chunks = [];
    let rec;
    try { rec = new MediaRecorder(stream); } catch { stream.getTracks().forEach((t) => t.stop()); resolve({ error: 'start' }); return; }
    activeRecorder = rec;
    const timer = setTimeout(() => { if (rec.state === 'recording') rec.stop(); }, max);
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      clearTimeout(timer);
      stream.getTracks().forEach((t) => t.stop());
      if (activeRecorder === rec) activeRecorder = null;
      resolve(chunks.length ? { url: URL.createObjectURL(new Blob(chunks, { type: rec.mimeType || 'audio/mp4' })) } : { error: 'empty' });
    };
    rec.start();
  });
}

let pinyinLib = null;
const loadPinyin = () => (pinyinLib ??= import('./vendor/pinyin-pro.mjs').catch(() => null));

const ZH_DIGITS = '零一二三四五六七八九';
function numToZh(n) {
  if (n < 10) return ZH_DIGITS[n];
  if (n < 20) return '十' + (n % 10 ? ZH_DIGITS[n % 10] : '');
  if (n < 100) return ZH_DIGITS[Math.floor(n / 10)] + '十' + (n % 10 ? ZH_DIGITS[n % 10] : '');
  return String(n);
}
const cleanZh = (s) => String(s || '').replace(/\d+/g, (d) => numToZh(+d)).replace(/[^一-鿿]/g, '');

async function sylls(hanzi) {
  const lib = await loadPinyin();
  const t = cleanZh(hanzi);
  if (!lib) return [...t];
  return lib.pinyin(t, { toneType: 'none', type: 'array' }).map((s) => s.replace('v', 'ü'));
}

function similarity(a, b) {
  const m = a.length, n = b.length;
  if (!m || !n) return 0;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return 1 - d[m][n] / Math.max(m, n);
}

// Escucha una vez y devuelve { ok, heard, py, error }. Nunca se queda colgado: hay un tiempo máximo.
function listenOnce(target) {
  return new Promise((resolve) => {
    let done = false;
    let rec;
    const finish = (r) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (activeRec === rec) activeRec = null;
      try { rec?.abort(); } catch { /* ya parado */ }
      resolve(r);
    };
    const timer = setTimeout(() => finish({ ok: false, error: 'timeout' }), 9000);
    try {
      rec = new Recognition();
      activeRec = rec;
      rec.lang = 'zh-CN';
      rec.interimResults = false;
      rec.continuous = false;
      rec.maxAlternatives = 5;
      rec.onresult = (e) => {
        const alts = [...(e.results[0] || [])].map((a) => a.transcript);
        compare(target, alts).then(finish, () => finish({ ok: false, heard: alts[0] || '' }));
      };
      rec.onerror = (e) => finish({ ok: false, error: e.error || 'error' });
      // onend llega antes que el resultado en algunos navegadores: se espera un poco.
      rec.onend = () => setTimeout(() => finish({ ok: false, heard: '' }), 1500);
      rec.start();
    } catch {
      finish({ ok: false, error: 'start' });
    }
  });
}

async function compare(target, alts) {
  const want = await sylls(target);
  let best = { score: 0, heard: alts[0] || '' };
  for (const a of alts) {
    const got = await sylls(a);
    const s = cleanZh(a) === cleanZh(target) ? 1 : similarity(got, want);
    if (s > best.score) best = { score: s, heard: a, py: got.join(' ') };
  }
  return { ok: best.score >= 0.75, heard: best.heard, py: best.py };
}

// ---- Motor ----
// Ejecuta preguntas dentro de `root` y llama a onFinish({ pct, correct, total, mistakes }).
export function runQuiz(root, questions, onFinish, { title = '' } = {}) {
  let idx = 0;
  let correct = 0;
  const mistakes = [];

  const next = () => {
    if (idx >= questions.length) {
      const pct = questions.length ? Math.round((correct / questions.length) * 100) : 0;
      onFinish({ pct, correct, total: questions.length, mistakes });
      return;
    }
    const q = questions[idx];
    root.innerHTML = `
      <div class="progress-top">
        <a href="javascript:history.back()" class="note" style="text-decoration:none;font-size:20px">✕</a>
        <div class="bar"><span style="width:${(idx / questions.length) * 100}%"></span></div>
        <span class="note">${idx + 1}/${questions.length}</span>
      </div>
      ${title ? `<div class="note" style="text-align:center">${esc(title)}</div>` : ''}
      <div id="q"></div>
      <div class="feedback" id="fb"></div>
      <button class="btn block" id="next" style="display:none">Continuar</button>`;
    const qEl = root.querySelector('#q');
    const fb = root.querySelector('#fb');
    const nextBtn = root.querySelector('#next');
    nextBtn.onclick = () => { idx++; next(); };

    const answered = (ok, extra = '') => {
      if (ok) correct++; else mistakes.push(q.item);
      const it = q.item;
      fb.className = `feedback show ${ok ? 'ok' : 'ko'}`;
      fb.innerHTML = `${ok ? '✔ ¡Correcto!' : '✘ No es correcto.'}${extra}<br>
        <b class="py" style="font-size:20px">${esc(it.pinyin)}</b> · ${esc(it.es)}${hzLine(it.hanzi)}`;
      nextBtn.style.display = '';
      speak(it.hanzi);
    };

    if (q.kind === 'choice') {
      qEl.innerHTML = `<div class="prompt">${q.prompt}</div>
        <div class="options">${q.options.map((o, i) =>
          `<button class="opt ${q.pyOptions ? 'pyopt' : ''}" data-i="${i}">${o.html}</button>`).join('')}</div>`;
      const say = qEl.querySelector('[data-say]');
      if (say) { say.onclick = () => speak(q.audio); setTimeout(() => speak(q.audio), 250); }
      qEl.querySelectorAll('.opt').forEach((b) => {
        b.onclick = () => {
          if (nextBtn.style.display === '') return;
          const o = q.options[+b.dataset.i];
          qEl.querySelectorAll('.opt').forEach((x) => { if (q.options[+x.dataset.i].correct) x.classList.add('right'); });
          if (!o.correct) b.classList.add('wrong');
          answered(o.correct);
        };
      });
    } else if (q.kind === 'order') {
      const bank = shuffle(q.words.map((w, i) => ({ w, i })));
      const chosen = [];
      qEl.innerHTML = `<div class="prompt"><div class="mid">${esc(q.item.es)}</div><div class="hint">Ordena las palabras</div></div>
        <div class="slots" id="slots"></div><div class="bank" id="bank"></div>
        <button class="btn block" id="check" disabled>Comprobar</button>`;
      const slots = qEl.querySelector('#slots');
      const bankEl = qEl.querySelector('#bank');
      const check = qEl.querySelector('#check');
      const draw = () => {
        slots.innerHTML = chosen.map((c, k) => `<button class="tile" data-k="${k}">${esc(c.w)}</button>`).join('');
        bankEl.innerHTML = bank.map((c, k) => `<button class="tile ${chosen.includes(c) ? 'used' : ''}" data-b="${k}">${esc(c.w)}</button>`).join('');
        check.disabled = chosen.length !== q.words.length;
        slots.querySelectorAll('.tile').forEach((t) => { t.onclick = () => { if (!check.hidden) { chosen.splice(+t.dataset.k, 1); draw(); } }; });
        bankEl.querySelectorAll('.tile').forEach((t) => { t.onclick = () => { if (!check.hidden) { chosen.push(bank[+t.dataset.b]); draw(); } }; });
      };
      draw();
      check.onclick = () => {
        check.hidden = true;
        answered(chosen.map((c) => c.w).join(' ') === q.words.join(' '));
      };
    } else {
      // Hablar: se muestra el español (y el pinyin como ayuda), se escucha el modelo y se dice en voz alta.
      // Si el micrófono no va, siempre se puede seguir valorándose uno mismo.
      const it = q.item;
      const mic = canListen();
      const grabar = !mic && canRecord();
      if (mic) loadPinyin();
      qEl.innerHTML = `<div class="prompt">
          <div class="mid">${esc(it.es)}</div>
          <div class="py big-py">${esc(it.pinyin)}</div>${hzLine(it.hanzi)}
          <div class="row" style="justify-content:center;margin-top:12px">
            <button class="btn secondary" id="model">🔊 Escuchar</button>
          </div>
        </div>
        ${mic ? `<button class="btn block mic" id="mic">🎤 Pulsa y habla</button>` : ''}
        ${grabar ? `<button class="btn block mic" id="rec">🎙️ Grábate diciéndolo</button>
          <button class="btn secondary block" id="play" hidden style="margin-top:8px">▶ Escúchate</button>` : ''}
        <p class="note" id="heard" style="text-align:center">${mic ? '' : grabar
          ? 'Grábate, compara tu voz con el audio y valora cómo te ha salido.'
          : 'Repite la frase en voz alta y valora cómo te ha salido:'}</p>
        <div class="row" id="self"><button class="btn secondary" id="selfno">Me ha costado</button><button class="btn secondary" id="selfok">Lo he dicho bien</button></div>`;
      qEl.querySelector('#model').onclick = () => speak(it.hanzi);
      setTimeout(() => speak(it.hanzi), 250);
      const self = qEl.querySelector('#self');
      const micBtn = qEl.querySelector('#mic');
      const heard = qEl.querySelector('#heard');
      const recBtn = qEl.querySelector('#rec');
      const playBtn = qEl.querySelector('#play');
      const end = (ok, extra) => {
        stopListening();
        [micBtn, recBtn, playBtn].forEach((b) => { if (b) b.hidden = true; });
        self.hidden = true;
        answered(ok, extra);
      };
      if (recBtn) {
        let recording = false;
        let voice = null;
        playBtn.onclick = () => { if (voice) { window.speechSynthesis?.cancel(); new Audio(voice).play().catch(() => {}); } };
        recBtn.onclick = async () => {
          if (recording) { stopListening(); return; }
          window.speechSynthesis?.cancel();
          recording = true;
          recBtn.textContent = '⏺ Grabando… (toca para parar)';
          const r = await recordVoice();
          recording = false;
          if (!qEl.isConnected) return;
          recBtn.textContent = '🎙️ Grábate otra vez';
          if (r.url) {
            if (voice) URL.revokeObjectURL(voice);
            voice = r.url;
            playBtn.hidden = false;
            heard.textContent = 'Escucha tu voz y el audio (🔊) y valora cómo te ha salido.';
          } else {
            recBtn.hidden = true;
            heard.textContent = r.error === 'not-allowed'
              ? 'No tengo permiso para usar el micrófono. Repite en voz alta y valora cómo te ha salido:'
              : 'No he podido grabar. Repite en voz alta y valora cómo te ha salido:';
          }
        };
      }
      qEl.querySelector('#selfok').onclick = () => end(true);
      qEl.querySelector('#selfno').onclick = () => end(false);
      if (micBtn) {
        let tries = 0;
        let listening = false;
        micBtn.onclick = async () => {
          if (nextBtn.style.display === '') return;
          if (listening) { stopListening(); return; }
          window.speechSynthesis?.cancel();
          listening = true;
          micBtn.textContent = '👂 Escuchando… (toca para parar)';
          heard.textContent = '';
          const r = await listenOnce(it.hanzi);
          listening = false;
          if (nextBtn.style.display === '' || !qEl.isConnected) return;
          micBtn.textContent = '🎤 Pulsa y habla';
          if (r.ok) { end(true, ' Te he entendido bien.'); return; }
          tries++;
          if (['not-allowed', 'service-not-allowed', 'audio-capture', 'start', 'network'].includes(r.error)) {
            micBtn.hidden = true;
            heard.textContent = r.error === 'not-allowed' || r.error === 'service-not-allowed'
              ? 'No tengo permiso para usar el micrófono. Repite en voz alta y valora cómo te ha salido:'
              : 'El micrófono no funciona en este navegador. Repite en voz alta y valora cómo te ha salido:';
            return;
          }
          heard.textContent = r.heard ? `He entendido: ${r.py || r.heard}. Prueba otra vez.` : 'No te he oído bien. Prueba otra vez.';
          if (tries >= 3) end(false);
        };
      }
    }
  };
  next();
}
