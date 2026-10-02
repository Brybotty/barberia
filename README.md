# Barbería (El Acicale / BarberCali)

App para barberías: reservas por barbero, enlace a cursos y paneles para barberos y administración. Un mismo código sirve a varios clientes (`src/app/config/clientes/`).

**Stack:** Angular 20 (standalone, SPA) · Firebase Auth (Google) · Cloud Firestore · Cloud Functions (correos de confirmación con Resend) · Tailwind CSS 3.

## Desarrollo

```bash
npm install
npm start          # http://localhost:4200 (usa el Firebase real del cliente)
npm test                 # tests unitarios (Karma)
npm run test:reglas      # 85 pruebas de seguridad de firestore.rules (emulador, no toca datos reales)
npm run test:funciones   # tests de los correos (functions/)
npm run build            # build de producción en dist/barberia/browser
```

### Demo con datos de prueba (sin tocar datos reales)

```bash
npm run demo     # emuladores + la página en http://localhost:4200
```

- Usa los emuladores de Firebase (proyecto `demo-acicale`) con los datos de `demo-datos/`: servicios,
  barberos y ~5 semanas de citas. **Nunca toca el proyecto real.**
- Detén `npm start` antes: los dos usan el puerto 4200.
- Se cierra con **Ctrl+C** en su ventana; al cerrarse guarda en `demo-datos/` lo que cambiaste.
- Para volver a los datos originales, con la demo abierta: `npm run demo:sembrar`.
- **El inicio de sesión es con Google real**; solo los datos van a los emuladores. La cuenta `adminEmail` de la
  config entra como admin; cualquier otra cuenta de Google entra como cliente. No hay usuarios de prueba.
- Los servicios se muestran con íconos propios (`app-icono`), sin emojis; el admin elige el ícono de cada servicio.
- Datos del emulador: http://127.0.0.1:4000.
- Si quieres volver a las cuentas de prueba del emulador (sin Google real), pon `authEmulador: true` en
  `src/environments/environment.emulador.ts`.

## Roles

| Rol | Cómo se obtiene | Qué puede hacer |
|---|---|---|
| `cliente` | Por defecto al iniciar sesión | Reservar, ver y cancelar sus citas |
| `barbero` | El admin lo registra en *Staff & Barberos* con su email (el de su cuenta) | En *Mi panel* (`/barbero`): su agenda, sus cortes y su ganancia por período |
| `admin` | La cuenta `adminEmail` de la config del cliente (y la misma en `firestore.rules`) | Todo |

El rol **solo lo puede cambiar un admin**; las reglas de Firestore impiden que un usuario modifique el suyo.

### Cómo entra cada quien

En `/login` hay tres formas, para todos por igual: **Google**, **correo y contraseña** (entrar, crear cuenta y
"¿Olvidaste tu contraseña?") y **celular** (código por SMS; la primera vez pide el nombre). Al entrar, cada quien va
según su rol: el admin a `/admin`, el barbero a `/barbero` y el cliente a reservar.

- **Equipo:** sus cuentas se crean con el rol ya asignado (Firebase Authentication → *Agregar usuario*, con el correo
  verificado, y su perfil en *Usuarios & Roles*). Entran con su correo y contraseña como cualquier persona.
- **Correo sin verificar:** al crear la cuenta se envía un enlace. Mientras no lo abra, la persona puede reservar, pero
  no le llega la confirmación por correo (las reglas solo confían en correos verificados).
- **Celular:** solo números de Colombia (+57). En Firebase, la política de regiones de SMS permite solo `CO`; eso evita
  cobros por SMS a otros países. Cada SMS tiene costo en el plan Blaze (lo cobra Google por mensaje).
- Los correos de Firebase (verificar y cambiar contraseña) y el SMS salen en español (`auth.languageCode = 'es'`).

### Cortes y ganancias

- Al marcar un turno como **hecho**, el barbero (o el admin) registra el **valor cobrado**; viene con el precio reservado
  y se cambia si se cobró otro (servicios "Desde", adicionales).
- Cada barbero tiene una **comisión** (% de cada servicio) en *Staff & Barberos*. Sin comisión definida gana el 100 %
  (el dueño que también corta).
- *Mi panel* (`/barbero`): cortes, lo generado y su ganancia por hoy, semana, mes o mes anterior; agenda de hoy, próximas
  citas e historial. Un admin con su email en un perfil de barbero (p. ej. Jose) ve ahí sus propios cortes.
- *Admin → Cortes y ganancias*: lo de todo el equipo, cuánto le corresponde a cada barbero y cuánto queda para la
  barbería. El perfil del admin aparece marcado como "Tú".

## Cursos

Botón en el menú y banner en el inicio hacia la página de cursos. Enlace y textos en *Admin → Ajustes*.

## Correos de citas

Cloud Functions de `functions/` que envían con [Resend](https://resend.com):

| Función | Cuándo | Cliente | Barbero |
|---|---|---|---|
| `avisarCitaNueva` | Se crea una cita | Confirmación con detalles, "Cómo llegar", "Agregar a Google Calendar" y `.ics` (alarma 1 h antes) | Aviso con datos del cliente, WhatsApp y "Ver mi agenda"; si responde, le llega al cliente |
| `avisarCambioDeCita` | Se cancela o cambia de día/hora | "Tu cita quedó cancelada" / "Tu cita cambió de horario" (con `.ics` actualizado) | "Se canceló la cita…" / "Cita movida…" |
| `recordarCitas` | Todos los días a las 6:00 p. m. (Colombia) | Recordatorio a quien tiene cita mañana (no si reservó hace menos de 12 h) | — |

El cliente recibe los correos en el de su cuenta de Google (en la reserva no se puede cambiar: las reglas lo
exigen para que nadie use la página para mandar correos a terceros). El barbero, en el `emailAsociado` de su
perfil en *Staff & Barberos*.

No avisa de citas pasadas ni completadas (p. ej. las que registra el admin después de atender). Si el envío falla
no afecta la reserva; queda en los logs (`npm --prefix functions run logs`). Si Resend pide bajar el ritmo
(2 envíos por segundo) se reintenta solo. Plan gratis de Resend: 100 correos al día y 3.000 al mes.

Configuración en `barbercali-db2` (plan Blaze):

- La llave de Resend está en el secreto `RESEND_API_KEY`. Para cambiarla:
  `firebase functions:secrets:set RESEND_API_KEY` y vuelve a desplegar.
- Remitente, datos del negocio y la URL pública de la página: `functions/.env.barbercali-db2`.
- **Dominio:** mientras el remitente sea `onboarding@resend.dev`, Resend solo entrega al correo dueño de la cuenta
  de Resend. Para enviar a clientes y barberos: en Resend → *Domains* agrega el dominio (p. ej. `elacicale.com`),
  copia los registros DNS en Hostinger, y cuando salga *Verified* cambia `CORREO_REMITENTE` (p. ej.
  `El Acicale <citas@elacicale.com>`) y despliega:

```bash
npm --prefix functions install            # la primera vez
FUNCTIONS_DISCOVERY_TIMEOUT=60 firebase deploy --only functions
```

En la demo (`npm run demo`) no se levanta el emulador de funciones. Para probar el trigger:
`firebase emulators:start --only functions,firestore --project demo-acicale` (necesita `functions/.secret.local`
con `RESEND_API_KEY=` cualquier valor). En los emuladores los correos no salen: se muestran en el log.

## Modelo de datos (Firestore)

- `usuarios/{uid}`: perfil, rol y teléfono.
- `servicios/{id}`: catálogo público de servicios.
- `barberos/{id}`: perfiles públicos del staff. `emailAsociado` lo enlaza con la cuenta del barbero.
- `citas/{id}`: reservas con datos del cliente. Solo las leen su dueño y el staff.
- `slots/{barberoId}_{YYYY-MM-DD}_{HHmm}`: un documento por cada bloque de 30 min ocupado, sin datos personales.
  La disponibilidad se calcula con esta colección, y como sus IDs son deterministas, las reglas impiden
  que dos citas ocupen el mismo bloque (anti doble reserva).
- `ajustes/sitio`: botón y sección de cursos.

Horario de atención, intervalo y días cerrados: `src/app/core/utils/horario.ts` (`HORARIO`).

## Política de tratamiento de datos

Página `/politica-de-datos` (Ley 1581 de 2012), enlazada desde el pie de página, el login y la reserva.
Los datos del responsable salen de `legal` en la config del cliente: **faltan razón social, NIT y correo de
El Acicale** (TODO en `src/app/config/clientes/acicale.ts`). Conviene que un abogado la revise antes de lanzar.

## Reglas de Firestore (seguridad)

Las reglas están en `firestore.rules`, desplegadas en `barbercali-db2` el 2026-09-30. Antes de desplegar un
cambio, corre `npm run test:reglas` (85 casos: lo que la app hace debe funcionar y cada ataque debe fallar).

Qué protegen:

- **Roles:** nadie se da a sí mismo el rol de barbero o admin, ni pone en su perfil el correo de otra persona.
  Solo la cuenta de `esEmailAdmin()` puede crearse como admin.
- **Datos personales:** cada cliente ve solo sus citas y su perfil; los visitantes sin sesión no ven citas,
  usuarios ni disponibilidad.
- **Reservas:** el precio, el nombre y la duración deben coincidir con el catálogo; el barbero debe existir;
  los bloques deben ser los del día y la hora de la cita y alcanzar para toda la duración (no hay doble reserva);
  la confirmación solo puede ir al correo de quien reserva (anti-spam); no se pueden agregar campos.
- **Barberos:** solo gestionan sus propias citas (las del perfil enlazado a su correo) y solo cambian el estado
  y el valor cobrado.
- **Catálogo, staff y cursos:** solo los edita el admin. Cualquier otra colección está cerrada.

Para desplegar:

```bash
npm install -g firebase-tools   # si no lo tienes
firebase login
npm run test:reglas
firebase deploy --only firestore:rules
```

## Publicar la página (Firebase Hosting)

`firebase.json` ya tiene la configuración: todas las rutas sirven la app, encabezados de seguridad
(`nosniff`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`) y caché larga solo para los archivos
con hash (las rutas y el `index.html` no se guardan en caché, así cada publicación se ve de inmediato).

```bash
npm run build
firebase deploy --only hosting
```

Después de la primera publicación:

1. Comprueba los encabezados: `curl -I https://barbercali-db2.web.app/` (debe salir `cache-control: no-cache`).
2. Conecta el dominio de Hostinger en *Hosting → Agregar dominio personalizado* (Firebase da los registros DNS).
3. Agrega el dominio en *Authentication → Configuración → Dominios autorizados* y cambia `authDomain`
   (`src/app/config/clientes/barbercali.ts`, que usa El Acicale) por tu dominio, para que el inicio de sesión no
   muestre "firebaseapp.com".
4. En `functions/.env.barbercali-db2` pon `URL_SITIO` y el remitente con tu dominio, y despliega las funciones.
5. En `src/index.html` activa `og:image` y `og:url` con la dirección completa (la vista previa al compartir el enlace).
