// lib 不含 DOM；以下全局在浏览器与 Node（≥ 16）都存在，只声明用到的部分
declare const console: { log(...args: unknown[]): void; warn(...args: unknown[]): void };
declare function atob(data: string): string;
declare function btoa(data: string): string;
declare function unescape(value: string): string;
declare function encodeURIComponent(value: string): string;
declare class TextDecoder {
  constructor(label?: string);
  decode(input?: Uint8Array): string;
}
declare class TextEncoder {
  encode(input?: string): Uint8Array;
}
