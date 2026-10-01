// Datos de demostración para el emulador de Firestore (proyecto demo-acicale). NUNCA toca el proyecto real.
//
// Uso (con los emuladores corriendo, p. ej. `npm run demo` en otra terminal):
//   npm run demo:sembrar
//
// Borra lo que haya en el emulador y crea: ajustes de cursos, servicios, barberos y ~5 semanas de citas.
// Escribe por la API REST del emulador como "owner", así no depende de las reglas ni de firebase-admin.
//
// No deja usuarios de prueba: en la demo se inicia sesión con Google real. La cuenta adminEmail
// de la config queda como admin la primera vez que entra.

const PROYECTO = 'demo-acicale';
const EMULADOR = 'http://127.0.0.1:8080';
const RAIZ = `projects/${PROYECTO}/databases/(default)/documents`;

/** Convierte un valor de JS al formato de la API REST de Firestore. */
function valor(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(valor) } };
  return { mapValue: { fields: campos(v) } };
}
const campos = objeto => Object.fromEntries(Object.entries(objeto).map(([k, v]) => [k, valor(v)]));

/** Escribe los documentos en lotes (ruta relativa → datos). */
async function escribir(documentos) {
  const escrituras = Object.entries(documentos).map(([ruta, datos]) => ({ update: { name: `${RAIZ}/${ruta}`, fields: campos(datos) } }));
  for (let i = 0; i < escrituras.length; i += 400) {
    const r = await fetch(`${EMULADOR}/v1/${RAIZ}:commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
      body: JSON.stringify({ writes: escrituras.slice(i, i + 400) }),
    });
    if (!r.ok) throw new Error(`Firestore respondió ${r.status}: ${await r.text()}`);
  }
}

const SERVICIOS = [
  { nombre: 'Acicale sencillo', descripcion: 'Corte sencillo con asesoría o guía personalizada.', duracionMinutos: 40, precio: 30000, categoria: 'Cortes', destacado: true, icono: 'tijeras' },
  { nombre: 'Barba2', descripcion: 'Corte sencillo más barba, con asesoría o guía personalizada.', duracionMinutos: 60, precio: 40000, categoria: 'Cortes', destacado: true, icono: 'barba' },
  { nombre: 'Acicale Premium', descripcion: 'Un servicio completo, con asesoría personalizada.', duracionMinutos: 60, precio: 60000, categoria: 'Cortes', destacado: true, icono: 'diamante' },
  { nombre: 'Total color', descripcion: 'Trabajo de colorimetría global de un solo tono.', duracionMinutos: 300, precio: 300000, precioDesde: true, categoria: 'Color cabello', destacado: false, icono: 'color' },
];

// ---------------------------------------------------------------------------

async function main() {
  // Borra todo lo del proyecto de demo.
  const r = await fetch(`${EMULADOR}/emulator/v1/${RAIZ}`, { method: 'DELETE' });
  if (!r.ok) throw new Error(`No se pudo limpiar el emulador (${r.status})`);

  const documentos = {
    'ajustes/sitio': {
      cursos: {
        activo: true, url: 'https://www.instagram.com/josejulian_barbero', titulo: 'Aprende barbería con Jose Julian', textoBoton: 'Ver cursos',
        descripcion: 'Cursos para barberos que quieren subir de nivel: técnica, visagismo, color y cómo convertir tu talento en negocio.',
      },
    },
    'barberos/JoseJulian': { nombre: 'Jose Julian', especialidad: 'CEO & Barbero', avatar: 'jjulian.jpg', emailAsociado: 'jjulian.demo@example.com' },
    'barberos/Trip': { nombre: 'Juan Sebastián "Trip"', especialidad: 'Barbero', avatar: 'triip.jpg', emailAsociado: 'trip.demo@example.com', comision: 50 },
  };
  SERVICIOS.forEach((s, i) => documentos[`servicios/S${i + 1}`] = s);
  const citas = generarCitas(documentos);
  await escribir(documentos);

  console.log('Demo lista:');
  console.log(`  4 servicios, 2 barberos, ${citas} citas de ejemplo (cortes hechos, agenda de hoy y próximas)`);
  console.log('  Inicia sesión con tu cuenta de Google: la de adminEmail entra como admin.');
}

// ---------------------------------------------------------------------------
// Citas de ejemplo: ~5 semanas de cortes hechos, la agenda de hoy y las próximas.
// ---------------------------------------------------------------------------
const CLIENTES = ['Mateo Rincón', 'Samuel Ospina', 'Daniel Cárdenas', 'Nicolás Vélez', 'Santiago Mejía', 'Tomás Arango',
  'Juan Pablo Gil', 'Emiliano Rojas', 'Sebastián Duque', 'Martín Salazar', 'Julián Cortés', 'Andrés Quintero'];
const BARBEROS = [['JoseJulian', 'Jose Julian'], ['Trip', 'Juan Sebastián "Trip"']];
const clave = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hora12 = m => `${((Math.floor(m / 60) + 11) % 12) + 1}:${String(m % 60).padStart(2, '0')} ${m < 720 ? 'AM' : 'PM'}`;
const hhmm = m => `${String(Math.floor(m / 60)).padStart(2, '0')}${String(m % 60).padStart(2, '0')}`;

/** Agrega las citas (y los turnos que ocupan) a `documentos`. Devuelve cuántas creó. */
function generarCitas(documentos) {
  // Generador pseudoaleatorio fijo: la demo sale igual cada vez.
  let semilla = 7;
  const azar = () => ((semilla = (semilla * 16807) % 2147483647) / 2147483647);
  const hoy = new Date();
  const ahoraMin = hoy.getHours() * 60 + hoy.getMinutes();
  let n = 0;

  for (let dias = -35; dias <= 6; dias++) {
    const fecha = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + dias);
    if (fecha.getDay() === 0) continue; // Domingo cerrado
    const dia = clave(fecha);
    for (const [barberoId, barberoNombre] of BARBEROS) {
      const ocupadas = new Set();
      const cantidad = dias > 0 ? 1 + Math.floor(azar() * 2) : 2 + Math.floor(azar() * 3);
      for (let k = 0; k < cantidad; k++) {
        const servicio = SERVICIOS[Math.min(SERVICIOS.length - 1, Math.floor(azar() * (azar() < 0.93 ? 3 : 4)))];
        const duracion = servicio.duracionMinutos > 90 ? 90 : servicio.duracionMinutos;
        const inicio = 600 + Math.floor(azar() * 16) * 30; // 10:00 a 17:30
        const bloques = Array.from({ length: Math.ceil(duracion / 30) }, (_, i) => inicio + i * 30);
        if (bloques.some(b => ocupadas.has(b) || b >= 1200)) continue;
        bloques.forEach(b => ocupadas.add(b));

        const pasada = dias < 0 || (dias === 0 && inicio + duracion <= ahoraMin);
        const estado = pasada ? (azar() < 0.9 ? 'completada' : 'no-asistio') : (azar() < 0.5 ? 'confirmada' : 'pendiente');
        const id = `demo${String(++n).padStart(4, '0')}`;
        const cita = {
          userId: `cliente-demo-${1 + Math.floor(azar() * CLIENTES.length)}`,
          userName: CLIENTES[Math.floor(azar() * CLIENTES.length)],
          userEmail: '', phone: `3${Math.floor(100000000 + azar() * 899999999)}`,
          servicioId: `S${SERVICIOS.indexOf(servicio) + 1}`, serviceName: servicio.nombre,
          precio: servicio.precio, duracionMinutos: duracion,
          barberoId, barberoNombre,
          fecha: new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate(), Math.floor(inicio / 60), inicio % 60).toISOString(),
          dia, hora: `${hhmm(inicio).slice(0, 2)}:${hhmm(inicio).slice(2)}`, horaStr: hora12(inicio),
          // Reservada días antes (nunca en el futuro: si no, el admin la vería como "nueva").
          estado, creadoEn: new Date(Math.min(fecha.getTime() - 3 * 86400000, Date.now() - 3600000)).toISOString(),
          slotIds: [],
        };
        // A veces se cobra distinto (adicionales, color "Desde").
        if (estado === 'completada' && azar() < 0.15) cita.precioFinal = servicio.precio + 5000 * (1 + Math.floor(azar() * 3));
        if (estado === 'pendiente' || estado === 'confirmada') {
          cita.slotIds = bloques.map(b => `${barberoId}_${dia}_${hhmm(b)}`);
          bloques.forEach((b, i) => documentos[`slots/${cita.slotIds[i]}`] = { barberoId, dia, hora: hhmm(b), citaId: id });
        }
        documentos[`citas/${id}`] = cita;
      }
    }
  }
  return n;
}

main().then(() => process.exit(0)).catch(error => {
  console.error('No se pudo sembrar la demo:', error.message);
  console.error('¿Está corriendo el emulador de Firestore? (npm run demo)');
  process.exit(1);
});
