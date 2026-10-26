// Guarda usuarios y progreso. Usa Firebase si está configurado;
// si no, guarda en localStorage (solo en este dispositivo).
import { firebaseConfig } from '../firebase-config.js?v=3';

const FB = 'https://www.gstatic.com/firebasejs/10.12.2';

let mode = 'local';
let fb = null;          // { auth, db, mod: {...} }
let currentUser = null; // { id, name }
let progress = {};      // { [lessonId]: { aprobado, mejorExamen, intentos, actividades: { [tipo]: mejor } } }
const listeners = new Set();

export const isCloud = () => mode === 'cloud';
export const getUser = () => currentUser;
export const getProgress = () => progress;
export const onAuthChange = (fn) => listeners.add(fn);
const emit = () => listeners.forEach((fn) => fn(currentUser));

function safeGet(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function safeSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* sin almacenamiento */ }
}

export async function init() {
  if (firebaseConfig) {
    const [app, auth, fs] = await Promise.all([
      import(`${FB}/firebase-app.js`),
      import(`${FB}/firebase-auth.js`),
      import(`${FB}/firebase-firestore.js`),
    ]);
    const fapp = app.initializeApp(firebaseConfig);
    fb = { auth: auth.getAuth(fapp), db: fs.getFirestore(fapp), a: auth, f: fs };
    mode = 'cloud';
    await new Promise((resolve) => {
      let first = true;
      auth.onAuthStateChanged(fb.auth, async (u) => {
        if (u) {
          let data = {};
          try {
            const snap = await fs.getDoc(fs.doc(fb.db, 'usuarios', u.uid));
            data = snap.exists() ? snap.data() : {};
          } catch (e) { console.error(e); }
          currentUser = { id: u.uid, name: data.nombre || u.displayName || u.email.split('@')[0], email: u.email };
          progress = data.progreso || {};
        } else {
          currentUser = null;
          progress = {};
        }
        if (first) { first = false; resolve(); } else emit();
      });
    });
  } else {
    const last = safeGet('chino.usuarioActual', null);
    if (last) loginLocal(last, false);
  }
}

// ---- Modo local ----
export const localProfiles = () => safeGet('chino.perfiles', []);

export function loginLocal(name, notify = true) {
  name = name.trim();
  if (!name) return;
  const perfiles = localProfiles();
  if (!perfiles.includes(name)) safeSet('chino.perfiles', [...perfiles, name]);
  safeSet('chino.usuarioActual', name);
  currentUser = { id: name, name };
  progress = safeGet(`chino.progreso.${name}`, {});
  if (notify) emit();
}

// ---- Modo nube ----
export async function register(name, email, password) {
  const cred = await fb.a.createUserWithEmailAndPassword(fb.auth, email, password);
  await fb.a.updateProfile(cred.user, { displayName: name });
  currentUser = { id: cred.user.uid, name, email };
  progress = {};
  await fb.f.setDoc(fb.f.doc(fb.db, 'usuarios', cred.user.uid), { nombre: name, progreso: {} });
  emit();
}

export async function login(email, password) {
  await fb.a.signInWithEmailAndPassword(fb.auth, email, password);
}

export async function resetPassword(email) {
  await fb.a.sendPasswordResetEmail(fb.auth, email);
}

export async function logout() {
  if (mode === 'cloud') {
    await fb.a.signOut(fb.auth);
  } else {
    try { localStorage.removeItem('chino.usuarioActual'); } catch { /* nada */ }
    currentUser = null;
    progress = {};
    emit();
  }
}

// ---- Progreso ----
async function save() {
  if (!currentUser) return;
  if (mode === 'cloud') {
    await fb.f.setDoc(fb.f.doc(fb.db, 'usuarios', currentUser.id),
      { nombre: currentUser.name, progreso: progress, actualizado: fb.f.serverTimestamp() },
      { merge: true });
  } else {
    safeSet(`chino.progreso.${currentUser.id}`, progress);
  }
}

const entry = (lessonId) => (progress[lessonId] ??= { aprobado: false, mejorExamen: 0, intentos: 0, actividades: {} });

export async function recordActivity(lessonId, tipo, pct) {
  const e = entry(lessonId);
  e.actividades[tipo] = Math.max(e.actividades[tipo] || 0, pct);
  e.ultimaVez = new Date().toISOString();
  await save();
}

export async function recordExam(lessonId, pct, aprobado) {
  const e = entry(lessonId);
  e.intentos += 1;
  e.mejorExamen = Math.max(e.mejorExamen, pct);
  e.aprobado = e.aprobado || aprobado;
  e.ultimaVez = new Date().toISOString();
  (e.historial ??= []).push({ fecha: e.ultimaVez, nota: pct });
  if (e.historial.length > 20) e.historial = e.historial.slice(-20);
  await save();
}
