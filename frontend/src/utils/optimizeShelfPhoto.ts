export interface OptimizedShelfPhoto {
  file: File;
  originalBytes: number;
  optimizedBytes: number;
  width: number;
  height: number;
  wasResized: boolean;
}

const MAX_EDGE_PX = 1600;
const JPEG_QUALITY = 0.82;

function loadImageFromFile(file: File): Promise<{
  source: CanvasImageSource;
  width: number;
  height: number;
  cleanup: () => void;
}> {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file).then((bitmap) => ({
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      cleanup: () => bitmap.close(),
    }));
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      reject(new Error('Image decode timed out.'));
    }, 5000);
    img.onload = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve({
        source: img,
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height,
        cleanup: () => URL.revokeObjectURL(url),
      });
    };
    img.onerror = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      URL.revokeObjectURL(url);
      reject(new Error('Could not decode image.'));
    };
    img.src = url;
  });
}

/**
 * Downscales & JPEG-compresses a shelf photo client-side before sending to Gemini.
 * Keeps spine text crisp (up to 1600px longest edge) while cutting upload size &
 * Gemini vision token usage dramatically for free-tier efficiency.
 */
export async function optimizeShelfPhoto(file: File): Promise<OptimizedShelfPhoto> {
  try {
    const decoded = await loadImageFromFile(file);
    try {
      const { width, height } = decoded;
      if (!width || !height) {
        return {
          file,
          originalBytes: file.size,
          optimizedBytes: file.size,
          width: 0,
          height: 0,
          wasResized: false,
        };
      }

      const longest = Math.max(width, height);
      const scale = longest > MAX_EDGE_PX ? MAX_EDGE_PX / longest : 1;
      const targetW = Math.max(1, Math.round(width * scale));
      const targetH = Math.max(1, Math.round(height * scale));

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return {
          file,
          originalBytes: file.size,
          optimizedBytes: file.size,
          width,
          height,
          wasResized: false,
        };
      }

      ctx.drawImage(decoded.source, 0, 0, targetW, targetH);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY)
      );

      if (!blob) {
        return {
          file,
          originalBytes: file.size,
          optimizedBytes: file.size,
          width,
          height,
          wasResized: false,
        };
      }

      // Only use re-encoded file if it's smaller or was downscaled
      if (blob.size >= file.size && scale === 1 && file.type === 'image/jpeg') {
        return {
          file,
          originalBytes: file.size,
          optimizedBytes: file.size,
          width,
          height,
          wasResized: false,
        };
      }

      const baseName = file.name.replace(/\.[^.]+$/, '') || 'shelf-photo';
      const optimizedFile = new File([blob], `${baseName}.jpg`, {
        type: 'image/jpeg',
        lastModified: Date.now(),
      });

      return {
        file: optimizedFile,
        originalBytes: file.size,
        optimizedBytes: optimizedFile.size,
        width: targetW,
        height: targetH,
        wasResized: scale < 1,
      };
    } finally {
      decoded.cleanup();
    }
  } catch {
    return {
      file,
      originalBytes: file.size,
      optimizedBytes: file.size,
      width: 0,
      height: 0,
      wasResized: false,
    };
  }
}
