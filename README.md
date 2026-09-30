# Barbería (El Acicale / BarberCali)

App para barberías: reservas por barbero, tienda de productos con pago en línea, enlace a cursos y
paneles para barberos y administración. Un mismo código sirve a varios clientes (`src/app/config/clientes/`).

**Stack:** Angular 20 (standalone, SPA) · Firebase Auth (Google) · Cloud Firestore · Cloud Functions (pedidos, inventario y pagos) · Tailwind CSS 3.

## Desarrollo

```bash
npm install
npm start          # http://localhost:4200 (usa el Firebase real del cliente)
npm test           # tests unitarios (Karma)
npm run build      # build de producción en dist/barberia/browser
```

### Demo con datos de prueba (sin tocar datos reales)

```bash
npm --prefix functions install      # la primera vez
npm run demo                        # emuladores + la página en http://localhost:4200
```

- Usa los emuladores de Firebase (proyecto `demo-acicale`) con los datos de `demo-datos/`: productos con
  inventario, pedidos en varios estados, servicios y barberos. **Nunca toca el proyecto real.**
- Detén `npm start` antes: los dos usan el puerto 4200.
- Se cierra con **Ctrl+C** en su ventana; al cerrarse guarda en `demo-datos/` lo que cambiaste.
- Para volver a los datos originales, con la demo abierta: `npm run demo:sembrar`.
- **El inicio de sesión es con Google real**; solo los datos van a los emuladores. La cuenta `adminEmail` de la
  config entra como admin; cualquier otra cuenta de Google entra como cliente. No hay usuarios de prueba.
- Los servicios se muestran con íconos propios (`app-icono`), sin emojis; el admin elige el ícono de cada servicio.
- El pago en línea abre un **checkout simulado** (solo existe con los emuladores); en producción se abre el de Wompi.
- Datos, cuentas y logs de las funciones: http://127.0.0.1:4000.
- Necesita `functions/.secret.local` con valores cualquiera para `WOMPI_INTEGRITY_SECRET` y `WOMPI_EVENTS_SECRET`.
- Si quieres volver a las cuentas de prueba del emulador (sin Google real), pon `authEmulador: true` en
  `src/environments/environment.emulador.ts`.

## Roles

| Rol | Cómo se obtiene | Qué puede hacer |
|---|---|---|
| `cliente` | Por defecto al iniciar sesión | Reservar, comprar, ver y cancelar sus citas y pedidos |
| `barbero` | El admin lo registra en *Staff & Barberos* con su email de Google | En *Mi panel* (`/barbero`): su agenda, sus cortes y su ganancia por período |
| `admin` | La cuenta `adminEmail` de la config del cliente (y la misma en `firestore.rules`) | Todo |

El rol **solo lo puede cambiar un admin**; las reglas de Firestore impiden que un usuario modifique el suyo.

### Cortes y ganancias

- Al marcar un turno como **hecho**, el barbero (o el admin) registra el **valor cobrado**; viene con el precio reservado
  y se cambia si se cobró otro (servicios "Desde", adicionales).
- Cada barbero tiene una **comisión** (% de cada servicio) en *Staff & Barberos*. Sin comisión definida gana el 100 %
  (el dueño que también corta).
- *Mi panel* (`/barbero`): cortes, lo generado y su ganancia por hoy, semana, mes o mes anterior; agenda de hoy, próximas
  citas e historial. Un admin con su email en un perfil de barbero (p. ej. Jose) ve ahí sus propios cortes.
- *Admin → Cortes y ganancias*: lo de todo el equipo, cuánto le corresponde a cada barbero y cuánto queda para la
  barbería. El perfil del admin aparece marcado como "Tú".

## Tienda

- **Catálogo** (`/tienda`): carrusel de destacados, filtros por categoría, búsqueda y orden. Productos con opciones
  (presentación, aroma…), precio de oferta y agotados. Se administra en *Admin → Tienda & Productos*; las fotos se
  comprimen en el navegador y se guardan en el propio producto (no hace falta Firebase Storage).
- **Carrito** en el navegador (no pide cuenta). **Checkout** (`/tienda/pagar`): pide iniciar sesión con Google y
  aceptar la política de datos al confirmar.
- **Pedidos en el servidor:** la Cloud Function `crearPedido` pone los precios del catálogo y el envío, y descuenta el
  inventario en una sola transacción. `cancelarPedido` cancela y devuelve las unidades. Por eso la tienda en
  producción necesita las funciones desplegadas (plan Blaze).
- **Inventario** (*Admin → Tienda & Productos → Inventario*): stock por producto o por opción, avisos de "¡Últimas
  unidades!" en la tienda, entradas de mercancía, salidas, conteos físicos, ajustes rápidos e historial de
  movimientos (`movimientosInventario`). Stock bajo = 3 unidades o menos (`STOCK_BAJO`).
- **Entrega y pago** (*Admin → Ajustes*): recoger en la barbería, domicilio en la ciudad o envío nacional, con su costo
  y envío gratis desde cierto monto. Pagos: en línea (Wompi), contraentrega o en la barbería.
- **Pedidos** (*Admin → Pedidos*): estados Recibido → Confirmado → En camino / Listo para recoger → Entregado,
  WhatsApp al cliente y "Marcar como pagado" para pagos en efectivo.
- **Cursos**: botón en el menú y banner en el inicio hacia la página de cursos. Enlace y textos en *Admin → Ajustes*.

### Pago en línea con Wompi

La firma del pago usa un secreto, así que la generan las Cloud Functions de `functions/`:

- `iniciarPagoWompi`: firma el total del pedido (lo calculó `crearPedido`, el navegador no puede cambiarlo) y
  devuelve el enlace al checkout de Wompi.
- `webhookWompi`: recibe los eventos de Wompi, verifica su firma y marca el pedido como pagado.
- `confirmarPagoWompi`: al volver de Wompi consulta la transacción, por si el webhook tarda.

Estado en `barbercali-db2` (plan Blaze): **`crearPedido` y `cancelarPedido` están desplegadas**, así que los
pedidos con contraentrega o pago en la barbería ya funcionan. Las de Wompi aún no: los secretos existen con un
valor temporal (`pendiente-configurar`) y `functions/.env.barbercali-db2` tiene `WOMPI_PUBLIC_KEY=pendiente-configurar`.

Para activar el pago en línea:

1. Cuenta de Wompi del negocio (https://comercios.wompi.co). En *Desarrolladores* están las llaves y secretos.
2. Llaves y secretos reales:
   ```bash
   # en functions/.env.barbercali-db2: WOMPI_PUBLIC_KEY=pub_prod_...  (o pub_test_... para probar)
   firebase functions:secrets:set WOMPI_INTEGRITY_SECRET
   firebase functions:secrets:set WOMPI_EVENTS_SECRET
   firebase deploy --only functions
   ```
   En Windows, si el deploy falla con "Timeout after 10000", repítelo con `FUNCTIONS_DISCOVERY_TIMEOUT=60`.
3. En Wompi → *Desarrolladores* → URL de eventos:
   `https://us-central1-barbercali-db2.cloudfunctions.net/webhookWompi`
4. En *Admin → Ajustes* activa **Pago en línea**.

Primero conviene probar con las llaves de pruebas (`pub_test_...`) y las tarjetas de prueba de Wompi.

## Modelo de datos (Firestore)

- `usuarios/{uid}`: perfil, rol y teléfono.
- `servicios/{id}`: catálogo público de servicios.
- `barberos/{id}`: perfiles públicos del staff. `emailAsociado` lo enlaza con la cuenta del barbero.
- `citas/{id}`: reservas con datos del cliente. Solo las leen su dueño y el staff.
- `slots/{barberoId}_{YYYY-MM-DD}_{HHmm}`: un documento por cada bloque de 30 min ocupado, sin datos personales.
  La disponibilidad se calcula con esta colección, y como sus IDs son deterministas, las reglas impiden
  que dos citas ocupen el mismo bloque (anti doble reserva).
- `productos/{id}`: catálogo público de la tienda.
- `pedidos/{id}`: compras. Solo las leen su dueño y el admin. Las crean y cancelan las Cloud Functions; el admin
  cambia el estado. Guardan `autorizacionDatos` (prueba de la autorización) y lo descontado del inventario.
- `movimientosInventario/{id}`: historial de inventario (ventas, cancelaciones, entradas, ajustes). No se edita.
- `ajustes/sitio`: tienda (entregas, costos, formas de pago) y cursos.

Horario de atención, intervalo y días cerrados: `src/app/core/utils/horario.ts` (`HORARIO`).

## Política de tratamiento de datos

Página `/politica-de-datos` (Ley 1581 de 2012), enlazada desde el pie de página, el login, la reserva y el checkout.
Los datos del responsable salen de `legal` en la config del cliente: **faltan razón social, NIT y correo de
El Acicale** (TODO en `src/app/config/clientes/acicale.ts`). El checkout exige aceptar la política y el servidor lo
vuelve a comprobar. Conviene que un abogado la revise antes de lanzar.

## Reglas de Firestore

Las reglas están en `firestore.rules` y **hay que desplegarlas** (no se aplican solas):

```bash
npm install -g firebase-tools   # si no lo tienes
firebase login
firebase deploy --only firestore:rules
```
