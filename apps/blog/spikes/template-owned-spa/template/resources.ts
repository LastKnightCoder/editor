export async function readVerified(
  url: string,
  integrity: string,
  signal?: AbortSignal
): Promise<string> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`RESOURCE_LOAD_FAILED：HTTP ${response.status}`);
  const bytes = await response.arrayBuffer();
  const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
  if (hash !== integrity) throw new Error("INTEGRITY_MISMATCH：资源摘要错误");
  return new TextDecoder().decode(bytes);
}
