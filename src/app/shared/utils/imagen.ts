/**
 * Prepara una foto para subirla a Firebase Storage: lado mayor de hasta 1200 px, en WebP
 * (o JPEG si el navegador no sabe hacer WebP). Una foto de celular de 4 MB queda en unos 100-200 KB.
 */
export async function prepararFoto(archivo: File, lado = 1200, calidad = 0.85): Promise<Blob> {
  const bitmap = await abrir(archivo);
  try {
    const canvas = dibujar(bitmap, lado);
    const webp = await aBlob(canvas, 'image/webp', calidad);
    // Safari antiguo ignora 'image/webp' y entrega PNG (pesado): en ese caso, JPEG.
    return webp?.type === 'image/webp' ? webp : (await aBlob(canvas, 'image/jpeg', calidad))!;
  } finally {
    bitmap.close();
  }
}

async function abrir(archivo: File): Promise<ImageBitmap> {
  if (!archivo.type.startsWith('image/')) throw new Error('El archivo no es una imagen.');
  try {
    // Respeta la orientación EXIF: las fotos de celular no quedan acostadas.
    return await createImageBitmap(archivo, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('No pudimos abrir esa imagen. Prueba con una foto JPG, PNG o WebP.');
  }
}

function dibujar(bitmap: ImageBitmap, lado: number): HTMLCanvasElement {
  const escala = Math.min(1, lado / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function aBlob(canvas: HTMLCanvasElement, tipo: string, calidad: number): Promise<Blob | null> {
  return new Promise(resolver => canvas.toBlob(resolver, tipo, calidad));
}
