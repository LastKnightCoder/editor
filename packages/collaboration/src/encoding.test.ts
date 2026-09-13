import { describe, expect, it } from "vitest";
import { base64ToBytes, bytesToBase64 } from "./encoding";

describe("base64 编解码", () => {
  it("普通内容往返一致", () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 255]);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });

  it("超过单块上限（0x8000）的大数组分块编码后往返一致", () => {
    const bytes = new Uint8Array(0x8000 + 1234);
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = index % 251;
    const encoded = bytesToBase64(bytes);
    expect(encoded.length).toBeGreaterThan(0x8000);
    expect(base64ToBytes(encoded)).toEqual(bytes);
  });

  it("空数组", () => {
    expect(bytesToBase64(new Uint8Array(0))).toBe("");
    expect(base64ToBytes("")).toEqual(new Uint8Array(0));
  });
});
