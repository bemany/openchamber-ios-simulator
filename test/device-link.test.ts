import { describe, expect, test } from 'bun:test';

import { createDeviceLink, type LinkContext } from '../src/service/device-link.ts';
import { createFrameHub } from '../src/service/frames.ts';

const context = (booted: boolean) => {
  const helpers: string[] = [];
  const ctx: LinkContext = {
    helperFor: async (udid) => {
      helpers.push(udid);
      throw new Error('no helper in tests');
    },
    forgetHelper: () => undefined,
    name: () => 'Test',
    wanted: () => true,
    booted: async () => booted,
    onFrame: () => undefined,
    onError: () => undefined,
  };
  return { ctx, helpers };
};

describe('device link', () => {
  test('never starts a helper for a device that is off', async () => {
    const { ctx, helpers } = context(false);
    const link = createDeviceLink('PHONE', ctx);
    await link.start();
    expect(helpers).toEqual([]);
    expect(link.running()).toBe(false);
  });

  test('a running device asks for its helper', async () => {
    const { ctx, helpers } = context(true);
    await createDeviceLink('PHONE', ctx).start();
    expect(helpers).toEqual(['PHONE']);
  });

  test('a closed link opens no HID connection', async () => {
    const { ctx, helpers } = context(true);
    const link = createDeviceLink('PHONE', ctx);
    link.close();
    await expect(link.sendRaw(1, {})).rejects.toThrow('closed');
    expect(helpers).toEqual([]);
  });

  test('frame numbers go on in the hub a new link is given', () => {
    const hub = createFrameHub();
    const frame = { data: Buffer.from([1]), mime: 'image/jpeg' as const, width: 1, height: 1, title: '' };
    hub.publish(frame);
    hub.publish(frame);
    const link = createDeviceLink('PHONE', context(true).ctx, hub);
    expect(link.hub.publish(frame).seq).toBe(3);
  });
});
