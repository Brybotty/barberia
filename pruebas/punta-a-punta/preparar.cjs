// Prepara (o deshace, con "quitar") el build temporal de las pruebas de punta a punta:
// la configuración "verif" de angular.json y src/environments/environment.verif.ts, que conectan la página
// a los emuladores de Auth, Firestore y Storage con cuentas de prueba (nunca al proyecto real).
//
//   node pruebas/punta-a-punta/preparar.cjs          # agrega
//   node pruebas/punta-a-punta/preparar.cjs quitar   # deja el repositorio como estaba
const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..', '..');
const ANGULAR = path.join(RAIZ, 'angular.json');
const ENTORNO = path.join(RAIZ, 'src', 'environments', 'environment.verif.ts');
const quitar = process.argv[2] === 'quitar';

const angular = JSON.parse(fs.readFileSync(ANGULAR, 'utf8'));
const configuraciones = angular.projects.barberia.architect.build.configurations;

if (quitar) {
  delete configuraciones.verif;
  fs.rmSync(ENTORNO, { force: true });
  fs.rmSync(path.join(RAIZ, 'dist', 'verif'), { recursive: true, force: true });
} else {
  configuraciones.verif = {
    optimization: false,
    extractLicenses: false,
    sourceMap: false,
    outputPath: 'dist/verif',
    // Igual que producción: las páginas públicas se arman al compilar (ver src/app/app.routes.server.ts).
    server: 'src/main.server.ts',
    outputMode: 'static',
    fileReplacements: [{ replace: 'src/environments/environment.ts', with: 'src/environments/environment.verif.ts' }],
  };
  fs.writeFileSync(ENTORNO, [
    '// TEMPORAL: lo crea pruebas/punta-a-punta/preparar.cjs y lo borra con "quitar". No se sube al repositorio.',
    'export const environment = {',
    '  emuladores: true,',
    '  authEmulador: true,',
    '};',
    '',
  ].join('\n'));
}
fs.writeFileSync(ANGULAR, JSON.stringify(angular, null, 2) + '\n');
console.log(quitar ? 'Listo: se quitó la configuración temporal "verif".' : 'Listo: ahora corre  npx ng build --configuration verif');
