// Which devices someone watches, and so which device links (picture stream and
// HID socket, see device-link.ts) stay open. The panel watches the device it
// shows while its surface asks for frames; a page tile watches its device while
// it asks for that device's frames. A link nobody watched within the grace
// period is closed; its helper keeps running until its simulator shuts down.

export type Closable = { close: () => void };

export type LinksDeps<L extends Closable> = {
  open: (udid: string) => L;
  now: () => number;
  graceMs: number;
};

export const createLinks = <L extends Closable>(deps: LinksDeps<L>) => {
  const links = new Map<string, { link: L; pageSeenAt: number }>();
  let panelUdid: string | null = null;
  let panelSeenAt = 0;

  const entry = (udid: string) => {
    let found = links.get(udid);
    if (!found) {
      found = { link: deps.open(udid), pageSeenAt: 0 };
      links.set(udid, found);
    }
    return found;
  };

  const panelWatching = () => deps.now() - panelSeenAt < deps.graceMs;

  /** Is anyone watching `udid` (the panel showing it, or a page tile)? */
  const wanted = (udid: string): boolean =>
    (panelUdid === udid && panelWatching()) || deps.now() - (links.get(udid)?.pageSeenAt ?? 0) < deps.graceMs;

  return {
    /** The link for `udid`, opened when missing. */
    get: (udid: string): L => entry(udid).link,
    /** The link for `udid` if one is open. */
    peek: (udid: string): L | undefined => links.get(udid)?.link,
    /** A page tile asked for `udid`'s frames. */
    seenByPage(udid: string): L {
      const found = entry(udid);
      found.pageSeenAt = deps.now();
      return found.link;
    },
    /** The panel's surface asked for frames. */
    seenByPanel() {
      panelSeenAt = deps.now();
    },
    panelWatching,
    /** The device the panel shows, or `null`. */
    setPanel(udid: string | null) {
      panelUdid = udid;
    },
    wanted,
    /** Devices someone watches. */
    watched: (): string[] => [...links.keys()].filter(wanted),
    /** Closes the links nobody watches; answers the udids closed. */
    sweep(): string[] {
      const closed: string[] = [];
      for (const [udid, found] of links) {
        if (wanted(udid)) continue;
        found.link.close();
        links.delete(udid);
        closed.push(udid);
      }
      return closed;
    },
    /** Closes every link. */
    closeAll() {
      for (const found of links.values()) found.link.close();
      links.clear();
    },
  };
};

export type Links<L extends Closable> = ReturnType<typeof createLinks<L>>;
