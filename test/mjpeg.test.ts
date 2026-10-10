import { describe, expect, test } from 'bun:test';

import { createMjpegParser, jpegSize } from '../src/service/mjpeg.ts';

/** A minimal JPEG-like byte string: SOI, APP0, SOF0 with the given size, EOI. */
const fakeJpeg = (width: number, height: number, filler = 0): Buffer =>
  Buffer.from([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x04, filler, filler,
    0xff, 0xc0, 0x00, 0x0b, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x01, 0x01, 0x11, 0x00,
    0xff, 0xd9,
  ]);

const part = (jpeg: Buffer, withLength = true) =>
  Buffer.concat([
    Buffer.from(`--frame\r\nContent-Type: image/jpeg\r\n${withLength ? `Content-Length: ${jpeg.length}\r\n` : ''}\r\n`),
    jpeg,
    Buffer.from('\r\n'),
  ]);

describe('mjpeg', () => {
  test('reads the size from the SOF marker', () => {
    expect(jpegSize(fakeJpeg(1206, 2622))).toEqual({ width: 1206, height: 2622 });
    expect(jpegSize(Buffer.from('nope'))).toBeNull();
  });

  test('splits a stream fed byte by byte', () => {
    const frames: Buffer[] = [];
    const parser = createMjpegParser((jpeg) => frames.push(jpeg));
    const stream = Buffer.concat([part(fakeJpeg(10, 20)), part(fakeJpeg(30, 40, 0xd9))]);
    for (const byte of stream) parser.push(Buffer.from([byte]));
    expect(frames.map((frame) => jpegSize(frame))).toEqual([
      { width: 10, height: 20 },
      { width: 30, height: 40 },
    ]);
  });

  test('uses Content-Length so an EOI-looking byte pair inside the image does not cut it', () => {
    const frames: Buffer[] = [];
    const parser = createMjpegParser((jpeg) => frames.push(jpeg));
    // filler 0xd9 after 0xff would look like EOI to a naive scan
    const tricky = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0xff, 0xd9, 0xff, 0xd9]);
    parser.push(part(tricky));
    expect(frames).toHaveLength(1);
    expect(frames[0]!.length).toBe(tricky.length);
  });

  test('falls back to the EOI marker without Content-Length', () => {
    const frames: Buffer[] = [];
    const parser = createMjpegParser((jpeg) => frames.push(jpeg));
    parser.push(Buffer.concat([part(fakeJpeg(5, 6), false), part(fakeJpeg(7, 8), false)]));
    expect(frames.map((frame) => jpegSize(frame))).toEqual([
      { width: 5, height: 6 },
      { width: 7, height: 8 },
    ]);
  });
});
