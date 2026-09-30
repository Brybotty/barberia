/** Tamaño máximo de la foto ya comprimida. Firestore admite hasta 1 MB por documento. */
const MAX_BYTES = 300 * 1024;

/**
 * Reduce y comprime una foto en el navegador (WebP, o JPEG si el navegador no sabe hacer WebP)
 * y la devuelve como data URL para guardarla en el propio documento del producto.
 * Así no hace falta Firebase Storage.
 */
export async function comprimirImagen(archivo: File): Promise<string> {
  if (!archivo.type.startsWith('image/')) throw new Error('El archivo no es una imagen.');
  const bitmap = await createImageBitmap(archivo);
  try {
    for (const [lado, calidad] of [[900, 0.82], [800, 0.72], [640, 0.65], [520, 0.55]] as const) {
      const url = dibujar(bitmap, lado, calidad);
      // Longitud del data URL ≈ bytes * 4/3.
      if (url.length * 0.75 <= MAX_BYTES) return url;
    }
    throw new Error('La imagen es demasiado pesada incluso comprimida. Prueba con otra.');
  } finally {
    bitmap.close();
  }
}

function dibujar(bitmap: ImageBitmap, lado: number, calidad: number): string {
  const escala = Math.min(1, lado / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const webp = canvas.toDataURL('image/webp', calidad);
  return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', calidad);
}
