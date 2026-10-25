// Prefixed local storage. All your github.io sites share one origin, so every
// key here starts with a prefix unique to this game.
const PREFIX = 'shivanag.cricket.v1.';

type RawStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface KV {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
  readonly persistent: boolean;
}

export class Store implements KV {
  private mem = new Map<string, string>();
  readonly persistent: boolean;

  constructor(private ls: RawStorage | null = defaultStorage()) {
    this.persistent = ls !== null;
  }

  get(key: string): string | null {
    let v: string | null = null;
    if (this.ls) {
      try {
        v = this.ls.getItem(PREFIX + key);
      } catch {
        v = null;
      }
    }
    return v ?? this.mem.get(key) ?? null;
  }

  set(key: string, value: string): void {
    this.mem.set(key, value);
    if (this.ls) {
      try {
        this.ls.setItem(PREFIX + key, value);
      } catch {
        /* quota or blocked: memory copy still works for this session */
      }
    }
  }

  remove(key: string): void {
    this.mem.delete(key);
    if (this.ls) {
      try {
        this.ls.removeItem(PREFIX + key);
      } catch {
        /* ignore */
      }
    }
  }
}

function defaultStorage(): RawStorage | null {
  try {
    if (typeof window === 'undefined') return null;
    const s = window.localStorage;
    const probe = PREFIX + '__probe';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}
