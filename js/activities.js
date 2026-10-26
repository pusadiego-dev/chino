// Generadores de preguntas y el motor que las ejecuta.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

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

// ---- Tipos de actividad ----
export const ACTIVIDADES = {
  significado: { ico: '🀄', nombre: 'Significado', desc: 'Carácter → español' },
  caracter:    { ico: '✍️', nombre: 'Carácter', desc: 'Español → carácter' },
  pinyin:      { ico: '🔤', nombre: 'Pinyin', desc: 'Carácter → pinyin' },
  escuchar:    { ico: '🎧', nombre: 'Escuchar', desc: 'Audio → carácter' },
  ordenar:     { ico: '🧩', nombre: 'Ordenar frases', desc: 'Construye la frase' },
};

// Elementos que se pueden preguntar: vocabulario + frases cortas.
function items(lesson) {
  return [...(lesson.vocabulario || []), ...(lesson.frases || [])].filter((x) => x.hanzi && x.es);
}

const normPy = (p) => String(p || '').toLowerCase().replace(/[^a-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü]/g, '');

// Una opción incorrecta no puede ser otra forma válida de la respuesta
// (mismo carácter, misma traducción o, para escuchar/pinyin, mismo sonido).
function ambiguous(item, x) {
  return x.hanzi === item.hanzi || x.es === item.es || (item.pinyin && normPy(x.pinyin) === normPy(item.pinyin));
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

function choice(item, pool, { prompt, field, hzOptions = false, audio = null }) {
  const opts = shuffle([item, ...distractors(item, pool, field)]).map((x) => ({
    html: esc(x[field]), correct: x[field] === item[field],
  }));
  return { kind: 'choice', prompt, options: opts, hzOptions, audio, item };
}

const gen = {
  significado: (it, pool) => choice(it, pool, {
    field: 'es',
    prompt: `<div class="big">${esc(it.hanzi)}</div><div class="hint">¿Qué significa?</div>`,
  }),
  caracter: (it, pool) => choice(it, pool, {
    field: 'hanzi', hzOptions: true,
    prompt: `<div class="mid">${esc(it.es)}</div><div class="hint">Elige los caracteres</div>`,
  }),
  pinyin: (it, pool) => choice(it, pool, {
    field: 'pinyin',
    prompt: `<div class="big">${esc(it.hanzi)}</div><div class="hint">¿Cómo se lee?</div>`,
  }),
  escuchar: (it, pool) => choice(it, pool, {
    field: 'hanzi', hzOptions: true, audio: it.hanzi,
    prompt: `<button class="speak" style="width:80px;height:80px;font-size:34px" data-say>🔊</button><div class="hint">Escucha y elige lo que oyes</div>`,
  }),
  ordenar: (fr) => ({ kind: 'order', item: fr, words: fr.palabras }),
};

// Qué actividades tienen sentido con el contenido de la lección.
export function availableActivities(lesson, poolSize) {
  const out = [];
  const n = items(lesson).length;
  if (n >= 2 && poolSize >= 4) out.push('significado', 'caracter');
  if (n >= 2 && poolSize >= 4 && items(lesson).some((x) => x.pinyin)) out.push('pinyin');
  if (n >= 2 && poolSize >= 4 && canSpeak()) out.push('escuchar');
  if ((lesson.frases || []).some((f) => f.palabras?.length > 1)) out.push('ordenar');
  return out;
}

// pool = elementos de esta lección y anteriores (para tener distractores suficientes).
export function buildQuestions(tipo, lesson, pool, max = 10) {
  if (tipo === 'ordenar') {
    return shuffle((lesson.frases || []).filter((f) => f.palabras?.length > 1)).slice(0, max).map((f) => gen.ordenar(f));
  }
  let src = items(lesson);
  if (tipo === 'pinyin') src = src.filter((x) => x.pinyin);
  const poolF = tipo === 'pinyin' ? pool.filter((x) => x.pinyin) : pool;
  return shuffle(src).slice(0, max).map((it) => gen[tipo](it, poolF));
}

export function buildExam(lesson, pool, total = 15) {
  const tipos = availableActivities(lesson, pool.length);
  const qs = [];
  // En el examen pesan más las palabras clave que las de práctica de pronunciación.
  const extra = (x) => /práctica/.test(x.nota || '');
  const src = [...shuffle(items(lesson).filter((x) => !extra(x))), ...shuffle(items(lesson).filter(extra))];
  const frases = shuffle((lesson.frases || []).filter((f) => f.palabras?.length > 1));
  const choiceTipos = tipos.filter((t) => t !== 'ordenar');
  // Hasta un tercio de preguntas de ordenar si hay frases.
  const nOrder = tipos.includes('ordenar') ? Math.min(frases.length, Math.ceil(total / 4)) : 0;
  frases.slice(0, nOrder).forEach((f) => qs.push(gen.ordenar(f)));
  let i = 0;
  while (qs.length < total && choiceTipos.length && i < total * 3) {
    const it = src[i % src.length];
    const t = choiceTipos[i % choiceTipos.length];
    if (t !== 'pinyin' || it.pinyin) qs.push(gen[t](it, t === 'pinyin' ? pool.filter((x) => x.pinyin) : pool));
    i++;
  }
  return shuffle(qs);
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

    const answered = (ok) => {
      if (ok) correct++; else mistakes.push(q.item);
      const it = q.item;
      fb.className = `feedback show ${ok ? 'ok' : 'ko'}`;
      fb.innerHTML = `${ok ? '✔ ¡Correcto!' : '✘ No es correcto.'}<br>
        <span class="hz" style="font-size:20px">${esc(it.hanzi)}</span> · <b>${esc(it.pinyin || '')}</b> · ${esc(it.es)}`;
      nextBtn.style.display = '';
      speak(it.hanzi);
    };

    if (q.kind === 'choice') {
      qEl.innerHTML = `<div class="prompt">${q.prompt}</div>
        <div class="options">${q.options.map((o, i) =>
          `<button class="opt ${q.hzOptions ? 'hzopt' : ''}" data-i="${i}">${o.html}</button>`).join('')}</div>`;
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
    } else {
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
        bankEl.querySelectorAll('.tile').forEach((t) => { t.onclick = () => { if (!check.hidden) { chosen.push(bank[+t.dataset.b]); speak(bank[+t.dataset.b].w); draw(); } }; });
      };
      draw();
      check.onclick = () => {
        check.hidden = true;
        answered(chosen.map((c) => c.w).join('') === q.words.join(''));
      };
    }
  };
  next();
}
