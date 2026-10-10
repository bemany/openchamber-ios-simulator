// Just enough PNG for the device frame: `sips` writes 8-bit RGBA, and the
// page gets the finished frame back as PNG. Non-interlaced, 8 bits per
// channel, grey/RGB with or without alpha.
import { deflateSync, inflateSync } from 'node:zlib';

export type Rgba = { width: number; height: number; data: Uint8Array };

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 4: 2, 6: 4 };

const paeth = (a: number, b: number, c: number): number => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

export const decodePng = (png: Buffer): Rgba => {
  if (png.length < 8 || !png.subarray(0, 8).equals(SIGNATURE)) throw new Error('Not a PNG');
  let width = 0;
  let height = 0;
  let channels = 0;
  const idat: Buffer[] = [];
  for (let offset = 8; offset + 8 <= png.length; ) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('latin1', offset + 4, offset + 8);
    const body = png.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      const depth = body[8];
      channels = CHANNELS[body[9] ?? -1] ?? 0;
      if (depth !== 8 || !channels || body[12] !== 0) throw new Error('Unsupported PNG (8-bit, non-interlaced only)');
    } else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    offset += 12 + length;
  }
  if (!width || !height) throw new Error('PNG without a header');

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const lines = new Uint8Array(height * stride);
  let previous = new Uint8Array(stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = lines.subarray(y * stride, (y + 1) * stride);
    line.set(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? line[x - channels]! : 0;
      const up = previous[x]!;
      const corner = x >= channels ? previous[x - channels]! : 0;
      switch (filter) {
        case 1:
          line[x] = (line[x]! + left) & 255;
          break;
        case 2:
          line[x] = (line[x]! + up) & 255;
          break;
        case 3:
          line[x] = (line[x]! + ((left + up) >> 1)) & 255;
          break;
        case 4:
          line[x] = (line[x]! + paeth(left, up, corner)) & 255;
          break;
      }
    }
    previous = line;
  }

  if (channels === 4) return { width, height, data: lines };
  const data = new Uint8Array(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    const from = index * channels;
    const to = index * 4;
    const grey = channels <= 2;
    data[to] = lines[from]!;
    data[to + 1] = grey ? lines[from]! : lines[from + 1]!;
    data[to + 2] = grey ? lines[from]! : lines[from + 2]!;
    data[to + 3] = channels === 2 ? lines[from + 1]! : channels === 4 ? lines[from + 3]! : 255;
  }
  return { width, height, data };
};

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

const crc32 = (bytes: Uint8Array): number => {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 255]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const chunk = (type: string, body: Uint8Array): Buffer => {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
  return Buffer.concat([head, body, crc]);
};

/** RGBA to PNG, filter "up" on every line: cheap and small for a mostly flat frame. */
export const encodePng = ({ width, height, data }: Rgba): Buffer => {
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y += 1) {
    const out = y * (stride + 1);
    raw[out] = 2;
    for (let x = 0; x < stride; x += 1) {
      const value = data[y * stride + x]!;
      const up = y > 0 ? data[(y - 1) * stride + x]! : 0;
      raw[out + 1 + x] = (value - up) & 255;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([SIGNATURE, chunk('IHDR', header), chunk('IDAT', deflateSync(raw, { level: 6 })), chunk('IEND', new Uint8Array(0))]);
};
