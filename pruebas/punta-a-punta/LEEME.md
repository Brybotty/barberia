# Pruebas de punta a punta

Recorren la página de verdad en un Chrome sin ventana, contra los **emuladores** de Firebase (proyecto
`demo-acicale`). Nunca tocan el proyecto real ni envían correos (los correos quedan en el log del emulador).

| Guion | Qué recorre |
|---|---|
| `1-cliente.cjs` | Lo que recibe Google sin JavaScript (páginas armadas al compilar: titular, texto, canónica, ficha con precios), aviso de cookies, inicio, menú, página que no existe; reservar sin sesión, entrar al final, confirmar; mis reservas, cambiar horario (un solo correo), cancelar, reservar de nuevo y cupo por día |
| `2-equipo.cjs` | Admin: inicio, citas (filtros por barbero con "Tú", por días, buscador, canceladas escondidas y la elección recordada; nueva cita, también después del cierre hasta las 10:00 p. m., y con la duración elegida para ese cliente: horas sin tiempo muerto calculadas con ella), equipo (subida de foto a Storage), usuarios, ajustes de horario y agenda por periodos (abrir, alargar y cerrar, con un visitante que lo ve sin recargar), y servicios habilitados por barbero (solo Premium con uno, el aviso del Inicio y "Habilitar todos"), un día solo para algunos servicios (desde el calendario de Citas: la estrella, lo que ve el cliente con "Cambiar a…", el aviso en Nueva cita y "Abrir todos" en Servicios), caritas de asistencia (de 1 a 5, cliente nuevo, "Sí vino" y la leyenda) y multa por no asistir (activarla en Ajustes, que se ponga sola, cobrarla al marcar "Hecho" en la visita siguiente, quitarla, el resumen en Cortes y ganancias, y lo que ve el cliente al reservar y en Mis reservas). Barbero: agenda (con la carita de cada cliente, también con las faltas que tuvo con otro barbero), recordatorio por WhatsApp, nueva cita para sí mismo después del cierre (sin correos) y con otra duración, sus citas en calendario y en lista (solo las suyas, sin editar ni eliminar), día libre, descanso y cierre de horas |
| `3-celular.cjs` | A 360 y 390 px: nada se sale a lo ancho, textos de 11 px o más, zonas táctiles de 40 px o más, barra de accesos rápidos y hoja de horario, botón de confirmar fijo abajo (sin la barra encima), agendas recurrentes (botón flotante y ventana de tres pasos, en el admin y en el panel del barbero, con su barra de abajo), caritas en la lista y su leyenda, la ventana "¿Qué se reserva este día?", la multa en Ajustes, y la política de seguridad estricta sin bloqueos |
| `4-recurrentes.cjs` | Agendas recurrentes: crear (cliente nuevo, de la lista o sin cliente; duración de 5 en 5, con una de 25 min que deja libre el turno siguiente), horas libres u ocupadas en todas las fechas (también después del cierre, hasta las 10:00 p. m.), la Cloud Function apartando los turnos (sin correos ni avisos), la reserva que ya no ofrece esas horas (y sí la que empieza justo al terminar), el barbero creando las suyas (solo consigo mismo), la marca en la agenda y en el panel del barbero, "Hecho", editar, pausar, reanudar, eliminar y las ganancias. **Necesita el emulador de funciones** |
| `5-precios-y-vinculos.cjs` | Precio propio de un barbero (el admin sube el de Jose sin tocar el de Trip; "Ver el menú de" cada uno) y un servicio propio de Jose (solo con él); lo que ve el visitante en el menú y en la reserva con cada barbero y con "Cualquier barbero"; un cliente que reserva con Jose y paga su precio. Citas que el equipo le registra a un cliente sin cuenta: una del panel con el celular de Sofía (que entró por SMS) y una agenda recurrente con el correo de Andrés; cada uno las ve en "Mis reservas" (con "Pedir otro horario" en vez de "Cambiar horario") y las cancela; los demás no las ven. **Necesita el emulador de funciones** |

## Cómo correrlas

Necesitan Chrome instalado (otra ruta: variable `CHROME`) y los puertos 4300, 8080, 9099, 9199 y 5001 libres.
No hace falta detener `npm start` (usa el 4200).

```bash
node pruebas/punta-a-punta/preparar.cjs                 # agrega el build temporal "verif"
npx ng build --configuration verif
npm --prefix functions run build

# En otra terminal (déjala abierta): los emuladores, guardando su log
FUNCTIONS_DISCOVERY_TIMEOUT=60 npx firebase emulators:start --only auth,firestore,storage,functions \
  --project demo-acicale > pruebas/punta-a-punta/emuladores.log 2>&1

# En otra terminal (déjala abierta): la página, con los encabezados de firebase.json
node pruebas/punta-a-punta/servidor.cjs dist/verif/browser firebase.json 4300

# Cuando el log diga "All emulators ready":
node pruebas/punta-a-punta/1-cliente.cjs
node pruebas/punta-a-punta/2-equipo.cjs
node pruebas/punta-a-punta/3-celular.cjs
node pruebas/punta-a-punta/4-recurrentes.cjs
node pruebas/punta-a-punta/5-precios-y-vinculos.cjs

# Al terminar: cierra las dos terminales y deja el repositorio como estaba
node pruebas/punta-a-punta/preparar.cjs quitar
```

Cada guion deja los emuladores recién sembrados antes de empezar, imprime ✔ o ✘ por comprobación y guarda capturas
en `pruebas/punta-a-punta/capturas/` (si algo falla, `fallo.png` muestra dónde quedó).

En Windows, al cerrar los emuladores puede quedar vivo un proceso `java` en el puerto 8080: ciérralo desde el
Administrador de tareas antes de volver a levantarlos.
