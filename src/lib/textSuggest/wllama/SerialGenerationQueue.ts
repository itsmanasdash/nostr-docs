/** Prevent overlapping Wllama WebGPU/WASM completions. */
export class SerialGenerationQueue {
  private tail: Promise<void> = Promise.resolve();

  async run<T>(task: () => Promise<T>): Promise<T> {
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    try {
      await previous;
      return await task();
    } finally {
      release();
    }
  }

  async idle(): Promise<void> {
    await this.tail;
  }
}
