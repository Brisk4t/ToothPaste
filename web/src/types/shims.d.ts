// Ambient declarations for dependencies that ship no types of their own.
// Loosely typed to match actual call sites in this codebase; tighten as
// each consuming file is converted to TypeScript.

declare module "argon2-wasm-esm" {
  export enum ArgonType {
    Argon2d = 0,
    Argon2i = 1,
    Argon2id = 2,
  }

  export interface Argon2HashOptions {
    pass: string;
    salt: string | Uint8Array;
    time?: number;
    mem?: number;
    hashLen?: number;
    parallelism?: number;
    type?: ArgonType;
  }

  export interface Argon2HashResult {
    // Pinned to the ArrayBuffer-backed generic (not the wider ArrayBufferLike
    // default) so this satisfies DOM's BufferSource in crypto.subtle calls.
    hash: Uint8Array<ArrayBuffer>;
    hashHex: string;
    encoded: string;
  }

  const argon2: {
    ArgonType: typeof ArgonType;
    hash(options: Argon2HashOptions): Promise<Argon2HashResult>;
  };

  export default argon2;
}

declare module "secure-web-storage" {
  interface SecureStorageHooks {
    hash: (key: string) => string;
    encrypt: (data: string) => string;
    decrypt: (data: string) => string;
  }

  export default class SecureStorage implements Storage {
    constructor(storage: Storage, hooks: SecureStorageHooks);
    readonly length: number;
    clear(): void;
    getItem(key: string): string | null;
    key(index: number): string | null;
    removeItem(key: string): void;
    setItem(key: string, value: string): void;
    [key: string]: unknown;
  }
}
