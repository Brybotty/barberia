# Barbería (El Acicale)

Página y sistema de reservas para barberías: reservas por barbero (sin obligar a iniciar sesión hasta confirmar),
agenda y disponibilidad de cada barbero, panel de administración, enlace a cursos y correos automáticos. Un mismo
código sirve a varios clientes (`src/app/config/clientes/`).

**Stack:** Angular 20 (standalone, SPA) · Firebase Auth (Google, correo y celular) · Cloud Firestore · Cloud Storage
(fotos del equipo) · Cloud Functions (correos con Resend) · Tailwind CSS 3.

## Desarrollo

```bash
npm install
npm start                # http://localhost:4200 (usa el Firebase real del cliente)
npm test                 # 59 pruebas de la app (Karma)
npm run test:reglas      # 241 pruebas de firestore.rules + 43 de storage.rules (emuladores, no toca datos reales)
npm run test:funciones   # 26 pruebas de los correos y del plan de las agendas recurrentes (functions/)
npm run test:recurrentes # 11 pruebas de las agendas recurrentes contra el emulador de Firestore
npm run build            # build de producción en dist/barberia/browser
```

En Windows, `firebase emulators:exec` suele dejar vivo el Java del emulador de Firestore en el puerto 8080: si la
siguiente corrida dice "port taken", ciérralo desde el Administrador de tareas (proceso `java`).

### Demo con datos de prueba (sin tocar datos reales)

```bash
npm run demo     # emuladores + la página en http://localhost:4200
```

- Usa los emuladores de Firebase (proyecto `demo-acicale`) con los datos de `demo-datos/`: servicios, dos barberos
  (uno con día libre y descanso), unas horas cerradas y ~5 semanas de citas. **Nunca toca el proyecto real.**
- Detén `npm start` antes: los dos usan el puerto 4200.
- Se cierra con **Ctrl+C** en su ventana; al cerrarse guarda en `demo-datos/` lo que cambiaste.
- Para volver a los datos originales, con la demo abierta: `npm run demo:sembrar`.
- **El inicio de sesión es con Google real**; solo los datos van a los emuladores. La cuenta `adminEmail` de la
  config entra como admin; cualquier otra cuenta entra como cliente. Para usar cuentas de prueba del emulador, pon
  `authEmulador: true` en `src/environments/environment.emulador.ts`.
- Datos del emulador: http://127.0.0.1:4000.

## Cómo reserva un cliente

1. **Sin iniciar sesión** elige barbero (o "Cualquier barbero"), servicio, día y hora. La disponibilidad es pública
   (solo dice qué medias horas están ocupadas, sin datos de nadie).
2. Al confirmar se le pide entrar: con Google ahí mismo, o con correo o celular en `/login` (al volver conserva lo
   que eligió). Escribe su celular (10 dígitos que empiezan por 3) y confirma.
3. En **Mis reservas** ve sus citas como "Agendada", puede **cambiar el horario** (servicios de hasta 1 h 20 min),
   cancelar, y **reservar de nuevo** una cita pasada con el mismo barbero y servicio.

**Turnos encadenados.** La agenda va al minuto, de 5 en 5, y los turnos se encadenan: en cada rato libre (desde que
abre, o desde que termina la cita, el cierre o el descanso de antes) va un turno cada **40 minutos** (`INTERVALO` en
`src/app/core/utils/horario.ts`) mientras el servicio quepa entero. Con el día vacío son los de siempre: con el horario
de El Acicale (9:20 de lunes a jueves, 9:00 viernes y sábado, cierre 7:40 p. m.), 9:20, 10:00, 10:40… hasta 6:40 p. m.,
y 9:00, 9:40, 10:20… hasta 7:00 p. m. Pero el turno siguiente entra justo cuando termina el anterior, sin tiempo
muerto: tras un Barba2 de 10:00 a 11:00 se ofrece las 11:00 (no las 11:20), y tras un cliente fijo de 10:00 a 10:30,
las 10:30. El horario por defecto está en `config/clientes/*.ts` (`apertura`, `cierre` y, si algún día abre a otra
hora, `aperturas`); el admin lo cambia en *Ajustes*.

Límites que hacen cumplir las reglas de Firestore (no solo la página):

- **Sin doble reserva:** cada barbero tiene un documento por día en `ocupacion`, con un mapa de 288 marcas (una por
  cada 5 minutos). Cada reserva aparta su rato en ese mapa en la misma escritura que crea la cita, y las reglas
  comprueban de un golpe que estuviera libre (sin importar cuánto dure). Las citas empiezan en cualquier múltiplo de 5
  minutos; las reglas no necesitan saber el horario.
- **Cupo:** 2 reservas activas por cliente y día (las reglas aceptan una tercera, que usa el cambio de horario).
- **Agenda:** solo los días que la barbería tiene abiertos (ver *Agenda de reservas*, abajo), y que ya tengan su
  documento de `ocupacion` (los prepara el panel del admin al abrirse y la Cloud Function cada noche, 62 días adelante).
  Cualquier servicio se reserva y se cambia de horario en línea, dure lo que dure.
- **Barbero:** no se puede reservar en su día libre, en su descanso, en las horas que cerró ni un servicio que el
  admin no tenga habilitado con él.

### Agenda de reservas

El admin decide hasta qué día se puede reservar, en **Ajustes → Agenda de reservas**:

- **Por periodos:** solo se reserva entre dos fechas (por ejemplo, del 1 al 16 de octubre). Cuando se acaban, la
  página dice "Agenda cerrada" hasta que el admin abra el siguiente periodo. Un periodo puede llegar hasta 60 días
  desde hoy, y con fechas que ya pasaron la agenda queda cerrada a propósito (vacaciones).
- **Siempre abierta** (así empieza): los próximos 14 días, sin hacer nada.

Con la agenda por periodos, el **Inicio** del panel muestra hasta cuándo está abierta (en rojo cuando faltan 3 días
o menos, o cuando ya cerró) y el botón **"Abrir 15 días más"**, que alarga el periodo desde su último día sin pasar
por Ajustes. El cliente ve "Agenda abierta hasta el…" en el calendario, en la sección *Visítanos* y en la hoja de
*Horario* del celular. Los cambios se ven al instante, sin publicar nada. Las citas que registra el admin y los
cierres de horas de los barberos no tienen este límite.

### En celular

Abajo queda fija una barra de accesos rápidos (`barra-inferior.component.ts`): **Servicios**, **Reservar**,
**Horario** (abre una hoja con "abierto ahora", la semana, hasta cuándo va la agenda y cómo llegar, sin sacar a nadie
de la reserva) y **WhatsApp** (o Instagram mientras la config no tenga `whatsapp`). Se quita sola mientras está el
aviso de cookies y en el paso de confirmar la reserva, que tiene su propia barra con el total. Con la sesión de un
admin o de un barbero aparece además **Panel**, en el centro y en dorado, que lleva a `/admin` o a `/barbero`.

El menú desplegable (el de las tres rayas) tiene fondo sólido y oscurece la página detrás; un toque fuera lo cierra.

### Instalar la página como app (Android y iPhone)

La página trae `manifest.webmanifest`, sus íconos y las etiquetas de Apple (`apple-mobile-web-app-*` en
`src/index.html`), así que se puede dejar en la pantalla de inicio y abre a pantalla completa, sin barras del navegador.

La página **`/instalar`** ("Instalar la app", en el menú del celular y en el pie) es el enlace que se comparte:
detecta el celular y muestra lo que corresponde (`InstalacionService` y `features/instalar/`).

- **Android (Chrome, Edge, Samsung Internet):** si el navegador ya ofreció instalarla (evento
  `beforeinstallprompt`), sale el botón **Instalar la app** y queda con un toque y una confirmación. El navegador
  decide cuándo ofrecerlo (pide que el visitante haya tocado la página y lleve un rato en ella); mientras tanto se
  muestran los pasos: menú ⋮ → *Instalar aplicación* (o "Agregar a pantalla principal").
- **iPhone y iPad:** Apple no deja que una página se instale sola ni muestra ningún aviso; siempre es a mano. En
  **Safari**: botón *Compartir* → *Agregar a inicio* → *Agregar*. La página muestra esos tres pasos. Desde iOS 16.4
  también funciona desde Chrome o Edge.
- **Dentro de otra app** (el navegador de Instagram, Facebook o TikTok) no se puede instalar: la página lo avisa y
  pide abrir el enlace en Safari o Chrome.
- Con la app ya instalada, el enlace "Instalar la app" desaparece del menú y del pie.

### Google (SEO)

- **Páginas armadas al compilar (prerender):** el inicio, servicios, la política y `/instalar` se publican ya escritas
  (`dist/barberia/browser/servicios/index.html`, ver `src/app/app.routes.server.ts`): Google y las redes leen el
  contenido sin ejecutar JavaScript, y en el celular se ven antes de que cargue la app, que luego las **retoma sin
  volver a pintarlas** (hidratación). Lo que viene de Firestore (servicios, equipo) no va en ese HTML: lo carga el
  navegador. Las demás rutas abren desde `index.csr.html` (la reescritura de `firebase.json`). Solo el build de
  producción prerenderiza; `npm start` sigue igual.
- **Al compilar no hay navegador:** lo que use `window`, `localStorage`, la hora del visitante o Firebase se protege
  con `enNavegador` (`core/utils/plataforma.ts`). Al agregar algo así a una página pública, protégelo igual o el
  build falla.
- **Por página:** título, descripción (`data.descripcion` en las rutas) y dirección canónica (`TituloStrategy`, con
  `urlSitio` de la config). El inicio dice "Barbería en Calima, Cali" en su titular y trae un texto propio
  (`presentacion` en la config).
- **Ficha del negocio** (JSON-LD en `src/index.html`): dirección, coordenadas, horario, teléfono, reservas y servicios
  con precio. **El horario y los precios están escritos a mano:** si cambian en el panel, actualízalos ahí.
- **Reseñas:** "Pedir reseña" por WhatsApp en los cortes ya hechos (panel del barbero y del admin) y "Califícanos en
  Google" en *Mis reservas*. Usan `ubicacion.resenaUrl` (el enlace de "Pedir reseñas" del Perfil de Empresa) o, sin
  él, la ficha en Maps.

### Qué hace que cargue rápido

- **Arranque:** mientras baja la aplicación se ve la marca (`.arranque` en `src/index.html`), no una pantalla negra.
- **Ventana de Google:** no se prepara al abrir la página sino cuando alguien va a entrar (`resolverDeVentanas` y
  `AuthService.prepararGoogle`). Antes, en celulares y Safari, Firebase bajaba un marco de Google durante el arranque y
  Firestore no pedía ningún dato hasta que terminaba.
- **Datos públicos** (servicios, equipo y ajustes): una sola escucha por visita y una copia en el navegador
  (`conCopiaLocal` en `core/utils/firestore.ts`), para pintarlos sin esperar a la red desde la segunda visita. Los
  paneles leen siempre directo de Firestore.
- **Mapa de Google:** su marco se pone cuando está por verse y el navegador quedó libre.
- **Pantallas:** *Reservar* y *Servicios* se descargan por adelantado en segundo plano (`data.precargar` en las rutas).
- **Una sola versión de Firebase:** `firebase` en `package.json` debe ser la misma serie que pide `@angular/fire`
  (hoy la 11). Con otra, se instalan dos copias y parte de la segunda termina en lo que baja el celular.

## Roles

| Rol | Cómo se obtiene | Qué puede hacer |
|---|---|---|
| `cliente` | Por defecto al iniciar sesión | Reservar, cambiar, cancelar y ver sus citas |
| `barbero` | El admin lo registra en *Equipo* con el correo de su cuenta | *Mi panel* (`/barbero`): agenda, recordatorios por WhatsApp, su disponibilidad, sus cortes y su ganancia |
| `admin` | La cuenta `adminEmail` de la config (y la misma en `firestore.rules` y `storage.rules`), o la que otro admin nombre en *Usuarios y roles* | Todo |

El rol **solo lo cambia un admin**; las reglas impiden que un usuario modifique el suyo.

### Cómo entra cada quien

En `/login` hay tres formas, para todos por igual: **Google**, **correo y contraseña** (mínimo 8 caracteres al crear
la cuenta) y **celular** (código por SMS; la primera vez pide el nombre). Al entrar, cada quien va según su rol: el
admin a `/admin`, el barbero a `/barbero` y el cliente a reservar.

- **Equipo:** sus cuentas se crean con el correo verificado (Firebase Authentication → *Agregar usuario*) y entran con
  su correo y contraseña. Al poner ese correo en su perfil de *Equipo*, la cuenta recibe el rol de barbero.
- **Correo sin verificar:** la persona puede reservar, pero no le llega la confirmación por correo (las reglas solo
  confían en correos verificados).
- **Celular:** solo números de Colombia (+57). Cada SMS tiene costo en el plan Blaze.

## Paneles

### Barbero (`/barbero`)

- **Agenda:** turnos de hoy ("Hecho", que pide el valor cobrado, y "No asistió") y próximas citas; los de clientes
  fijos llevan la marca **Recurrente**. Cada cita trae **"Recordarle por WhatsApp"**: abre el chat del cliente con el
  mensaje ya escrito (no gasta correos ni dinero).
- **Nueva cita:** el barbero se agenda citas a sí mismo (las que le piden por WhatsApp o en el local), también
  **después del cierre, hasta que la cita termine a las 10:00 p. m.** Solo en los días y horas que trabaja, con sus
  servicios y sin correos (ni al cliente ni a él). Quedan marcadas `origen: 'barbero'`.
- **Mi disponibilidad:** días libres de cada semana, descanso fijo de cada día (almuerzo) y cierre de un día o de
  unas horas (permiso, vacaciones). La reserva deja de ofrecer esos ratos al instante. Las citas ya agendadas no se
  tocan.
- **Cortes y ganancias:** cortes, lo generado y su ganancia (según su comisión) por hoy, semana, mes o mes anterior.

### Admin (`/admin`)

- **Inicio:** citas e ingresos de hoy, cortes e inasistencias de la semana y lo que sigue hoy. Con la agenda por
  periodos, hasta cuándo está abierta y el botón para abrir 15 días más.
- **Citas:** calendario y lista; editar, mover, completar o eliminar. **Nueva cita** (formulario compartido con el
  barbero, `shared/components/nueva-cita`): cualquier barbero y servicio, y además de las horas del horario, las de
  **después del cierre hasta que la cita termine a las 10:00 p. m.** (`LIMITE_DEL_EQUIPO` en `core/utils/horario.ts`;
  la reserva en línea no las ofrece). "Editar o mover" llega hasta la misma hora.
- **Agendas recurrentes:** clientes fijos que vienen cada semana, cada 2 semanas o cada 4 semanas ("mensual"), el
  mismo día y a la misma hora (ver abajo).
- **Cortes y ganancias:** lo de todo el equipo, cuánto le corresponde a cada barbero y cuánto queda para la barbería,
  y aparte lo de los clientes fijos (turnos hechos, lo generado y cuántas veces no vinieron).
- **Servicios y precios:** el menú. El precio y la duración de aquí son los que valen al reservar. Arriba, **qué se puede
  reservar con cada barbero**: un interruptor por servicio para habilitar, por ejemplo, solo los Premium y luego los
  demás. Lo que no esté habilitado se ve en la reserva como "Disponible más adelante" (con "Cualquier barbero" se
  asigna uno que lo ofrezca); el *Inicio* lo recuerda mientras haya servicios sin habilitar, y desde *Citas* el admin
  agenda cualquiera.
- **Equipo:** nombre, rol, **foto (se sube a Storage desde el panel)**, Instagram, orden, correo y comisión de cada
  barbero, y su disponibilidad. **La página de inicio y la reserva muestran lo que haya aquí** (una sola fuente).
- **Usuarios y roles**, y **Ajustes:** agenda de reservas (por periodos o siempre abierta), horario de atención
  (horas, días que abre y fechas cerradas) y la sección de cursos. Todo se cambia sin publicar nada.

### Agendas recurrentes (clientes fijos)

En *Admin → Agendas recurrentes*, el botón flotante del calendario (en celular) o **Nueva agenda recurrente**:

1. **Cliente:** se busca por nombre o celular entre los clientes de las citas, las cuentas registradas y las otras
   agendas; o **Crear cliente** (nombre y celular), o **Continuar sin agregar cliente** (el nombre se escribe al final).
2. **Servicio.**
3. **Agenda:** barbero, tipo de recurrencia (semanal, quincenal = cada 2 semanas, mensual = cada 4 semanas), día,
   fecha del primer turno, **duración** (de 5 en 5 min, hasta 4 h; puede ser distinta de la del catálogo) y **hora**
   (los turnos encadenados de esas fechas, o cualquiera de 5 en 5 con "Ver más horas"; también **después del cierre,
   hasta que el turno termine a las 10:00 p. m.**, en un grupo aparte, para el admin y el barbero; las reglas le ponen
   ese tope a las del barbero). Cada hora dice si está libre,
   ocupada en algunas fechas (esas no se apartan) u ocupada en todas, o si cae en el descanso del barbero. Un resumen
   dice qué turnos se apartan y cuáles no, y por qué.

El admin crea las de todos los barberos. Cada barbero crea las suyas en su panel (*Agendas recurrentes*), con la misma
ventana, pero solo consigo mismo: las reglas no le dejan crear ni tocar las de otro.

Un mismo cliente puede tener varias agendas. Al guardar, la Cloud Function **`programarRecurrencia`** aparta los
turnos de verdad (una cita sin cuenta y su rato en `ocupacion`, como una reserva) hasta **62 días** adelante, que es lo
más lejos que puede reservar un cliente; **`extenderRecurrencias`** suma cada noche el turno que entra a ese
horizonte. Así ningún cliente alcanza a reservar la hora de un cliente fijo, aunque nadie abra el panel.

- Los turnos salen en la agenda (admin y barbero) con la marca **Recurrente · Semanal** y se marcan "Hecho" o "No
  asistió" como cualquier cita, así que cuentan en las ganancias.
- Si una fecha ya estaba ocupada, la barbería cierra (fecha de *Ajustes*), es el día libre del barbero o cae en su
  descanso, ese día no se aparta y la tarjeta lo dice. La serie sigue con los demás.
- **Editar** una agenda quita sus turnos por venir y los vuelve a apartar con los datos nuevos (los atendidos no se
  tocan). **Pausar** suelta sus turnos por venir; **Reanudar** los vuelve a apartar. **Eliminar** suelta los que
  faltan y deja los que ya pasaron. Para quitar un solo día (el cliente viaja), se borra ese turno en *Citas*.
- **No envían correos** (ni al crearse ni al cambiar) ni suenan como "Nueva reserva" en el panel: solo aparecen en
  la agenda de mañana que ya le llega al barbero.

## Correos de citas

Cloud Functions de `functions/` que envían con [Resend](https://resend.com):

| Función | Cuándo | Cliente | Barbero |
|---|---|---|---|
| `avisarCitaNueva` | Se crea una cita | Confirmación con detalles, "Cómo llegar", "Agregar a Google Calendar" y `.ics` | Aviso con datos del cliente y WhatsApp |
| | El cliente cambia el horario | "Tu cita cambió de horario" (un solo correo, con `.ics` actualizado) | "Cita movida…" |
| `avisarCambioDeCita` | Se cancela, o el admin la mueve | "Tu cita quedó cancelada" / "cambió de horario" | "Se canceló…" / "Cita movida…" |
| `recordarCitas` | Todos los días a las 6:00 p. m. (Colombia) | Recordatorio a quien tiene cita mañana (no si reservó hace menos de 12 h) | **Su agenda de mañana**, en un solo correo (solo si tiene citas) |

Los turnos de las agendas recurrentes no envían ninguno de estos correos (salvo aparecer, marcados, en la agenda de
mañana del barbero). El cliente recibe los correos en el de su cuenta (no se puede cambiar: así nadie usa la página para mandar correos a
terceros). El barbero, en el correo de su perfil de *Equipo*. Si un envío falla no afecta la reserva; queda en los
logs (`npm --prefix functions run logs`). Plan gratis de Resend: 100 correos al día y 3.000 al mes.

Configuración en `barbercali-db2` (plan Blaze):

- La llave de Resend está en el secreto `RESEND_API_KEY` (`firebase functions:secrets:set RESEND_API_KEY`).
- Remitente, datos del negocio y la dirección de la página (`URL_SITIO`): `functions/.env.barbercali-db2`.
- **Dominio:** mientras el remitente sea `onboarding@resend.dev`, Resend solo entrega al correo dueño de la cuenta
  de Resend. Para enviar a clientes y barberos hay que verificar un dominio en Resend y cambiar `CORREO_REMITENTE`.

```bash
npm --prefix functions install            # la primera vez
FUNCTIONS_DISCOVERY_TIMEOUT=60 firebase deploy --only functions
```

Para probar los correos sin enviarlos: `FUNCTIONS_DISCOVERY_TIMEOUT=60 firebase emulators:start --only
auth,firestore,functions --project demo-acicale` (necesita `functions/.secret.local` con `RESEND_API_KEY=` cualquier
valor). En los emuladores los correos no salen: se muestran en el log.

## Modelo de datos (Firestore)

- `usuarios/{uid}`: perfil, rol y teléfono.
- `servicios/{id}`: catálogo público.
- `barberos/{id}`: perfil **público** (nombre, rol, foto, Instagram, orden, `diasLibres`, `descanso` y
  `serviciosCerrados`, los servicios que por ahora no se reservan en línea con él). El barbero solo puede cambiar su
  propia disponibilidad; lo demás, el admin.
- `barberosPrivado/{id}` (mismo id): `emailAsociado` y `comision`. Solo el admin, y cada barbero el suyo.
- `citas/{id}`: reservas con datos del cliente. Solo las leen su dueño y el staff. Llevan `cupoId` y, si vienen de
  un cambio de horario, `reemplazaA` (la anterior queda cancelada con `reemplazadaPor`). Los turnos de una agenda
  recurrente tienen ID `{recurrenciaId}_{AAAAMMDD}`, `userId` vacío, `recurrenciaId` y `frecuencia`.
- `recurrencias/{id}`: agendas recurrentes (el admin las de todos; cada barbero, las suyas): cliente, servicio, duración, barbero, `frecuencia`
  (`semanal` | `quincenal` | `mensual`), `hora`, `desde` (primer día; el día de la semana sale de ahí), `activa` y
  `actualizadoEn`. La función anota `generadaHasta`, `procesadaEn` (la versión que ya agendó) y `omitidas` (días por
  venir que no pudo apartar, con el motivo); desde el navegador esos tres campos no se escriben.
- `ocupacion/{barberoId}_{YYYY-MM-DD}`: la agenda de un barbero ese día, sin datos personales y de lectura pública.
  `mapa`: 288 caracteres, uno por cada 5 minutos ('0' libre, 'c' una cita y la letra del motivo de un cierre: D
  Descanso, A Almuerzo, P Permiso, V Vacaciones, O Otro, X sin motivo); `citas`: el tramo de cada cita activa
  (`{citaId: [primeraMarca, marcas]}`); `op`: qué cambió en la última escritura (lo que revisan las reglas).
- `slots/…`: la agenda de antes (bloques de 20 min). Ya nadie la escribe; se lee una vez para armar los días que
  faltan (los cierres que había) y el admin puede borrarla.
- `cupos/{uid}_{YYYY-MM-DD}_{1..3}`: una reserva activa del cliente ese día.
- `ajustes/sitio`: cursos, horario de atención (`{ apertura, cierre, aperturas, diasCerrados, cierres }`, en minutos
  desde medianoche y siempre múltiplos de 20; `aperturas` trae los días que abren a otra hora) y `agenda`
  (`{ modo: 'continua' | 'periodo', desde, hasta }`, con las fechas como `YYYY-MM-DD`). Sin `agenda`, vale la continua.
  Un horario guardado sin `aperturas` (de antes de los turnos de 40 min) conserva sus días y fechas cerradas, pero
  toma las horas de la configuración.

Fotos del equipo: carpeta `staff/` del bucket de Storage (solo las maneja el admin; la página usa su URL de descarga).

## Seguridad

Antes de desplegar un cambio en las reglas: `npm run test:reglas` (lo que la app hace debe funcionar y cada ataque
debe fallar).

- **Roles y datos personales:** nadie se da un rol ni pone el correo de otro; cada cliente ve solo sus citas y su
  perfil; el correo y la comisión de los barberos no son públicos.
- **Reservas:** precio, nombre y duración salen del catálogo; el rato exacto apartado en la agenda, que estaba libre; cupo por día;
  ventana de fechas; textos con límite; la confirmación solo va al correo de quien reserva.
- **Barberos:** solo gestionan sus citas y su agenda. Pueden agendarse citas a sí mismos (`citaDelBarbero`: su
  perfil, servicio del catálogo, día y hora en que trabajan, sin cuenta ni correo y terminando a más tardar a las
  10:00 p. m.). **Catálogo, equipo y ajustes:** solo el admin. Cualquier otra colección está cerrada.
- **Límites de las reglas:** una escritura puede leer 10 documentos y evaluar 1.000 expresiones. Con el mapa de cada
  día, una reserva lee unos 5 documentos sin importar cuánto dure; si le agregas comprobaciones, las pruebas avisan.
- **Agenda:** que el día esté dentro de la agenda abierta se comprueba al crear el **cupo** (sin cupo de ese día no
  hay cita). La cita solo pone el tope duro: ni en el pasado ni a más de 60 días.
- **Sin terceros innecesarios:** las fuentes, los íconos, los avatares y el sonido de aviso van dentro de la página.
- **Encabezados (`firebase.json`):** `nosniff`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, HSTS y
  una política de contenido **estricta y obligatoria** (`Content-Security-Policy`): el navegador bloquea todo lo que
  venga de un origen que no esté en la lista. Estuvo en modo "solo reportar" hasta el 2026-10-15, sin avisos en
  producción (inicio, mapa, Instagram, reCAPTCHA, ingreso con Google y con celular). Si agregas un servicio de fuera
  (otro video, otra fuente, otro mapa), agrégalo ahí o no cargará. Si cambia el dominio, cámbialo en `frame-src`
  (por la ventana de Google).

### Protecciones configuradas en Firebase (no están en el código)

- **App Check** (reCAPTCHA Enterprise): Firestore solo atiende a la página de verdad. Clave en `appCheckSiteKey`.
- **Llave de API** restringida a `elacicale.com`, `www.elacicale.com`, `barbercali-db2.web.app`,
  `barbercali-db2.firebaseapp.com` y `localhost`.
- **reCAPTCHA Enterprise para el SMS** (en ENFORCE desde el 2026-10-15) y SMS permitidos solo a Colombia. Con App
  Check en la misma página, Firebase no carga la clave del SMS y el envío se quedaba en "Enviando…": lo arregla
  `core/utils/recaptcha-del-sms.ts` (carga reCAPTCHA con esa clave antes de enviar). No lo quites al actualizar
  Firebase sin probar el login por celular en el dominio real.
- **Secretos** (llave de Resend): en Secret Manager, nunca en el código.

Con `npm start` la página usa un token de depuración de App Check: la primera vez, copia de la consola del navegador
el `App Check debug token` y regístralo en Firebase → *App Check* → *Administrar tokens de depuración*. No lo subas
al repositorio: es un secreto.

## Privacidad y cookies

- Página `/politica-de-datos` (Ley 1581 de 2012), con la sección de cookies. **Faltan razón social, NIT y correo de
  El Acicale** (`legal` en `src/app/config/clientes/acicale.ts`). Conviene que un abogado la revise antes de lanzar.
- **Aviso de cookies:** la página usa lo necesario (sesión, protección contra robots y la propia elección). Las
  **publicaciones de Instagram** guardan cookies de Meta, así que no se cargan hasta que el visitante acepta o toca
  "Ver las publicaciones aquí". La elección se cambia en "Preferencias de cookies" (pie de página). No hay publicidad
  ni medición.
- **El mapa de Google se muestra siempre** (decisión del negocio, 2026-10-11): se carga al abrir el inicio, sin pedir
  permiso, y Google puede guardar sus cookies. El aviso y el punto 8 de la política lo dicen así. Si algún día se
  quiere pedir permiso otra vez, el mecanismo es el mismo de Instagram (`ConsentimientoService`).

## Publicar

```bash
npm run test:reglas && npm test -- --watch=false --browsers=ChromeHeadless && npm run test:funciones && npm run test:recurrentes
npm run build
firebase deploy --only firestore:rules,firestore:indexes,storage   # reglas e índices primero
FUNCTIONS_DISCOVERY_TIMEOUT=60 firebase deploy --only functions
firebase deploy --only hosting
```

- Las **agendas recurrentes** necesitan las tres cosas: las reglas (colección `recurrencias`), las funciones
  (`programarRecurrencia` y `extenderRecurrencias`, y los correos que ya no avisan de los turnos fijos) y la página.
  Publicar la página sin las reglas deja la pestaña sin poder leer ni guardar.

- **Storage** debe estar activado en la consola de Firebase antes de desplegar sus reglas. Para que otros admins
  (no solo `adminEmail`) suban fotos, despliega `--only storage` en una terminal interactiva y acepta el permiso que
  ofrece ("Grant the new role?").
- Los encabezados solo se ven en producción (el emulador de Hosting los ignora): `curl -I https://barbercali-db2.web.app/`.

### Al conectar el dominio propio

`elacicale.com` quedó conectado así el 2026-10-13 (DNS en Hostinger: `A @ 199.36.158.100`, `TXT hosting-site=…`,
`CNAME www → barbercali-db2.web.app` y los registros de Resend). Para otro dominio o cliente:

1. *Hosting → Agregar dominio personalizado* y *Authentication → Dominios autorizados*.
2. Agrega el dominio a la llave de API y a la clave de reCAPTCHA "ElAcicale" (si no, App Check deja de funcionar ahí).
3. Cambia `barbercali-db2.web.app` por el dominio en `src/index.html` (vista previa para redes y ficha del negocio),
   `public/sitemap.xml`, `public/robots.txt` y `URL_SITIO` de `functions/.env.barbercali-db2`; y
   `barbercali-db2.firebaseapp.com` en la política de `firebase.json` y en `authDomain`
   (`src/app/config/clientes/acicale.ts`) si quieres que el ingreso con Google muestre tu dominio.
4. Verifica el dominio en Resend y cambia `CORREO_REMITENTE`.

La ficha del negocio de `src/index.html` (dirección y horario para Google) es fija: si cambia el horario habitual,
actualízala también ahí.

## Imágenes

Los originales están en `recursos/originales/` (no se publican). De ahí salen el logo y el símbolo en WebP, los
íconos (`favicon.ico`, `icono-*.png`, `apple-touch-icon.png`), la imagen para redes (`og-el-acicale.jpg`), la foto
del local del ingreso y los retratos del equipo (`public/fotos/`). `public/jjulian.jpg` y `public/triip.jpg` se
conservan, ya optimizados, por si algún perfil guardado aún apunta a ellos.
