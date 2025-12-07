declare global {
  namespace NodeJS {
    type Timeout = number;
  }

  interface Buffer extends Uint8Array {
    toString(encoding?: string): string;
  }

  const Buffer: {
    from(
      input: string | ArrayBuffer | ArrayLike<number>,
      encoding?: string,
    ): Buffer;
    alloc(size: number): Buffer;
    byteLength(input: string, encoding?: string): number;
  };

  const process: {
    env: Record<string, string | undefined>;
    cwd(): string;
    platform: string;
  };
}

export {};
