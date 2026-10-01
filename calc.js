// Cálculos financieros: todo se deriva del estado, nada se guarda calculado.
export const ymOf = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
export const addMonths = (ym, n) => { const [y, m] = ym.split('-').map(Number); return ymOf(new Date(y, m - 1 + n, 1)); };
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const mesLargo = (ym) => { const [y, m] = ym.split('-').map(Number); return `${MESES[m - 1]} ${y}`; };
export const mesCorto = (ym) => { const [y, m] = ym.split('-').map(Number); return `${MESES[m - 1].slice(0, 3)} ${String(y).slice(2)}`; };

export const categorias = (s) => [...(s.config?.categorias || [])].sort((a, b) => a.orden - b.orden);
export const conceptosActivos = (s) => s.conceptos.filter((c) => c.activo !== false).sort((a, b) => (a.orden ?? 99) - (b.orden ?? 99));
export const concepto = (s, id) => s.conceptos.find((c) => c.id === id);

export function resumenMes(s, ym) {
  const mes = s.meses[ym] || { plan: {}, ingresos: {}, extraPlan: 0 };
  const movs = s.movimientos.filter((m) => m.mes === ym);
  const gastos = movs.filter((m) => m.tipo === 'gasto');
  const extras = movs.filter((m) => m.tipo === 'ingreso');
  const base = Object.values(mes.ingresos || {}).reduce((a, b) => a + (+b || 0), 0);
  const extraReal = extras.reduce((a, m) => a + m.monto, 0);
  const real = {}; gastos.forEach((m) => (real[m.conceptoId] = (real[m.conceptoId] || 0) + m.monto));
  const plan = mes.plan || {};
  const porCat = {};
  for (const cat of categorias(s)) porCat[cat.id] = { plan: 0, real: 0 };
  const ids = new Set([...Object.keys(plan), ...Object.keys(real)]);
  ids.forEach((id) => {
    const c = concepto(s, id); const k = c?.categoria || 'otros';
    porCat[k] ||= { plan: 0, real: 0 };
    porCat[k].plan += +plan[id] || 0; porCat[k].real += real[id] || 0;
  });
  const totalPlan = Object.values(plan).reduce((a, b) => a + (+b || 0), 0);
  const totalReal = gastos.reduce((a, m) => a + m.monto, 0);
  const ingresoPlan = base + (+mes.extraPlan || 0);
  const ingresoReal = base + extraReal;
  return { ym, mes, movs, gastos, extras, plan, real, porCat, totalPlan, totalReal, ingresoPlan, ingresoReal, extraReal,
    balancePlan: ingresoPlan - totalPlan, disponible: ingresoReal - totalReal };
}

// Promedio mensual de gasto esencial planeado (para metas del fondo)
export function esencialPromedio(s) {
  const ms = Object.values(s.meses); if (!ms.length) return 0;
  const tot = ms.reduce((a, m) => a + Object.entries(m.plan || {}).reduce((x, [id, v]) => x + (concepto(s, id)?.categoria === 'necesidad' ? +v || 0 : 0), 0), 0);
  return tot / ms.length;
}
export function ingresoPromedio(s) {
  const ms = Object.values(s.meses); if (!ms.length) return 0;
  return ms.reduce((a, m) => a + Object.values(m.ingresos || {}).reduce((x, v) => x + (+v || 0), 0) + (+m.extraPlan || 0), 0) / ms.length;
}

export function fondo(s) {
  const cid = s.config?.fondoConceptoId;
  const aportes = s.movimientos.filter((m) => m.tipo === 'gasto' && m.conceptoId === cid);
  const saldo = (+s.config?.fondoInicial || 0) + aportes.reduce((a, m) => a + m.monto, 0);
  const n2 = 3 * esencialPromedio(s);
  const niveles = [
    { nombre: 'Nivel 1 · Fondo semilla', meta: +s.config?.metaN1 || 0 },
    { nombre: 'Nivel 2 · 3 meses esenciales', meta: n2 },
    { nombre: 'Nivel 3 · 6 meses esenciales', meta: 2 * n2 },
  ].map((n) => ({ ...n, pct: n.meta ? Math.min(1, saldo / n.meta) : 0 }));
  const esencial = esencialPromedio(s);
  return { saldo, niveles, aportes, meses: esencial ? saldo / esencial : 0 };
}

export function deudas(s) {
  const lista = s.deudas.map((d) => {
    const pagos = s.movimientos.filter((m) => m.tipo === 'gasto' && m.conceptoId === d.conceptoId && m.fecha >= (d.fechaSaldo || '0000') && (!d.saldoTs || (m.ts || 0) > d.saldoTs));
    const pagado = pagos.reduce((a, m) => a + m.monto, 0);
    const saldo = Math.max(0, (+d.saldo || 0) - pagado);
    const original = +d.saldoOriginal || +d.saldo || 0;
    const interes = saldo * (+d.tasa || 0);
    return { ...d, pagado, saldoActual: saldo, pct: original ? 1 - saldo / original : 0, interes,
      mesesRestantes: d.cuota > interes && saldo ? Math.ceil(-Math.log(1 - (saldo * (d.tasa || 0)) / d.cuota) / Math.log(1 + (d.tasa || 0)) || saldo / d.cuota) : null };
  }).sort((a, b) => (b.tasa - a.tasa) || (b.saldoActual - a.saldoActual));
  const total = lista.reduce((a, d) => a + d.saldoActual, 0);
  const cuotas = lista.filter((d) => d.saldoActual > 0 || d.porConfirmar).reduce((a, d) => a + (+d.cuota || 0), 0);
  const ing = ingresoPromedio(s);
  const nivel = ing ? cuotas / ing : 0;
  const semaforo = nivel > 0.4 ? { txt: 'Crítico', cls: 'bad' } : nivel > 0.3 ? { txt: 'Alto', cls: 'warn' } : { txt: 'Saludable', cls: 'ok' };
  return { lista, total, cuotas, nivel, semaforo, interes: lista.reduce((a, d) => a + d.interes, 0) };
}

// Meses existentes (para selectores), extendiendo hasta 3 meses después de hoy
export function mesesDisponibles(s) {
  const set = new Set(Object.keys(s.meses));
  const hoy = ymOf();
  for (let i = -1; i <= 3; i++) set.add(addMonths(hoy, i));
  return [...set].sort();
}
