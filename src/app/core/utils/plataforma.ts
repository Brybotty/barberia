/**
 * ¿Corre en el navegador? Al compilar, las páginas públicas (inicio, servicios, política e instalar) se arman una
 * vez en Node para entregarlas ya escritas (prerender, ver app.routes.server.ts): ahí no hay ventana, ni
 * almacenamiento, ni hora del visitante. Lo que dependa de eso se deja para cuando la página abre en el navegador.
 */
export const enNavegador = typeof window !== 'undefined' && typeof document !== 'undefined';
