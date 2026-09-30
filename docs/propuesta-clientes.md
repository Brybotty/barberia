# Propuesta comercial: páginas para barberías

Este documento tiene dos partes:

- **Parte 1: Guía de precios (solo para ti, no la envíes).** Costos reales, cuánto cobrar, venta vs. mensualidad, cómo cobrar los cambios y la oportunidad de la app móvil.
- **Parte 2: Propuesta para el cliente.** Lista para copiar, ajustar y enviar (PDF, WhatsApp o correo).

Precios en pesos colombianos (COP), a septiembre de 2026. Los costos en dólares se calcularon a unos $4.000 COP por dólar: ajústalos al cambio del día.

---

# Parte 1: Guía de precios (solo para ti)

## 1. Qué estás vendiendo

No es "una página web". Es un **sistema para el negocio**, con cosas que una página sencilla no tiene:

| Módulo | Qué hace | Valor para el barbero |
|---|---|---|
| Sitio web de marca | Diseño oscuro y elegante, galería de reels, equipo, mapa, horarios | Imagen profesional, confianza |
| Reservas en línea | Asistente de 4 pasos, disponibilidad real por barbero, sin doble reserva | Agenda llena sin contestar WhatsApp todo el día |
| Tienda virtual | Catálogo con filtros, carrito, checkout, domicilios y envíos | Vende productos (Cacique) las 24 horas |
| Pagos en línea | Wompi: tarjeta, PSE, Nequi, Bancolombia | Cobra por adelantado; el dinero llega directo a su cuenta |
| Inventario | Stock por producto y presentación, se descuenta solo, historial | Sabe qué tiene, qué se vende y qué pedir |
| Panel de administración | Servicios, precios, productos, pedidos, citas, barberos, ajustes | **Él mismo cambia precios y productos, sin llamarte** |
| Cursos | Botón y sección hacia su página de cursos | Otra fuente de ingresos |
| Política de datos | Ley 1581 de 2012, autorización en el checkout | Cumple la ley y da confianza |

Mercado de referencia en Colombia (2026):

- Una tienda virtual cuesta entre **$2.500.000 y más de $30.000.000**.
- Un e-commerce con pasarela de pagos cuesta entre **$1.800.000 y $15.000.000**.
- El mantenimiento mensual está entre **$150.000 y $500.000**.

Tu producto está en la parte media-alta de funciones. Aun así puedes cobrar precios de parte media, porque **el código ya está hecho y se reutiliza**.

## 2. Tu ventaja: un solo código, muchos clientes

El proyecto ya está preparado para varios clientes. Cada barbería es un archivo de configuración (`src/app/config/clientes/`) con su logo, colores, fuente, servicios, horario y redes. Eso cambia la economía del negocio:

- **Construirlo desde cero** te llevó (o le llevaría a cualquiera) unas **150 a 250 horas**.
- **Montarlo para un cliente nuevo** son unas **15 a 25 horas**: configuración, fotos, catálogo, dominio, publicación y capacitación.
- Cada mejora que hagas (por ejemplo la app móvil) **la aprovechan todos tus clientes**.

Eso es un modelo de software por suscripción (SaaS). La mensualidad es la forma natural de cobrarlo.

## 3. Costos reales por cliente

### Costos fijos de infraestructura

| Concepto | Costo | Quién lo paga |
|---|---|---|
| Dominio `.com.co` o `.com` | ~$60.000 al año | Inclúyelo en la mensualidad, pero **regístralo a nombre del cliente** |
| Firebase (base de datos, hosting, funciones) | $0 a ~$20.000 al mes con este tráfico (plan Blaze, casi siempre dentro de la cuota gratis) | Tú, incluido en la mensualidad (pon una alerta de presupuesto en Google Cloud) |
| Wompi | Sin mensualidad: 2,65% + $700 + IVA por venta | El cliente, se descuenta de cada venta |
| Correo corporativo (opcional) | Según el plan de Google Workspace | El cliente, si lo quiere |
| App móvil (si la contrata) | Apple: USD 99 al año (~$400.000); Google Play: USD 25 una sola vez (~$100.000) | El cliente, con cuentas a su nombre |

**Costo de infraestructura por cliente: unos $25.000 al mes.** Casi todo lo que cobras de mensualidad es por tu tiempo y tu conocimiento.

### Tu tiempo

Tarifas de referencia en Colombia:
- Desarrollador intermedio: $50.000 a $80.000 por hora.
- Senior: $80.000 a $150.000 por hora.

Para tus cálculos usa **$70.000 por hora**.

| Actividad | Horas estimadas |
|---|---|
| Montar un cliente nuevo | 15 a 25 h |
| Soporte y cambios del mes (cliente promedio) | 1 a 3 h |
| Mantenimiento técnico (actualizaciones, seguridad, respaldos) | ~1 h por cliente al mes (se reparte entre todos) |

### Impuestos y formalización

Según cómo estés registrado (persona natural o empresa, responsable o no de IVA), puede que debas cobrar IVA (19%), expedir factura electrónica y tener retenciones. **Consulta con un contador antes de enviar la primera propuesta**, para saber si tus precios van "+ IVA" o ya lo incluyen.

## 4. ¿Vender la página o cobrar mensualidad?

### Las opciones

| | Venta única | Mensualidad (suscripción) | **Híbrido: implementación + mensualidad** |
|---|---|---|---|
| Qué paga el cliente | Todo al inicio | Solo cuotas mensuales | Un pago inicial moderado + cuota mensual |
| Barrera de entrada | Alta (muchos barberos no pueden) | Muy baja | Baja |
| Tu flujo de caja | Un pico y luego nada | Estable pero lento al inicio | **Pago inicial que cubre tu montaje + ingreso estable** |
| Mantenimiento | Aparte (muchos no lo pagan y el sitio se deteriora) | Incluido | Incluido |
| Relación con el cliente | Termina al entregar | Continua | Continua |
| Riesgo | Vendes barato algo que vale más cada año | Se van sin haber cubierto tu montaje | **Bajo: el montaje queda pago** |
| Escala con tu código reutilizable | Mal | Muy bien | **Muy bien** |

### Simulación a 24 meses (plan con tienda)

| Modelo | Mes 0 | Meses 1 a 24 | Total 24 meses |
|---|---|---|---|
| Venta única | $9.500.000 | $0 | **$9.500.000** |
| Venta + mantenimiento | $9.500.000 | $290.000 al mes | $16.460.000 (pocos clientes lo pagan) |
| Solo mensualidad | $0 | $450.000 al mes | $10.800.000 |
| **Híbrido (recomendado)** | **$2.900.000** | **$290.000 al mes** | **$9.860.000** |

Con el híbrido, a los ~23 meses ya cobraste lo mismo que con la venta, pero:
- el cliente pagó mucho menos al inicio (más fácil de cerrar);
- sigue pagando después de los 24 meses;
- tú mantienes la calidad del sitio.

Con 10 clientes son **~$2.900.000 al mes recurrentes** por un trabajo que ya está hecho.

### Recomendación

1. **Ofrece por defecto el híbrido** (implementación + mensualidad), con **permanencia mínima de 12 meses**.
2. **Ten la venta como alternativa** para quien la pida, a un precio alto: estás entregando código que te costó cientos de horas. Si compra, el hosting, el dominio y el mantenimiento corren por su cuenta, y el mantenimiento se contrata aparte.
3. **Descuento por pago anual:** 12 meses por adelantado = 2 meses gratis. Te da caja y amarra al cliente.
4. **El código siempre es tuyo.** Con la mensualidad el cliente tiene una **licencia de uso**. Sus datos (clientes, pedidos, productos), su dominio y su cuenta de Wompi **son de él**. Esto evita conflictos si algún día se va.

## 5. ¿Cobrar por cada cambio?

**No cobres cada cambio pequeño.** Genera fricción ("¿me va a cobrar por cambiar una foto?") y termina en discusiones.

- La mensualidad incluye una cuota de soporte, y el panel de admin ya le permite al cliente hacer casi todo solo.
- Lo que es **nuevo** se cotiza aparte.

Deja claro por escrito qué está incluido y qué no.

### Incluido en la mensualidad

- Hosting, dominio, certificado de seguridad (HTTPS), respaldos y actualizaciones técnicas.
- Soporte por WhatsApp en horario laboral, con respuesta en máximo 1 día hábil.
- **Hasta 2 horas al mes de cambios** de contenido o diseño que el panel no permite. Las horas no son acumulables. Ejemplos:
  - cambiar la foto o el texto del inicio;
  - agregar un barbero con su foto;
  - cambiar colores;
  - poner un banner de temporada.
- Todas las mejoras generales que agregues al sistema para todos tus clientes.

### Lo que el cliente hace solo desde el panel (sin costo, sin llamarte)

- Precios, servicios, productos, fotos de productos y stock.
- Envíos, formas de pago y enlace de cursos.
- Estados de pedidos y citas.

### Se cobra aparte

| Tipo | Ejemplo | Precio sugerido |
|---|---|---|
| Hora adicional | Cambios que pasen de las 2 horas del mes | $80.000 por hora |
| Paquete de horas | 5 horas a usar en 3 meses | $350.000 |
| Función nueva pequeña | Cupones de descuento, reseñas en la página, nueva sección | $300.000 a $800.000 |
| Función nueva mediana | Programa de fidelización, recordatorios automáticos por WhatsApp o correo | $800.000 a $2.000.000 |
| Integración externa | Facturación electrónica, transportadora con guías automáticas | Cotizar por proyecto |

**Tip:** si una función pedida por un cliente sirve para todos, cóbrasela a precio reducido y añádela al producto. Así mejora tu producto y lo financia el cliente que la pidió.

## 6. Precios sugeridos

| Plan | Incluye | Implementación | Mensualidad |
|---|---|---|---|
| **Esencial** | Sitio de marca + reservas en línea + panel (servicios, citas, barberos) | $1.500.000 | $180.000 |
| **Pro** (el de El Acicale) | Esencial + tienda + inventario + pagos en línea + pedidos + cursos | $2.900.000 | $290.000 |
| **Premium** | Pro + app móvil en App Store y Google Play con notificaciones | $6.900.000 | $450.000 |
| **Compra del código** | Plan Pro instalado en la cuenta del cliente, sin mensualidad | $9.500.000 | Mantenimiento opcional desde $290.000 |

Argumento de venta para el plan Pro: **"menos de $10.000 al día, lo que vale un corte a la semana"**.

### Para El Acicale (primer cliente)

Ofrécele el **plan Pro con precio de lanzamiento**:
- implementación de $1.900.000 en lugar de $2.900.000;
- $290.000 al mes;
- 12 meses de permanencia.

A cambio pídele:
- permiso para usar su página como **caso de éxito** en tu portafolio;
- un **testimonio en video** a los 3 meses;
- que te recomiende con otros barberos (por ejemplo, un mes gratis por cada cliente que te traiga).

Como es embajador de Cacique, esa red de barberías es tu mejor canal de venta.

## 7. La oportunidad de la app móvil

Una app hace que el cliente final (el que se corta el pelo) tenga la barbería **en su pantalla de inicio** y reciba **notificaciones**. Eso aumenta reservas y ventas. Es la venta adicional natural después de la página.

### Tres caminos

| Opción | Qué es | Esfuerzo para ti | Costo para el cliente | Recomendación |
|---|---|---|---|---|
| **PWA (app web instalable)** | La misma página, instalable desde el navegador con ícono propio. Notificaciones en Android, y en iPhone si la instala (iOS 16.4 o más reciente). | ~1 a 3 días (ya es Angular) | Bajo | **Inclúyela gratis en el plan Pro como valor agregado** |
| **App en tiendas con Capacitor** | Reutiliza el mismo código Angular y lo publica en App Store y Google Play | ~3 a 6 semanas la primera vez; luego ~1 semana por cliente | Premium | **El producto estrella del plan Premium** |
| App nativa (Swift/Kotlin) | Desarrollo separado para cada sistema | Meses | $15.000.000 a más de $40.000.000 | No vale la pena para este tipo de negocio |

Referencia de mercado: en Colombia una app para pymes cuesta entre **$8 y $20 millones**, y una app con pagos y backend entre $15 y $40 millones. Con Capacitor reutilizas lo que ya tienes, así que puedes ofrecerla por menos y con buen margen.

### Qué debe tener la app

Apple rechaza apps que solo "envuelven" una página web (regla 4.2 de funcionalidad mínima). Por eso la app debe traer cosas propias de una app:

- **Recordatorios de cita** con notificación ("Tu corte es mañana a las 3:00 p. m.").
- **Tarjeta de fidelización:** cada 10 cortes, 1 gratis. Es la función que más le va a gustar al barbero.
- **Reserva en 2 toques** con su barbero favorito guardado.
- **Promociones** por notificación ("2x1 en ceras Cacique este fin de semana").
- Tienda y seguimiento de pedidos.

### Condiciones de la app

- Las cuentas de Apple Developer (USD 99 al año) y Google Play (USD 25 una vez) van **a nombre del cliente**, o de su empresa.
- La mensualidad del plan Premium cubre las actualizaciones obligatorias cuando Apple o Google cambian sus requisitos (pasa cada año).
- La primera app te toma más tiempo; las siguientes, poco. Cuando la hagas para el primer cliente, ya la tienes para todos.

## 8. Protege tu negocio

- **Contrato firmado** con: alcance, precios, permanencia, qué incluye la mensualidad, tiempos de respuesta, propiedad del código (tuya) y de los datos (del cliente).
- **Salida ordenada:**
  - si el cliente cancela, le entregas sus datos exportados y le transfieres el dominio;
  - si quiere quedarse con el sistema, lo compra al precio de "compra del código" menos lo que ya pagó (con un tope).
- **Datos personales:** el barbero es el *responsable* de los datos de sus clientes y tú eres el *encargado* (Ley 1581). Incluye en el contrato una cláusula de transmisión de datos.
- **Un proyecto de Firebase por cliente:** así los datos y los costos quedan separados, y una falla en uno no afecta a los demás. Hoy El Acicale comparte el de BarberCali; sepáralos antes de lanzar.
- **Pagos por adelantado:** la mensualidad se paga los primeros días del mes. Si pasan 15 días sin pago, se suspende el sitio (déjalo por escrito).
- **Facturación:** define con tu contador cómo facturar, antes del primer cobro.

## 9. Próximos pasos

1. Validar precios y condiciones con tu contador (IVA y facturación).
2. Preparar un contrato modelo (vale la pena pagarle a un abogado una sola vez y reutilizarlo).
3. Mostrarle la demo a El Acicale y cerrar el plan Pro con precio de lanzamiento.
4. Crear su proyecto propio de Firebase, conectar su cuenta de Wompi y publicar en su dominio.
5. Hacer la PWA (poco trabajo, mucho impacto) y tener un video corto de la demo para vender a otras barberías.

---

# Parte 2: Propuesta para el cliente

> Copia desde aquí. Reemplaza lo que está entre [corchetes].

## Propuesta: [Nombre de la barbería] en línea

**Para:** [Nombre del dueño], [Nombre de la barbería]
**De:** [Tu nombre], desarrollador web · [WhatsApp] · [correo]
**Fecha:** [fecha] · **Válida por:** 15 días

### Lo que vas a tener

Una plataforma completa para tu barbería. No es solo una página: es una herramienta para vender más y trabajar con menos esfuerzo.

- **Tu marca en internet:** página rápida y elegante con tu logo, tus colores, tus trabajos (reels de Instagram), tu equipo, horarios y ubicación.
- **Reservas 24/7:** tus clientes eligen barbero, servicio y hora en segundos. Nada de dobles reservas ni de contestar WhatsApp a medianoche.
- **Tienda virtual:** vende tus productos con fotos, precios, presentaciones y ofertas, con entrega a domicilio, envío nacional o para recoger en la barbería.
- **Pagos en línea seguros:** tarjeta, PSE, Nequi y Bancolombia (Wompi). El dinero llega directo a tu cuenta.
- **Control de inventario:** cada venta descuenta el stock sola. Ves qué se está acabando y el historial de movimientos.
- **Tu propio panel:** cambias precios, servicios, productos, fotos y stock tú mismo, desde el celular, sin depender de nadie.
- **Pedidos y citas en un solo lugar,** con aviso cuando entra un pedido nuevo.
- **Botón de cursos:** lleva a tus clientes a tu página de cursos.
- **Cumplimiento legal:** política de tratamiento de datos (Ley 1581) y autorización de tus clientes.

### Planes

| | **Esencial** | **Pro** (recomendado) | **Premium** |
|---|:-:|:-:|:-:|
| Página con tu marca | Sí | Sí | Sí |
| Reservas en línea | Sí | Sí | Sí |
| Panel de administración | Sí | Sí | Sí |
| Tienda virtual + pagos en línea | | Sí | Sí |
| Inventario y pedidos | | Sí | Sí |
| Sección de cursos | | Sí | Sí |
| Instalable en el celular (app web) | | Sí | Sí |
| **App en App Store y Google Play** | | | Sí |
| Notificaciones y recordatorios de citas | | | Sí |
| Tarjeta de fidelización (sellos por corte) | | | Sí |
| **Implementación (pago único)** | **$1.500.000** | **$2.900.000** | **$6.900.000** |
| **Mensualidad** | **$180.000** | **$290.000** | **$450.000** |

[Si aplica: Precios + IVA.]

**Pago anual:** paga 12 meses por adelantado y recibe **2 meses gratis**.

### La mensualidad incluye

- Hosting, dominio propio ([tubarberia].com.co), seguridad (HTTPS) y respaldos.
- Actualizaciones y mejoras del sistema sin costo adicional.
- Soporte por WhatsApp de lunes a sábado, con respuesta en máximo 1 día hábil.
- Hasta 2 horas al mes de cambios de diseño o contenido (fotos del inicio, nuevos barberos, banners de temporada…).

**No incluye:**
- funciones nuevas hechas a la medida (se cotizan aparte);
- la comisión de Wompi por cada pago en línea (2,65% + $700 + IVA, se descuenta de la venta);
- las cuentas de Apple y Google para el plan Premium (USD 99 al año y USD 25 una sola vez).

### Tiempos de entrega

- **Esencial:** 1 semana.
- **Pro:** 2 semanas.
- **Premium:** 5 a 6 semanas, contando la aprobación de Apple y Google.

Los tiempos corren desde que recibo tu logo, fotos, lista de servicios y precios.

### Forma de pago

- **Implementación:** 50% para empezar y 50% al publicar.
- **Mensualidad:** se paga los primeros 5 días de cada mes, desde que la página está publicada.
- Medios: transferencia, Nequi o PSE.

### Condiciones

- Permanencia mínima de 12 meses. Después puedes cancelar avisando con 30 días de anticipación.
- El dominio, tu cuenta de Wompi y todos tus datos (clientes, pedidos, productos) **son tuyos**. Si cancelas, te los entrego y te transfiero el dominio.
- El sistema es una licencia de uso mientras la mensualidad esté al día. Si prefieres comprarlo, pregúntame por la opción de compra.

### Siguiente paso

Si te gusta la propuesta, confirmame el plan y empezamos esta misma semana.

[Tu nombre] · [WhatsApp] · [correo]

---

*Fuentes de los precios de referencia (parte 1):*
- [Cuánto cuesta una tienda virtual en Colombia en 2026 (ELSASTO)](https://elsasto.com/blog/cuanto-cuesta-tienda-virtual-colombia)
- [Precio de página web en Colombia 2026 (Cangrejo Digital)](https://cangrejodigital.com/diseno-web/cuanto-cuesta-pagina-web-colombia/)
- [Cuánto cuesta mantener una página web (Sistemas Web Colombia)](https://sistemaswebcolombia.com/blog/cuanto-cuesta-mantener-una-pagina-web/)
- [Cuánto cobra un desarrollador web por hora en Colombia](https://andredesignmarketing.com/cuanto-cobra-un-desarrollador-web/)
- [Cuánto cuesta desarrollar una app en Colombia en 2026 (Pixelia)](https://pixelia.com.co/blog/cuanto-cuesta-desarrollar-app-colombia-2026)
- [Cuánto cuesta desarrollar una app en Colombia (ToGrow)](https://togrowagencia.com/cuanto-cuesta-desarrollar-una-app-colombia/)
- [Precios de dominios .com.co (MI.COM.CO)](https://mi.com.co/precios)
- [Wompi: planes y tarifas](https://wompi.com/es/co/planes-tarifas/)
