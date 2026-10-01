// Capa de datos: Firebase (Auth Google + Firestore en tiempo real) o modo demo local.
import { firebaseConfig } from './firebase-config.js';

const FB = 'https://www.gstatic.com/firebasejs/10.12.2/';
const listeners = new Set();
export const state = {
  ready: false, user: null, authError: null,
  config: null, conceptos: [], meses: {}, movimientos: [], deudas: [], novedades: [], perfil: null,
};
const emit = () => listeners.forEach((fn) => fn(state));
export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

const DEMO = new URLSearchParams(location.search).has('demo');
let api = null; // implementación activa

// ---------- utilidades ----------
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const nombreCorto = (u) => (u?.displayName || u?.email || '').split(' ')[0];

// ---------- Modo demo (pruebas locales) ----------
async function initDemo() {
  const seed = await fetch('local/seed.json').then((r) => r.json());
  const mem = {
    config: seed.config,
    conceptos: seed.conceptos,
    meses: seed.meses,
    movimientos: seed.movimientos.map((m) => ({ id: uid(), ts: Date.now(), ...m })),
    deudas: seed.deudas,
    novedades: [{ id: uid(), autor: 'angye', nombre: 'Angye', texto: 'registró $85.000 en Mercado / Alimentación', ts: Date.now() - 3600e3 }],
  };
  const sync = () => { Object.assign(state, structuredClone(mem)); emit(); };
  state.user = { uid: 'demo', email: 'demo@local', displayName: 'Daniel Demo' };
  state.perfil = { vistoHasta: 0 };
  const upsert = (arr, id, data) => { const i = arr.findIndex((x) => x.id === id); i >= 0 ? (arr[i] = { ...arr[i], ...data }) : arr.push({ id, ...data }); };
  api = {
    setMes: async (ym, patch) => { mem.meses[ym] = deepMerge(mem.meses[ym] || { plan: {}, ingresos: {}, extraPlan: 0 }, patch); sync(); },
    replaceMesPlan: async (ym, plan) => { mem.meses[ym] = { ...(mem.meses[ym] || { ingresos: {}, extraPlan: 0 }), plan }; sync(); },
    saveMov: async (m) => { const id = m.id || uid(); upsert(mem.movimientos, id, { ...m, id, ts: m.ts || Date.now() }); sync(); return id; },
    delMov: async (id) => { mem.movimientos = mem.movimientos.filter((x) => x.id !== id); sync(); },
    saveConcepto: async (c) => { const id = c.id || uid(); upsert(mem.conceptos, id, c); sync(); return id; },
    saveDeuda: async (d) => { const id = d.id || uid(); upsert(mem.deudas, id, d); sync(); return id; },
    delDeuda: async (id) => { mem.deudas = mem.deudas.filter((x) => x.id !== id); sync(); },
    saveConfig: async (patch) => { mem.config = { ...mem.config, ...patch }; sync(); },
    novedad: async (texto) => { mem.novedades.unshift({ id: uid(), autor: 'demo', nombre: 'Daniel', texto, ts: Date.now() }); sync(); },
    marcarVisto: async () => { state.perfil = { vistoHasta: Date.now() }; emit(); },
    login: async () => {}, logout: async () => location.reload(),
  };
  state.ready = true; sync();
}

function deepMerge(a, b) {
  const out = { ...a };
  for (const k in b) out[k] = b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) ? deepMerge(a?.[k] || {}, b[k]) : b[k];
  return out;
}

// ---------- Firebase ----------
async function initFirebase() {
  const [{ initializeApp }, A, F] = await Promise.all([
    import(FB + 'firebase-app.js'), import(FB + 'firebase-auth.js'), import(FB + 'firebase-firestore.js'),
  ]);
  const app = initializeApp(firebaseConfig);
  const auth = A.getAuth(app);
  const db = F.initializeFirestore(app, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) });
  const H = 'hogar/principal';
  const col = (n) => F.collection(db, `${H}/${n}`);
  const docu = (n, id) => F.doc(db, `${H}/${n}/${id}`);
  const cfgRef = F.doc(db, H);
  let unsubs = [];

  const novedad = async (texto) => {
    const u = auth.currentUser;
    await F.addDoc(col('novedades'), { autor: u.uid, nombre: nombreCorto(u), texto, ts: Date.now() });
  };

  api = {
    setMes: (ym, patch) => F.setDoc(docu('meses', ym), patch, { merge: true }),
    replaceMesPlan: (ym, plan) => F.updateDoc(docu('meses', ym), { plan }).catch(() => F.setDoc(docu('meses', ym), { plan }, { merge: true })),
    saveMov: async (m) => {
      const id = m.id || F.doc(col('movimientos')).id;
      const { id: _, ...data } = m;
      await F.setDoc(docu('movimientos', id), { ...data, ts: data.ts || Date.now(), autor: data.autor || nombreCorto(auth.currentUser) }, { merge: true });
      return id;
    },
    delMov: (id) => F.deleteDoc(docu('movimientos', id)),
    saveConcepto: async (c) => { const id = c.id || F.doc(col('conceptos')).id; const { id: _, ...d } = c; await F.setDoc(docu('conceptos', id), d, { merge: true }); return id; },
    saveDeuda: async (d) => { const id = d.id || F.doc(col('deudas')).id; const { id: _, ...x } = d; await F.setDoc(docu('deudas', id), x, { merge: true }); return id; },
    delDeuda: (id) => F.deleteDoc(docu('deudas', id)),
    saveConfig: (patch) => F.setDoc(cfgRef, patch, { merge: true }),
    novedad,
    marcarVisto: () => F.setDoc(F.doc(db, `${H}/usuarios/${auth.currentUser.uid}`), { vistoHasta: Date.now(), email: auth.currentUser.email }, { merge: true }),
    login: async () => {
      const p = new A.GoogleAuthProvider();
      p.setCustomParameters({ prompt: 'select_account' });
      try { await A.signInWithPopup(auth, p); } catch (e) { if (String(e.code).includes('popup')) await A.signInWithRedirect(auth, p); else throw e; }
    },
    logout: () => A.signOut(auth),
    // Carga inicial de datos (solo si la base está vacía). Se usa una única vez.
    importar: async (seed) => {
      const snap = await F.getDoc(cfgRef);
      if (snap.exists() && snap.data().importado) throw new Error('La base ya tiene datos importados');
      const ops = [];
      ops.push([cfgRef, { ...seed.config, importado: Date.now() }]);
      seed.conceptos.forEach(({ id, ...c }) => ops.push([docu('conceptos', id), c]));
      Object.entries(seed.meses).forEach(([ym, m]) => ops.push([docu('meses', ym), m]));
      seed.deudas.forEach(({ id, ...d }) => ops.push([docu('deudas', id), d]));
      seed.movimientos.forEach((m) => ops.push([F.doc(col('movimientos')), { ...m, ts: Date.now() }]));
      for (let i = 0; i < ops.length; i += 400) {
        const b = F.writeBatch(db);
        ops.slice(i, i + 400).forEach(([r, d]) => b.set(r, d));
        await b.commit();
      }
      return ops.length;
    },
  };
  window.__nido = api;

  await A.getRedirectResult(auth).catch((e) => { state.authError = e.message; });
  A.onAuthStateChanged(auth, (u) => {
    unsubs.forEach((f) => f()); unsubs = [];
    state.user = u; state.authError = null;
    if (!u) { state.ready = true; emit(); return; }
    state.ready = false; emit(); // esperar los datos antes de mostrar pantallas
    const fail = (e) => {
      state.authError = e.code === 'permission-denied'
        ? `La cuenta ${u.email} no tiene acceso a Nido.` : e.message;
      state.ready = true;
      emit();
    };
    let pending = 4;
    const done = () => { if (--pending <= 0) { state.ready = true; } emit(); };
    unsubs.push(F.onSnapshot(cfgRef, (s) => { state.config = s.data() || null; done(); }, fail));
    unsubs.push(F.onSnapshot(col('conceptos'), (s) => { state.conceptos = s.docs.map((d) => ({ id: d.id, ...d.data() })); done(); }, fail));
    unsubs.push(F.onSnapshot(col('meses'), (s) => { const o = {}; s.docs.forEach((d) => (o[d.id] = d.data())); state.meses = o; done(); }, fail));
    unsubs.push(F.onSnapshot(col('movimientos'), (s) => { state.movimientos = s.docs.map((d) => ({ id: d.id, ...d.data() })); done(); }, fail));
    unsubs.push(F.onSnapshot(col('deudas'), (s) => { state.deudas = s.docs.map((d) => ({ id: d.id, ...d.data() })); emit(); }, fail));
    unsubs.push(F.onSnapshot(F.query(col('novedades'), F.orderBy('ts', 'desc'), F.limit(60)), (s) => { state.novedades = s.docs.map((d) => ({ id: d.id, ...d.data() })); emit(); }, fail));
    unsubs.push(F.onSnapshot(F.doc(db, `${H}/usuarios/${u.uid}`), (s) => { state.perfil = s.data() || { vistoHasta: 0 }; emit(); }, () => {}));
  });
}

export async function init() {
  try { DEMO ? await initDemo() : await initFirebase(); }
  catch (e) { state.authError = 'No se pudo conectar: ' + e.message; state.ready = true; emit(); }
}

// Proxy para que la UI use siempre api.x()
export const db = new Proxy({}, { get: (_, k) => (...a) => api[k](...a) });
