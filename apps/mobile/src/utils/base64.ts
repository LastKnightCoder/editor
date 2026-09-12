// ArrayBuffer ↔ base64 字符串互转。
// Android 的 IPC 二进制通道不可靠（tauri#10573），移动端上传/读取统一走
// base64 字符串：单个字符串的 JSON 序列化是 memcpy 级，与逐元素数字数组
// 的序列化开销相差数个量级。

const CHUNK_SIZE = 0x8000;

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK_SIZE));
  }
  return btoa(binary);
}

export function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
