// Servidor estático para revisar un build (puerto 4300), con las mismas cabeceras de firebase.json
// (el emulador de Hosting las ignora). Las rutas sin extensión sirven index.html, como en Hosting.
// Uso: node pruebas/punta-a-punta/servidor.cjs <carpeta del build> <firebase.json> [puerto]
const http = require('http');
const fs = require('fs');
const path = require('path');

const [, , carpeta = 'dist/verif/browser', rutaFirebase = 'firebase.json', puerto = '4300'] = process.argv;
const base = path.resolve(carpeta);

const cabeceras = {};
for (const h of JSON.parse(fs.readFileSync(rutaFirebase, 'utf8')).hosting.headers.find(x => x.source === '**').headers) {
  let valor = h.value;
  // En http://localhost: sin "upgrade-insecure-requests" (rompería la carga) y con permiso para los emuladores.
  if (h.key === 'Content-Security-Policy') valor = valor.replace('; upgrade-insecure-requests', '');
  if (h.key === 'Content-Security-Policy-Report-Only') {
    valor = valor
      .replace("connect-src 'self'", "connect-src 'self' http://127.0.0.1:* ws://127.0.0.1:* http://localhost:* ws://localhost:*")
      .replace('frame-src ', 'frame-src http://127.0.0.1:* ')
      .replace("img-src 'self'", "img-src 'self' http://127.0.0.1:*");
  }
  if (h.key === 'Strict-Transport-Security') continue;
  cabeceras[h.key] = valor;
}

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml',
};

http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  let archivo = path.join(base, url);
  // Nada fuera de la carpeta del build.
  if (archivo !== base && !archivo.startsWith(base + path.sep)) { res.writeHead(403).end(); return; }
  if (!path.extname(url) || !fs.existsSync(archivo)) archivo = path.join(base, 'index.html');
  fs.readFile(archivo, (error, datos) => {
    if (error) { res.writeHead(404).end('no encontrado'); return; }
    res.writeHead(200, { ...cabeceras, 'Content-Type': TIPOS[path.extname(archivo)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(datos);
  });
}).listen(Number(puerto), '127.0.0.1', () => console.log('sirviendo', base, 'en http://localhost:' + puerto));
