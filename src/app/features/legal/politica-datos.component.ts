import { Component } from '@angular/core';
import { CLIENTE } from '../../config/cliente';

/**
 * Política de tratamiento de datos personales (Ley 1581 de 2012 y Decreto 1377 de 2013,
 * compilado en el Decreto 1074 de 2015). Los datos del responsable salen de la config del cliente.
 * Es una base razonable, pero conviene que la revise un abogado antes de lanzar.
 */
@Component({
  selector: 'app-politica-datos',
  standalone: true,
  host: { class: 'block' },
  styles: [`
    h2 { @apply font-display text-xl sm:text-2xl font-black text-white mt-12 mb-4 scroll-mt-24; }
    p, li { @apply text-neutral-300 leading-relaxed; }
    p + p { @apply mt-3; }
    ul { @apply list-disc pl-5 space-y-2 mt-3; }
    strong { @apply text-white; }
  `],
  template: `
    <article class="max-w-3xl mx-auto px-4 sm:px-6 py-14 md:py-20">
      <p class="text-detalle-400 text-xs font-extrabold uppercase tracking-[0.3em] mb-4">{{ cliente.nombre }}</p>
      <h1 class="font-display text-3xl sm:text-5xl font-black text-white leading-tight mb-4">Política de tratamiento de datos personales</h1>
      <p class="text-sm text-neutral-500">Vigente desde el {{ cliente.legal.vigenteDesde }}.</p>

      <div class="vidrio rounded-2xl p-5 mt-8">
        <p class="text-sm">
          En {{ cliente.nombre }} cuidamos la información que nos confías cuando reservas o nos escribes.
          Aquí te contamos qué datos usamos, para qué y cómo puedes consultarlos, corregirlos o pedir que los borremos,
          conforme a la Ley 1581 de 2012 y sus decretos reglamentarios.
        </p>
      </div>

      <h2 id="responsable">1. Responsable del tratamiento</h2>
      <ul>
        <li><strong>Responsable:</strong> {{ cliente.legal.razonSocial ?? cliente.nombre }}@if (cliente.legal.nit) {, identificado con NIT/CC {{ cliente.legal.nit }}}.</li>
        @if (cliente.ubicacion; as u) {
          <li><strong>Dirección:</strong> {{ u.direccion }}.</li>
        }
        @if (cliente.legal.correo) {
          <li><strong>Correo:</strong> <a [href]="'mailto:' + cliente.legal.correo" class="underline underline-offset-4 hover:text-white">{{ cliente.legal.correo }}</a></li>
        }
        @if (cliente.whatsapp) {
          <li><strong>WhatsApp:</strong> <a [href]="'https://wa.me/' + cliente.whatsapp" target="_blank" rel="noopener" class="underline underline-offset-4 hover:text-white">+{{ cliente.whatsapp }}</a></li>
        }
        <li><strong>Instagram:</strong> <a [href]="cliente.instagram.url" target="_blank" rel="noopener" class="underline underline-offset-4 hover:text-white">&#64;{{ cliente.instagram.usuario }}</a> (mensaje directo).</li>
      </ul>

      <h2 id="datos">2. Qué datos recolectamos</h2>
      <ul>
        <li><strong>Identificación y contacto:</strong> nombre, correo electrónico de tu cuenta de Google y número de celular.</li>
        <li><strong>Reservas:</strong> servicios reservados, fechas y horas, barbero elegido, valor y estado de cada cita.</li>
        <li><strong>Navegación:</strong> tu sesión la gestiona Google. No usamos cookies de publicidad propias; los videos de Instagram y el mapa de Google que mostramos pueden usar sus propias cookies, según las políticas de esas plataformas.</li>
      </ul>
      <p>No recolectamos datos sensibles (salud, origen étnico, creencias, etc.) ni datos de tarjetas o cuentas bancarias.</p>

      <h2 id="finalidades">3. Para qué los usamos</h2>
      <ul>
        <li>Agendar, confirmar, recordar y gestionar tus citas.</li>
        <li>Comunicarnos contigo por WhatsApp, llamada o correo sobre tus citas.</li>
        <li>Atender tus preguntas, quejas, reclamos y solicitudes de garantía.</li>
        <li>Cumplir obligaciones legales, contables y tributarias (por ejemplo, la facturación).</li>
        <li>Enviarte novedades y promociones, solo si nos das tu autorización para eso. Puedes retirarla cuando quieras.</li>
      </ul>

      <h2 id="terceros">4. Con quién los compartimos</h2>
      <p>No vendemos ni alquilamos tus datos. Solo los compartimos con quienes nos ayudan a prestarte el servicio, que los tratan por nuestra cuenta y con medidas de seguridad:</p>
      <ul>
        <li><strong>Google (Firebase):</strong> aloja la página, las cuentas y la base de datos. Sus servidores pueden estar fuera de Colombia, lo que implica una transmisión internacional de datos a un proveedor con estándares adecuados de protección.</li>
        <li><strong>Resend:</strong> envía los correos de confirmación de tus citas (tu nombre, tu correo y los datos de la cita). Sus servidores están fuera de Colombia.</li>
        <li><strong>Autoridades:</strong> cuando una norma o una orden judicial lo exija.</li>
      </ul>

      <h2 id="derechos">5. Tus derechos</h2>
      <p>Como titular de los datos puedes:</p>
      <ul>
        <li>Conocer, actualizar y rectificar tus datos.</li>
        <li>Pedir prueba de la autorización que nos diste.</li>
        <li>Saber qué uso le hemos dado a tus datos.</li>
        <li>Revocar la autorización y pedir que borremos tus datos, cuando no tengamos un deber legal o contractual de conservarlos.</li>
        <li>Presentar quejas ante la Superintendencia de Industria y Comercio (SIC) después de haber hecho tu consulta o reclamo con nosotros.</li>
        <li>Acceder gratis a tus datos.</li>
      </ul>

      <h2 id="procedimiento">6. Cómo ejercerlos</h2>
      <p>Escríbenos por cualquiera de los canales del punto 1 indicando tu nombre, tu número de celular o correo y lo que necesitas.</p>
      <ul>
        <li><strong>Consultas</strong> (saber qué datos tenemos y cómo los usamos): te respondemos en máximo <strong>10 días hábiles</strong>. Si necesitamos más tiempo te avisamos, y en ningún caso pasaremos de 5 días hábiles adicionales.</li>
        <li><strong>Reclamos</strong> (corregir, actualizar, borrar o revocar la autorización): incluye tu identificación, la descripción de lo que pides, tu dirección o correo de respuesta y los documentos que quieras hacer valer. Te respondemos en máximo <strong>15 días hábiles</strong>, prorrogables hasta 8 días hábiles más, avisándote el motivo.</li>
      </ul>
      <p>También puedes actualizar tu celular en cada reserva y cancelar tus citas pendientes desde "Mis reservas".</p>

      <h2 id="seguridad">7. Seguridad y conservación</h2>
      <p>Tus datos viajan cifrados (HTTPS) y solo acceden a ellos las personas que los necesitan: cada cliente ve únicamente sus propias citas, y el personal accede según su rol.</p>
      <p>Guardamos tus datos mientras tengas una relación con nosotros y durante el tiempo que exijan las normas contables, tributarias y de protección al consumidor. Después los borramos o los anonimizamos.</p>

      <h2 id="autorizacion">8. Autorización</h2>
      <p>Al iniciar sesión o reservar nos autorizas a tratar tus datos según esta política. Guardamos la fecha de esa autorización como prueba. Los menores de edad deben usar el servicio con autorización de su representante legal.</p>

      <h2 id="cambios">9. Cambios a esta política</h2>
      <p>Si cambiamos algo importante, lo publicaremos en esta página con la nueva fecha de vigencia y, si el cambio afecta las finalidades, te pediremos una nueva autorización.</p>
    </article>
  `,
})
export class PoliticaDatosComponent {
  readonly cliente = CLIENTE;
}
