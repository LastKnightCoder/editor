import { createServer } from "node:http";

export async function serveHistory(authority, { dropReplyOnce = false } = {}) {
  const server = createServer(async (request, response) => {
    try {
      if (request.method !== "POST" || !["/recover", "/checkpoint"].includes(request.url)) {
        response.writeHead(404).end();
        return;
      }
      const chunks = [];
      let bytes = 0;
      for await (const chunk of request) {
        bytes += chunk.length;
        if (bytes > 16 * 1024 * 1024) throw new Error("RECOVERY_REQUEST_TOO_LARGE");
        chunks.push(chunk);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      let result;
      if (request.url === "/recover") {
        authority.recoverArchive(body.archive);
        result = {
          acknowledged: body.archive.map(entry =>
            authority.receipt(entry.batch.device, entry.batch.sequence)
          ),
        };
      } else result = authority.createCheckpoint();
      if (dropReplyOnce) {
        dropReplyOnce = false;
        response.destroy();
        return;
      }
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify(result));
    } catch (error) {
      response
        .writeHead(409, { "content-type": "application/json" })
        .end(JSON.stringify({ error: error.message }));
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close(error => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  };
}

export async function recoverOverHttp(
  replica,
  url,
  { pageBytes = 256 * 1024, pageEntries = 128, afterPage, ...options } = {}
) {
  if (
    !Number.isSafeInteger(pageBytes) ||
    pageBytes < 1 ||
    pageBytes > 16 * 1024 * 1024 ||
    !Number.isSafeInteger(pageEntries) ||
    pageEntries < 1
  )
    throw new Error("RECOVERY_PAGE_LIMIT");
  const post = async (path, body) => {
    const response = await fetch(`${url}/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error);
    return payload;
  };
  let page = [];
  let bytes = 16;
  let index = 0;
  const send = async () => {
    const result = await post("recover", { archive: page });
    for (const entry of page)
      if (
        !result.acknowledged.some(
          receipt =>
            receipt.device === entry.batch.device &&
            receipt.sequence === entry.batch.sequence &&
            receipt.fingerprint === entry.fingerprint
        )
      )
        throw new Error("RECOVERY_ACK_MISMATCH");
    page = [];
    bytes = 16;
    await afterPage?.(++index);
  };
  for (const entry of replica.exportRecoveryArchive({ includeRelay: true })) {
    const size = Buffer.byteLength(JSON.stringify(entry)) + 1;
    if (size + 16 > pageBytes) throw new Error("RECOVERY_ENTRY_REQUIRES_STREAMING");
    if (page.length && (bytes + size > pageBytes || page.length >= pageEntries)) await send();
    page.push(entry);
    bytes += size;
  }
  if (page.length) await send();
  const payload = await post("checkpoint", {});
  replica.installCheckpoint(payload, { reincarnate: true, ...options });
  return payload;
}
