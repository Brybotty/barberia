# Pruebas de punta a punta

Recorren la página de verdad en un Chrome sin ventana, contra los **emuladores** de Firebase (proyecto
`demo-acicale`). Nunca tocan el proyecto real ni envían correos (los correos quedan en el log del emulador).

| Guion | Qué recorre |
|---|---|
| `1-cliente.cjs` | Aviso de cookies, inicio, menú, página que no existe; reservar sin sesión, entrar al final, confirmar; mis reservas, cambiar horario (un solo correo), cancelar, reservar de nuevo y cupo por día |
| `2-equipo.cjs` | Admin: inicio, citas, equipo (subida de foto a Storage), usuarios, ajustes de horario y agenda por periodos (abrir, alargar y cerrar, con un visitante que lo ve sin recargar). Barbero: agenda, recordatorio por WhatsApp, día libre, descanso y cierre de horas |
| `3-celular.cjs` | A 360 y 390 px: nada se sale a lo ancho, textos de 11 px o más, zonas táctiles de 40 px o más, barra de accesos rápidos y hoja de horario, botón de confirmar fijo abajo (sin la barra encima), agendas recurrentes (botón flotante y ventana de tres pasos), y la política de seguridad estricta sin bloqueos |
| `4-recurrentes.cjs` | Agendas recurrentes: crear (cliente nuevo, de la lista o sin cliente), horas libres u ocupadas en todas las fechas, la Cloud Function apartando los turnos (sin correos ni avisos), la reserva que ya no ofrece esas horas, la marca en la agenda y en el panel del barbero, "Hecho", editar, pausar, reanudar, eliminar y las ganancias. **Necesita el emulador de funciones** |

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

# Al terminar: cierra las dos terminales y deja el repositorio como estaba
node pruebas/punta-a-punta/preparar.cjs quitar
```

Cada guion deja los emuladores recién sembrados antes de empezar, imprime ✔ o ✘ por comprobación y guarda capturas
en `pruebas/punta-a-punta/capturas/` (si algo falla, `fallo.png` muestra dónde quedó).

En Windows, al cerrar los emuladores puede quedar vivo un proceso `java` en el puerto 8080: ciérralo desde el
Administrador de tareas antes de volver a levantarlos.
