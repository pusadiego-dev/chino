import * as store from './store.js';
import { NOTA_APROBADO } from '../firebase-config.js';
import { ACTIVIDADES, availableActivities, buildQuestions, buildExam, runQuiz, speak, canSpeak, esc, shuffle, showHanzi, setShowHanzi, hzLine } from './activities.js';

const app = document.getElementById('app');
const userBox = document.getElementById('user-box');
let lessons = [];

// ---------- Datos ----------
async function loadLessons() {
  const idx = await fetch('lessons/index.json', { cache: 'no-cache' }).then((r) => r.json());
  const all = await Promise.all(idx.lecciones.map((f) =>
    fetch(`lessons/${f}`, { cache: 'no-cache' }).then((r) => r.json()).catch(() => null)));
  lessons = all.filter(Boolean).sort((a, b) => a.numero - b.numero);
}

const prog = (id) => store.getProgress()[id] || { aprobado: false, mejorExamen: 0, intentos: 0, actividades: {} };
const isUnlocked = (i) => i === 0 || prog(lessons[i - 1].id).aprobado;
const lessonIndex = (id) => lessons.findIndex((l) => l.id === id);
// Elementos de esta lección y anteriores: sirven como opciones incorrectas.
const poolUpTo = (i) => lessons.slice(0, i + 1).flatMap((l) => [...(l.vocabulario || []), ...(l.frases || [])]).filter((x) => x.hanzi && x.es);

// ---------- Vistas ----------
function renderUserBox() {
  const u = store.getUser();
  const hz = showHanzi();
  userBox.innerHTML = u ? `<button id="hz-toggle" title="Mostrar u ocultar los caracteres chinos">${hz ? '汉字 sí' : '汉字 no'}</button>
    <span>${esc(u.name)}</span><button id="logout">Salir</button>` : '';
  if (u) {
    userBox.querySelector('#logout').onclick = () => store.logout();
    // Cambiar la preferencia vuelve a pintar la vista actual (no reinicia un ejercicio a medias si no hace falta).
    userBox.querySelector('#hz-toggle').onclick = () => { setShowHanzi(!hz); route(); };
  }
}

function viewLogin() {
  if (store.isCloud()) {
    app.innerHTML = `
      <h1>¡Hola! Nǐ hǎo</h1>
      <p class="sub">Entra con tu cuenta para guardar tu progreso.</p>
      <div class="card">
        <div class="row" style="margin-bottom:12px">
          <button class="btn" id="t-login">Entrar</button>
          <button class="btn secondary" id="t-reg">Crear cuenta</button>
        </div>
        <form id="f">
          <div id="name-field" hidden><label>Tu nombre</label><input type="text" id="name" autocomplete="name"></div>
          <label>Email</label><input type="email" id="email" required autocomplete="email">
          <label>Contraseña</label><input type="password" id="pass" required minlength="6" autocomplete="current-password">
          <p class="error" id="err"></p>
          <button class="btn block" type="submit" id="go">Entrar</button>
          <p class="note" style="text-align:center"><a href="#" id="forgot">He olvidado mi contraseña</a></p>
        </form>
      </div>`;
    let reg = false;
    const $ = (s) => app.querySelector(s);
    const setMode = (r) => {
      reg = r;
      $('#name-field').hidden = !r;
      $('#go').textContent = r ? 'Crear cuenta' : 'Entrar';
      $('#t-login').className = r ? 'btn secondary' : 'btn';
      $('#t-reg').className = r ? 'btn' : 'btn secondary';
      $('#pass').autocomplete = r ? 'new-password' : 'current-password';
    };
    $('#t-login').onclick = () => setMode(false);
    $('#t-reg').onclick = () => setMode(true);
    $('#forgot').onclick = async (e) => {
      e.preventDefault();
      const email = $('#email').value.trim();
      if (!email) { $('#err').textContent = 'Escribe tu email primero.'; return; }
      try { await store.resetPassword(email); $('#err').textContent = 'Te hemos enviado un email para cambiarla.'; }
      catch (err) { $('#err').textContent = authError(err); }
    };
    $('#f').onsubmit = async (e) => {
      e.preventDefault();
      $('#err').textContent = '';
      $('#go').disabled = true;
      try {
        const email = $('#email').value.trim();
        const pass = $('#pass').value;
        if (reg) {
          const name = $('#name').value.trim();
          if (!name) throw { code: 'nombre' };
          await store.register(name, email, pass);
        } else {
          await store.login(email, pass);
        }
      } catch (err) {
        $('#err').textContent = authError(err);
        $('#go').disabled = false;
      }
    };
  } else {
    const perfiles = store.localProfiles();
    app.innerHTML = `
      <h1>¡Hola! Nǐ hǎo</h1>
      <p class="sub">¿Quién va a estudiar?</p>
      ${perfiles.map((p) => `<button class="btn secondary block" style="margin-bottom:8px" data-p="${esc(p)}">${esc(p)}</button>`).join('')}
      <div class="card">
        <form id="f"><label>Nuevo perfil</label><input type="text" id="name" placeholder="Tu nombre" required>
        <button class="btn block" type="submit">Empezar</button></form>
      </div>
      <p class="note">Los resultados se guardan solo en este dispositivo.</p>`;
    app.querySelectorAll('[data-p]').forEach((b) => { b.onclick = () => store.loginLocal(b.dataset.p); });
    app.querySelector('#f').onsubmit = (e) => { e.preventDefault(); store.loginLocal(app.querySelector('#name').value); };
  }
}

function authError(err) {
  const map = {
    nombre: 'Escribe tu nombre.',
    'auth/invalid-email': 'El email no es válido.',
    'auth/invalid-credential': 'Email o contraseña incorrectos.',
    'auth/wrong-password': 'Email o contraseña incorrectos.',
    'auth/user-not-found': 'No hay ninguna cuenta con ese email.',
    'auth/email-already-in-use': 'Ya existe una cuenta con ese email.',
    'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
    'auth/network-request-failed': 'Sin conexión. Inténtalo de nuevo.',
  };
  return map[err?.code] || 'Algo ha fallado. Inténtalo de nuevo.';
}

function viewHome() {
  const aprobadas = lessons.filter((l) => prog(l.id).aprobado).length;
  app.innerHTML = `
    <h1>Tus lecciones</h1>
    <p class="sub">${aprobadas} de ${lessons.length} aprobadas · aprueba el examen con ${NOTA_APROBADO}% para desbloquear la siguiente</p>
    ${lessons.map((l, i) => {
      const p = prog(l.id);
      const open = isUnlocked(i);
      const tipos = availableActivities(l, poolUpTo(i).length);
      const hechas = tipos.filter((t) => (p.actividades[t] || 0) > 0).length;
      const pct = tipos.length ? Math.round(((hechas + (p.aprobado ? 1 : 0)) / (tipos.length + 1)) * 100) : 0;
      return `<a class="card lesson ${p.aprobado ? 'done' : ''} ${open ? '' : 'locked'}" href="#/l/${l.id}">
        <div class="num">${p.aprobado ? '✓' : open ? l.numero : '🔒'}</div>
        <div class="info">
          <div class="title">${esc(l.titulo)} ${l.tituloChino && showHanzi() ? `<span class="hz">${esc(l.tituloChino)}</span>` : ''}</div>
          <div class="meta">Lección ${l.numero} · ${(l.vocabulario || []).length} palabras${p.mejorExamen ? ` · examen ${p.mejorExamen}%` : ''}</div>
          ${open ? `<div class="bar"><span style="width:${pct}%"></span></div>` : ''}
        </div></a>`;
    }).join('')}
    ${lessons.length ? '' : '<p class="sub">Todavía no hay lecciones.</p>'}`;
}

function viewLesson(id) {
  const i = lessonIndex(id);
  const l = lessons[i];
  if (!l) return notFound();
  if (!isUnlocked(i)) {
    app.innerHTML = `<p><a href="#/">← Lecciones</a></p><div class="card" style="text-align:center">
      <div style="font-size:40px">🔒</div><h2>${esc(l.titulo)}</h2>
      <p class="sub">Aprueba el examen de la lección ${lessons[i - 1].numero} (${esc(lessons[i - 1].titulo)}) para desbloquearla.</p>
      <a class="btn" href="#/l/${lessons[i - 1].id}">Ir a la lección ${lessons[i - 1].numero}</a></div>`;
    return;
  }
  const p = prog(id);
  const tipos = availableActivities(l, poolUpTo(i).length);
  const sc = (t) => (p.actividades[t] ? `Mejor: ${p.actividades[t]}%` : 'Sin hacer');
  app.innerHTML = `
    <p><a href="#/">← Lecciones</a></p>
    <span class="tag">Lección ${l.numero}</span>
    <h1>${esc(l.titulo)} ${l.tituloChino && showHanzi() ? `<span class="hz">${esc(l.tituloChino)}</span>` : ''}</h1>
    ${l.resumen ? `<p class="sub">${esc(l.resumen)}</p>` : ''}
    <h2>Actividades</h2>
    <p class="note">Escucha, lee el pinyin y habla. Los caracteres chinos se pueden mostrar con el botón 汉字 de arriba.</p>
    <div class="acts">
      ${(l.vocabulario || []).length ? `<a class="act" href="#/l/${id}/flash"><div class="ico">🃏</div><div class="name">Flashcards</div><div class="score">${sc('flash')}</div></a>` : ''}
      ${tipos.map((t) => `<a class="act" href="#/l/${id}/a/${t}"><div class="ico">${ACTIVIDADES[t].ico}</div>
        <div class="name">${ACTIVIDADES[t].nombre}</div><div class="score">${sc(t)}</div></a>`).join('')}
      ${tipos.length ? `<a class="act exam" href="#/l/${id}/examen"><div class="ico">🏆</div><div class="name">Examen de la lección</div>
        <div class="score">${p.aprobado ? `Aprobado · mejor nota ${p.mejorExamen}%` : p.intentos ? `Mejor nota ${p.mejorExamen}% · necesitas ${NOTA_APROBADO}%` : `Necesitas ${NOTA_APROBADO}% para pasar a la siguiente lección`}</div></a>` : ''}
    </div>
    ${material(l)}`;
  bindSpeak();
}

function vocabRow(v, frase = false) {
  return `<div class="vocab${frase ? ' frase' : ''}">
    <div class="grow"><div class="py">${esc(v.pinyin || '')}</div><div class="es">${esc(v.es)}${v.nota ? ` · <i>${esc(v.nota)}</i>` : ''}</div>${hzLine(v.hanzi)}</div>
    ${canSpeak() ? `<button class="speak" data-say="${esc(v.hanzi)}" aria-label="Escuchar">🔊</button>` : ''}
  </div>`;
}

function material(l) {
  let h = '';
  if ((l.vocabulario || []).length) h += `<h2>Vocabulario</h2><div class="card">${l.vocabulario.map(vocabRow).join('')}</div>`;
  if ((l.frases || []).length) h += `<h2>Frases</h2><div class="card">${l.frases.map((f) => vocabRow(f, true)).join('')}</div>`;
  if ((l.gramatica || []).length) {
    h += `<h2>Gramática</h2>${l.gramatica.map((g) => `<div class="card grammar"><h3>${esc(g.titulo)}</h3>
      ${g.explicacion ? `<p>${esc(g.explicacion)}</p>` : ''}
      ${(g.ejemplos || []).map((e) => `<div class="ex"><b class="py">${esc(e.pinyin || '')}</b> ${canSpeak() ? `<button class="speak" style="width:30px;height:30px;font-size:14px" data-say="${esc(e.hanzi)}">🔊</button>` : ''}<br>
        ${esc(e.es || '')}${hzLine(e.hanzi)}</div>`).join('')}</div>`).join('')}`;
  }
  if (l.notas) h += `<h2>Notas</h2><div class="card"><p style="margin:0;white-space:pre-line">${esc(l.notas)}</p></div>`;
  return h;
}

function bindSpeak() {
  app.querySelectorAll('[data-say]').forEach((b) => { if (b.dataset.say) b.onclick = () => speak(b.dataset.say); });
}

function viewFlash(id) {
  const i = lessonIndex(id);
  const l = lessons[i];
  if (!l || !isUnlocked(i)) return notFound();
  let cards = shuffle(l.vocabulario || []);
  const total = cards.length;
  let known = 0;
  const repeat = [];
  let k = 0;
  const draw = () => {
    if (k >= cards.length) {
      if (repeat.length) { cards = shuffle(repeat.splice(0)); k = 0; return draw(); }
      const pct = Math.round((known / total) * 100);
      store.recordActivity(id, 'flash', pct);
      app.innerHTML = `<div class="result pass"><div style="font-size:48px">🎉</div><h2>¡Repaso terminado!</h2>
        <p class="sub">Sabías ${known} de ${total} a la primera.</p></div>
        <div class="row"><a class="btn secondary" href="#/l/${id}">Volver</a><button class="btn" id="again">Otra vez</button></div>`;
      app.querySelector('#again').onclick = () => viewFlash(id);
      return;
    }
    const c = cards[k];
    app.innerHTML = `
      <div class="progress-top"><a href="#/l/${id}" class="note" style="text-decoration:none;font-size:20px">✕</a>
        <div class="bar"><span style="width:${(k / cards.length) * 100}%"></span></div><span class="note">${k + 1}/${cards.length}</span></div>
      <div class="flash" id="card"><div class="flash-inner">
        <div class="face"><div class="bigpy">${esc(c.pinyin || '')}</div>${hzLine(c.hanzi)}
          ${canSpeak() ? '<button class="speak big-speak" id="say" aria-label="Escuchar">🔊</button>' : ''}
          <div class="note">¿Qué significa? Toca la tarjeta para girarla</div></div>
        <div class="face back"><div style="font-size:26px;font-weight:600">${esc(c.es)}</div>
          <div class="py" style="color:var(--red);font-weight:700;font-size:20px;margin-top:8px">${esc(c.pinyin || '')}</div>${hzLine(c.hanzi)}</div>
      </div></div>
      <div class="row"><button class="btn secondary" id="no">No lo sé</button><button class="btn" id="yes">Lo sé</button></div>`;
    const card = app.querySelector('#card');
    card.onclick = () => { card.classList.toggle('flipped'); if (card.classList.contains('flipped')) speak(c.hanzi); };
    const say = app.querySelector('#say');
    if (say) say.onclick = (e) => { e.stopPropagation(); speak(c.hanzi); };
    setTimeout(() => speak(c.hanzi), 250);
    app.querySelector('#yes').onclick = () => { if (!c._fallo) known++; k++; draw(); };
    app.querySelector('#no').onclick = () => { c._fallo = true; repeat.push(c); k++; draw(); };
  };
  cards.forEach((c) => delete c._fallo);
  draw();
}

function viewActivity(id, tipo) {
  const i = lessonIndex(id);
  const l = lessons[i];
  if (!l || !isUnlocked(i) || !ACTIVIDADES[tipo]) return notFound();
  const qs = buildQuestions(tipo, l, poolUpTo(i), 10);
  runQuiz(app, qs, async (r) => {
    await store.recordActivity(id, tipo, r.pct);
    showResult(id, r, { again: () => viewActivity(id, tipo), title: ACTIVIDADES[tipo].nombre });
  }, { title: ACTIVIDADES[tipo].nombre });
}

function viewExam(id) {
  const i = lessonIndex(id);
  const l = lessons[i];
  if (!l || !isUnlocked(i)) return notFound();
  const yaAprobada = prog(id).aprobado;
  const qs = buildExam(l, poolUpTo(i), 15);
  runQuiz(app, qs, async (r) => {
    const pass = r.pct >= NOTA_APROBADO;
    await store.recordExam(id, r.pct, pass);
    const sig = lessons[i + 1];
    showResult(id, r, {
      exam: true, pass,
      again: () => viewExam(id),
      extra: pass && sig && !yaAprobada ? `<p>🔓 Has desbloqueado la lección ${sig.numero}: <b>${esc(sig.titulo)}</b></p>` : '',
      nextHref: pass && sig ? `#/l/${sig.id}` : null,
    });
  }, { title: 'Examen' });
}

function showResult(id, r, { exam = false, pass = r.pct >= NOTA_APROBADO, again, extra = '', nextHref = null } = {}) {
  const uniq = [...new Map(r.mistakes.map((m) => [m.hanzi, m])).values()];
  app.innerHTML = `
    <div class="result ${pass ? 'pass' : 'fail'}">
      <div class="pct">${r.pct}%</div>
      <p>${r.correct} de ${r.total} correctas</p>
      ${exam ? (pass ? '<h2>¡Examen aprobado! Tài bàng le!</h2>' : `<h2>Casi… necesitas ${NOTA_APROBADO}%</h2><p class="sub">Repasa los fallos y vuelve a intentarlo.</p>`) : ''}
      ${extra}
    </div>
    ${uniq.length ? `<h2>Para repasar</h2><div class="card mistakes">${uniq.map(vocabRow).join('')}</div>` : ''}
    <div class="row" style="margin-top:12px">
      <a class="btn secondary" href="#/l/${id}">Volver a la lección</a>
      <button class="btn ${nextHref ? 'secondary' : ''}" id="again">Repetir</button>
      ${nextHref ? `<a class="btn" href="${nextHref}">Siguiente lección →</a>` : ''}
    </div>`;
  app.querySelector('#again').onclick = again;
  bindSpeak();
}

function notFound() {
  app.innerHTML = '<p>No se ha encontrado esta página.</p><a class="btn" href="#/">Ir al inicio</a>';
}

// ---------- Router ----------
function route() {
  window.speechSynthesis?.cancel();
  renderUserBox();
  if (!store.getUser()) return viewLogin();
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  window.scrollTo(0, 0);
  if (!parts.length) return viewHome();
  if (parts[0] === 'l' && parts[1]) {
    if (!parts[2]) return viewLesson(parts[1]);
    if (parts[2] === 'flash') return viewFlash(parts[1]);
    if (parts[2] === 'examen') return viewExam(parts[1]);
    if (parts[2] === 'a' && parts[3]) return viewActivity(parts[1], parts[3]);
  }
  notFound();
}

async function start() {
  try {
    await Promise.all([store.init(), loadLessons()]);
  } catch (e) {
    console.error(e);
    app.innerHTML = '<p class="error">No se ha podido cargar la app. Revisa tu conexión y recarga la página.</p>';
    return;
  }
  store.onAuthChange(() => { location.hash = '#/'; route(); });
  window.addEventListener('hashchange', route);
  route();
}
start();
