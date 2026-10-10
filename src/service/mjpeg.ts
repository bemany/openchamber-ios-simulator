// serve-sim sends `multipart/x-mixed-replace` with one JPEG per part. The
// parser finds each JPEG by its start marker and the part's Content-Length,
// falling back to the end marker, which keeps it small and indifferent to
// boundary and header spelling.

const SOI = Buffer.from([0xff, 0xd8, 0xff]);
const EOI = Buffer.from([0xff, 0xd9]);
const MAX_BUFFER = 16 * 1024 * 1024;

export type JpegSize = { width: number; height: number };

/**
 * Takes bytes in chunks of any size and hands every complete JPEG to
 * `onFrame`. With a `Content-Length` in the part header that length decides
 * where the image ends; without one, the first EOI marker does.
 */
export const createMjpegParser = (onFrame: (jpeg: Buffer) => void) => {
  let buffer: Buffer = Buffer.alloc(0);

  const contentLength = (head: Buffer): number | null => {
    const match = /content-length:\s*(\d+)/i.exec(head.toString('latin1'));
    return match ? Number(match[1]) : null;
  };

  const drain = () => {
    for (;;) {
      const start = buffer.indexOf(SOI);
      if (start < 0) {
        // No image start yet: keep only a short tail in case a marker was split.
        if (buffer.length > 4096) buffer = buffer.subarray(buffer.length - 2);
        return;
      }
      const length = contentLength(buffer.subarray(0, start));
      let end: number;
      if (length !== null && length > 0) {
        if (buffer.length < start + length) return;
        end = start + length;
      } else {
        const eoi = buffer.indexOf(EOI, start + 2);
        if (eoi < 0) {
          if (buffer.length > MAX_BUFFER) buffer = Buffer.alloc(0);
          return;
        }
        end = eoi + 2;
      }
      onFrame(Buffer.from(buffer.subarray(start, end)));
      buffer = buffer.subarray(end);
    }
  };

  return {
    push(chunk: Buffer) {
      buffer = buffer.length === 0 ? chunk : Buffer.concat([buffer, chunk]);
      drain();
    },
    reset() {
      buffer = Buffer.alloc(0);
    },
  };
};

/** Width and height from the first SOF marker, or `null`. */
export const jpegSize = (jpeg: Buffer): JpegSize | null => {
  if (jpeg.length < 4 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 4 <= jpeg.length) {
    if (jpeg[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = jpeg[offset + 1]!;
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const length = jpeg.readUInt16BE(offset + 2);
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      if (offset + 9 > jpeg.length) return null;
      return { height: jpeg.readUInt16BE(offset + 5), width: jpeg.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  return null;
};
