/**
 * 配对校验码（Short Authentication String）：扩展与桌面各出一个随机数，双方用同一函数推导 4 位数字。
 * 冒充者无法让两端显示同一组数字，用户比对一致再点「允许」即可确认批准的是眼前这个扩展。
 *
 * 只用 WebCrypto（浏览器与 Node 18+ 都有 globalThis.crypto.subtle），两端共用这一份实现。
 */

export const SAS_DIGITS = 4;

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");

/** 生成 hex 随机串（默认 16 字节） */
export const randomHex = (bytes = 16): string =>
  toHex(globalThis.crypto.getRandomValues(new Uint8Array(bytes)));

export const isNonce = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{32,128}$/.test(value);

export async function deriveSas(extensionNonce: string, appNonce: string): Promise<string> {
  const data = new TextEncoder().encode(
    `tau-companion-sas\u0000${extensionNonce}\u0000${appNonce}`
  );
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", data));
  const value = ((digest[0] << 24) | (digest[1] << 16) | (digest[2] << 8) | digest[3]) >>> 0;
  return String(value % 10 ** SAS_DIGITS).padStart(SAS_DIGITS, "0");
}
