export interface SessionStore<T> {
  read(): T;
  remember(value: T): void;
  write(value: T): void;
  clear(): void;
  reset(): void;
}

export interface SessionStoreOptions<T> {
  key: string;
  fallback: () => T;
  parse: (raw: unknown) => T | null;
  maxBytes: number;
}

export function createSessionStore<T>(
  options: SessionStoreOptions<T>,
): SessionStore<T> {
  const { key, fallback, parse, maxBytes } = options;

  let cached: { value: T } | null = null;

  function readStorage(): T | null {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === null) return null;
      const decoded: unknown = JSON.parse(raw);
      return parse(decoded);
    } catch {
      return null;
    }
  }

  return {
    read(): T {
      if (cached !== null) return cached.value;
      const stored = readStorage();
      const settled = stored === null ? fallback() : stored;
      cached = { value: settled };
      return settled;
    },

    remember(value: T): void {
      cached = { value };
    },

    write(value: T): void {
      cached = { value };
      try {
        const json = JSON.stringify(value);
        if (json.length > maxBytes) return;
        window.localStorage.setItem(key, json);
      } catch {}
    },

    clear(): void {
      cached = { value: fallback() };
      try {
        window.localStorage.removeItem(key);
      } catch {}
    },

    reset(): void {
      cached = null;
    },
  };
}
