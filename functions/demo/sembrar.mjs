// Datos de demostración para los emuladores (proyecto demo-acicale). NUNCA toca el proyecto real.
//
// Uso (con los emuladores corriendo, p. ej. `npm run demo` en otra terminal):
//   npm run demo:sembrar
//
// Borra lo que haya en los emuladores y crea: catálogo con inventario, ajustes, servicios,
// barberos y pedidos de ejemplo en varios estados. Los pedidos se crean con las Cloud Functions
// reales, así el inventario y su historial quedan coherentes.
//
// No deja usuarios de prueba: en la demo se inicia sesión con Google real. La cuenta adminEmail
// de la config queda como admin la primera vez que entra.
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const PROYECTO = 'demo-acicale';
const FIRESTORE = '127.0.0.1:8080';
const AUTH = 'http://127.0.0.1:9099';
const FUNCIONES = `http://127.0.0.1:5001/${PROYECTO}/us-central1`;

process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE;
initializeApp({ projectId: PROYECTO });
const db = getFirestore();
const ahora = () => new Date().toISOString();
const haceHoras = h => new Date(Date.now() - h * 3600_000).toISOString();

// ---------------------------------------------------------------------------
// Clientes de ejemplo: cuentas temporales del emulador de Auth, solo para hacer los pedidos.
// Se borran al final; en la demo el inicio de sesión es con Google real.
// ---------------------------------------------------------------------------
async function cuenta(nombre, email) {
  const idToken = JSON.stringify({ sub: email, email, email_verified: true, name: nombre });
  const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=demo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ postBody: `id_token=${encodeURIComponent(idToken)}&providerId=google.com`, requestUri: 'http://localhost', returnSecureToken: true }),
  });
  const datos = await r.json();
  if (!datos.localId) throw new Error('No se pudo crear la cuenta ' + email + ': ' + JSON.stringify(datos));
  return { uid: datos.localId, token: datos.idToken, nombre, email };
}

async function llamar(funcion, token, data) {
  const r = await fetch(`${FUNCIONES}/${funcion}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ data }),
  });
  const json = await r.json();
  if (json.error) throw new Error(`${funcion}: ${json.error.message}`);
  return json.result;
}

// ---------------------------------------------------------------------------
// Fotos de producto de prueba (SVG)
// ---------------------------------------------------------------------------
function foto(fondo, tapa, linea, forma = 'frasco') {
  const cuerpo = forma === 'tubo'
    ? `<rect x='220' y='120' width='160' height='360' rx='30' fill='#141414'/><rect x='240' y='80' width='120' height='60' rx='12' fill='${tapa}'/>`
    : forma === 'botella'
      ? `<rect x='200' y='190' width='200' height='290' rx='40' fill='#141414'/><rect x='260' y='120' width='80' height='80' rx='10' fill='#141414'/><rect x='250' y='90' width='100' height='44' rx='10' fill='${tapa}'/>`
      : forma === 'kit'
        ? `<rect x='110' y='250' width='380' height='230' rx='22' fill='#141414'/><rect x='150' y='180' width='90' height='90' rx='14' fill='${tapa}'/><rect x='270' y='150' width='70' height='120' rx='14' fill='#2a2a2a'/><rect x='365' y='200' width='90' height='70' rx='14' fill='${tapa}'/>`
        : `<rect x='150' y='260' width='300' height='210' rx='26' fill='#141414'/><rect x='140' y='205' width='320' height='72' rx='20' fill='${tapa}'/>`;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 600 600'><defs><radialGradient id='g' cx='50%' cy='38%' r='75%'><stop offset='0' stop-color='${fondo}'/><stop offset='1' stop-color='#0a0a0a'/></radialGradient></defs><rect width='600' height='600' fill='url(#g)'/><ellipse cx='300' cy='482' rx='175' ry='24' fill='#000' opacity='.45'/>${cuerpo}<text x='300' y='365' font-family='Georgia' font-size='34' font-weight='700' fill='#e7e7e7' text-anchor='middle' letter-spacing='7'>CACIQUE</text><text x='300' y='405' font-family='Arial' font-size='18' fill='#9a9a9a' text-anchor='middle' letter-spacing='4'>${linea}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const PRODUCTOS = [
  { id: 'CeraMateFijacion01', nombre: 'Cera Mate Fijación Fuerte', categoria: 'Ceras', precio: 38000, precioAntes: 45000, destacado: true, orden: 1,
    descripcion: 'Acabado natural sin brillo y fijación que dura todo el día. Ideal para texturizados y cortes con volumen.',
    imagen: foto('#5a5a5a', '#c8c8c8', 'MATTE WAX'), opciones: [{ nombre: '100 g', precio: 38000, stock: 12 }, { nombre: '150 g', precio: 52000, stock: 2 }] },
  { id: 'PolvoTexturizante01', nombre: 'Polvo Texturizante', categoria: 'Polvos texturizantes', precio: 32000, destacado: true, orden: 2, stock: 15,
    descripcion: 'Volumen instantáneo desde la raíz. Aplica sobre el cabello seco y moldea con los dedos.', imagen: foto('#3f3f46', '#a1a1aa', 'TEXTURE POWDER', 'botella') },
  { id: 'TalcoBarberia000001', nombre: 'Talco Profesional para Barbería', categoria: 'Talcos', precio: 18000, destacado: false, orden: 3,
    descripcion: 'Retira los cabellos cortados y calma la piel después del corte. Fragancia fresca.', imagen: foto('#52525b', '#e4e4e7', 'BARBER TALC', 'botella'),
    opciones: [{ nombre: '200 g', precio: 18000, stock: 8 }, { nombre: '400 g', precio: 30000, stock: 0 }] },
  { id: 'GelFijadorExtra0001', nombre: 'Gel Fijador Extra Fuerte', categoria: 'Geles', precio: 22000, destacado: false, orden: 4, stock: 3,
    descripcion: 'Fijación extrema con efecto húmedo. No deja residuos blancos.', imagen: foto('#27272a', '#d4d4d8', 'EXTRA HOLD GEL', 'tubo') },
  { id: 'AceiteBarba00000001', nombre: 'Aceite para Barba', categoria: 'Barba', precio: 35000, destacado: true, orden: 5, stock: 6,
    descripcion: 'Hidrata, suaviza y da brillo a la barba. Aroma amaderado.', imagen: foto('#44403c', '#d6d3d1', 'BEARD OIL', 'botella') },
  { id: 'PomadaBrillo0000001', nombre: 'Pomada Brillo Clásico', categoria: 'Ceras', precio: 36000, destacado: false, orden: 6, stock: 0,
    descripcion: 'Brillo medio y fijación flexible para peinados clásicos y pompadour.', imagen: foto('#57534e', '#a8a29e', 'POMADE') },
  { id: 'AftershaveBalsamo01', nombre: 'Bálsamo Aftershave', categoria: 'Cuidado facial', precio: 28000, destacado: false, orden: 7, stock: 9,
    descripcion: 'Refresca y calma la piel después del afeitado. Sin alcohol.', imagen: foto('#3f3f46', '#e4e4e7', 'AFTERSHAVE', 'tubo') },
  { id: 'KitAcicale00000001', nombre: 'Kit Acicale (cera + aceite + talco)', categoria: 'Kits', precio: 80000, precioAntes: 91000, destacado: true, orden: 8, stock: 4,
    descripcion: 'Todo lo que necesitas para mantener tu corte y tu barba en casa.', imagen: foto('#3a3a3a', '#d4d4d8', 'KIT ACICALE', 'kit') },
];

const SERVICIOS = [
  { nombre: 'Acicale sencillo', descripcion: 'Corte sencillo con asesoría o guía personalizada.', duracionMinutos: 40, precio: 30000, categoria: 'Cortes', destacado: true, icono: 'tijeras' },
  { nombre: 'Barba2', descripcion: 'Corte sencillo más barba, con asesoría o guía personalizada.', duracionMinutos: 60, precio: 40000, categoria: 'Cortes', destacado: true, icono: 'barba' },
  { nombre: 'Acicale Premium', descripcion: 'Un servicio completo, con asesoría personalizada.', duracionMinutos: 60, precio: 60000, categoria: 'Cortes', destacado: true, icono: 'diamante' },
  { nombre: 'Total color', descripcion: 'Trabajo de colorimetría global de un solo tono.', duracionMinutos: 300, precio: 300000, precioDesde: true, categoria: 'Color cabello', destacado: false, icono: 'color' },
];

// ---------------------------------------------------------------------------

async function main() {
  // Borra todo lo del proyecto de demo.
  await fetch(`http://${FIRESTORE}/emulator/v1/projects/${PROYECTO}/databases/(default)/documents`, { method: 'DELETE' });
  await fetch(`${AUTH}/emulator/v1/projects/${PROYECTO}/accounts`, { method: 'DELETE' });

  const carlos = await cuenta('Carlos Rodríguez', 'carlos.demo@example.com');
  const valentina = await cuenta('Valentina Gómez', 'valentina.demo@example.com');
  const andres = await cuenta('Andrés Martínez', 'andres.demo@example.com');

  const lote = db.batch();
  lote.set(db.doc('ajustes/sitio'), {
    tienda: {
      activa: true,
      entrega: { recoger: true, local: { activo: true, costo: 8000 }, nacional: { activo: true, costo: 15000 }, gratisDesde: 150000 },
      pagos: { enLinea: true, contraentrega: true, enTienda: true },
    },
    cursos: {
      activo: true, url: 'https://www.instagram.com/josejulian_barbero', titulo: 'Aprende barbería con Jose Julian', textoBoton: 'Ver cursos',
      descripcion: 'Cursos para barberos que quieren subir de nivel: técnica, visagismo, color y cómo convertir tu talento en negocio.',
    },
  });
  SERVICIOS.forEach((s, i) => lote.set(db.doc(`servicios/S${i + 1}`), s));
  lote.set(db.doc('barberos/JoseJulian'), { nombre: 'Jose Julian', especialidad: 'CEO & Barbero', avatar: 'jjulian.jpg', emailAsociado: 'jjulian.demo@example.com' });
  lote.set(db.doc('barberos/Trip'), { nombre: 'Juan Sebastián "Trip"', especialidad: 'Barbero', avatar: 'triip.jpg', emailAsociado: 'trip.demo@example.com', comision: 50 });

  for (const { id, stock, opciones, ...p } of PRODUCTOS) {
    const conOpciones = (opciones ?? []).map(o => ({ agotado: false, ...o }));
    lote.set(db.doc(`productos/${id}`), {
      marca: 'Cacique', visible: true, agotado: false, precioAntes: null, controlStock: true, ...p,
      stock: stock ?? 0, opciones: conOpciones,
    });
    const existencias = conOpciones.length ? conOpciones.map(o => [o.nombre, o.stock]) : [[null, stock ?? 0]];
    for (const [opcion, unidades] of existencias) {
      if (!unidades) continue;
      lote.set(db.collection('movimientosInventario').doc(), {
        productoId: id, producto: p.nombre, opcion, cantidad: unidades, stockResultante: unidades, tipo: 'entrada',
        nota: 'Inventario inicial', usuario: 'El Acicale', fecha: haceHoras(72),
      });
    }
  }
  await lote.commit();

  await sembrarCitas();

  // Pedidos por el camino real (Cloud Functions): precios, envío e inventario los pone el servidor.
  const cliente = (c, tel) => ({ nombre: c.nombre, telefono: tel, email: c.email, documento: '' });
  const enCali = { tipo: 'local', direccion: 'Cl. 70 Nte. # 5 - 20', barrio: 'Calima', ciudad: 'Cali', departamento: 'Valle del Cauca', notas: 'Llamar al llegar' };
  const recoger = { tipo: 'recoger', direccion: '', barrio: '', ciudad: '', departamento: '', notas: '' };
  const pedir = (c, tel, entrega, items, metodo) =>
    llamar('crearPedido', c.token, { cliente: cliente(c, tel), entrega, items, metodo, aceptaPolitica: true }).then(r => r.pedidoId);

  const p1 = await pedir(carlos, '3104567890', enCali,
    [{ productoId: 'CeraMateFijacion01', opcion: '150 g', cantidad: 1 }, { productoId: 'AceiteBarba00000001', opcion: null, cantidad: 1 }], 'contraentrega');
  const p2 = await pedir(valentina, '3157778899', recoger, [{ productoId: 'PolvoTexturizante01', opcion: null, cantidad: 2 }], 'en-tienda');
  const p3 = await pedir(andres, '3001112233',
    { tipo: 'nacional', direccion: 'Cra. 43A # 1 Sur - 100', barrio: 'El Poblado', ciudad: 'Medellín', departamento: 'Antioquia', notas: '' },
    [{ productoId: 'KitAcicale00000001', opcion: null, cantidad: 1 }], 'en-linea');
  await llamar('iniciarPagoWompi', andres.token, { pedidoId: p3, origen: 'http://localhost:4200' });
  await llamar('simularPagoWompi', andres.token, { pedidoId: p3, aprobar: true, medio: 'NEQUI' });
  const p4 = await pedir(carlos, '3104567890', recoger,
    [{ productoId: 'TalcoBarberia000001', opcion: '200 g', cantidad: 1 }, { productoId: 'GelFijadorExtra0001', opcion: null, cantidad: 2 }], 'en-tienda');
  const p5 = await pedir(valentina, '3157778899', enCali, [{ productoId: 'GelFijadorExtra0001', opcion: null, cantidad: 1 }], 'contraentrega');
  await llamar('cancelarPedido', valentina.token, { pedidoId: p5 });

  // Estados y fechas variadas para que el panel se vea con vida.
  await db.doc(`pedidos/${p1}`).update({ estado: 'enviado', creadoEn: haceHoras(26) });
  await db.doc(`pedidos/${p2}`).update({ estado: 'entregado', 'pago.estado': 'aprobado', creadoEn: haceHoras(50) });
  await db.doc(`pedidos/${p3}`).update({ creadoEn: haceHoras(5) });
  await db.doc(`pedidos/${p5}`).update({ creadoEn: haceHoras(3) });

  // Sin usuarios de prueba: se borran las cuentas temporales (y sus perfiles, si se crearon).
  await fetch(`${AUTH}/emulator/v1/projects/${PROYECTO}/accounts`, { method: 'DELETE' });
  const perfiles = await db.collection('usuarios').get();
  await Promise.all(perfiles.docs.map(d => d.ref.delete()));

  console.log('Demo lista:');
  console.log(`  ${PRODUCTOS.length} productos con inventario, 4 servicios, 2 barberos, 5 pedidos de ejemplo (uno cancelado)`);
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

async function sembrarCitas() {
  // Generador pseudoaleatorio fijo: la demo sale igual cada vez.
  let semilla = 7;
  const azar = () => ((semilla = (semilla * 16807) % 2147483647) / 2147483647);
  const lote = db.batch();
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
        let estado = pasada ? (azar() < 0.9 ? 'completada' : 'no-asistio') : (azar() < 0.5 ? 'confirmada' : 'pendiente');
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
          for (const [i, b] of bloques.entries()) {
            lote.set(db.doc(`slots/${cita.slotIds[i]}`), { barberoId, dia, hora: hhmm(b), citaId: id });
          }
        }
        lote.set(db.doc(`citas/${id}`), cita);
      }
    }
  }
  await lote.commit();
  console.log(`  ${n} citas de ejemplo (cortes hechos, agenda de hoy y próximas)`);
}

main().then(() => process.exit(0)).catch(error => {
  console.error('No se pudo sembrar la demo:', error.message);
  console.error('¿Están corriendo los emuladores? (npm run demo)');
  process.exit(1);
});
