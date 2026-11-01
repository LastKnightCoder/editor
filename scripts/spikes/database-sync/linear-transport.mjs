import { createServer } from "node:http";

export async function serveLinear(authority, { dropReplyOnce = false } = {}) {
  const server = createServer(async (request, response) => {
    try {
      if (request.method === "GET" && request.url === "/branches") {
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify(authority.branches()));
        return;
      }
      if (request.method !== "POST" || !["/linear-sync", "/choose"].includes(request.url)) {
        response.writeHead(404).end();
        return;
      }
      const chunks = [];
      let bytes = 0;
      for await (const chunk of request) {
        bytes += chunk.length;
        if (bytes > 16 * 1024 * 1024) throw new Error("BUNDLE_LIMIT");
        chunks.push(chunk);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      const result =
        request.url === "/choose"
          ? await authority.chooseBranch(body.id, { expectedHead: body.expectedHead })
          : await authority.acceptBundle(body);
      if (dropReplyOnce && result.kind !== "needs-snapshot") {
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

export async function synchronizeLinear(replica, url, options) {
  let sentBytes = 0;
  let receivedBytes = 0;
  let snapshotUploaded = false;
  const post = async bundle => {
    const body = JSON.stringify(bundle);
    sentBytes += Buffer.byteLength(body);
    snapshotUploaded ||= Boolean(bundle.snapshot);
    const response = await fetch(`${url}/linear-sync`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      signal: AbortSignal.timeout(5000),
    });
    const raw = await response.text();
    receivedBytes += Buffer.byteLength(raw);
    const result = JSON.parse(raw);
    if (!response.ok) throw new Error(result.error);
    return result;
  };
  let result = await post(replica.bundle({ includeSnapshot: false }));
  if (result.kind === "needs-snapshot") result = await post(replica.bundle());
  await replica.installResponse(result, options);
  return { ...result, wire: { sentBytes, receivedBytes, snapshotUploaded } };
}
