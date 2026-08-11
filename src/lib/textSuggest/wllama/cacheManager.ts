import { CacheManager } from "@wllama/wllama/esm/index.js";

class InMemoryStorageBackend {
  private files = new Map<string, Blob>();

  isSupported(): boolean {
    return true;
  }

  read(key: string): Promise<Blob | null> {
    return Promise.resolve(this.files.get(key) ?? null);
  }

  async write(key: string, stream: ReadableStream): Promise<void> {
    this.files.set(key, await new Response(stream).blob());
  }

  getSize(key: string): Promise<number> {
    return Promise.resolve(this.files.get(key)?.size ?? -1);
  }

  list(): Promise<Array<{ key: string; size: number }>> {
    return Promise.resolve(
      Array.from(this.files, ([key, file]) => ({ key, size: file.size })),
    );
  }

  delete(key: string): Promise<void> {
    this.files.delete(key);
    return Promise.resolve();
  }
}

export function createCacheManager(): CacheManager {
  try {
    return new CacheManager();
  } catch {
    // Capacitor WebViews may not expose OPFS. A selected File does not need a
    // persistent cache, but Wllama still requires a supported cache backend.
    return new CacheManager([new InMemoryStorageBackend()]);
  }
}
