// base64 ↔ Uint8Array：Yjs 全量 state 经 REST 传输的编码契约（此前为移动端私有实现）。
// WebView 无 Node Buffer，String.fromCharCode(...bytes) 直接展开会超参数上限，须分块。
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
