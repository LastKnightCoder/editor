import { createServer } from "node:http";

export async function serveReplica(replica, { dropReplyOnce = false } = {}) {
  const server = createServer(async (request, response) => {
    try {
      const reply = value => {
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify(value));
      };
      if (request.method === "GET" && request.url === "/state") {
        reply({ frontier: replica.frontier() });
        return;
      }
      if (request.method !== "POST" || request.url !== "/sync") {
        response.writeHead(404).end();
        return;
      }
      const chunks = [];
      let bytes = 0;
      for await (const chunk of request) {
        bytes += chunk.length;
        if (bytes > 16 * 1024 * 1024) throw new Error("spike 请求超过 16 MiB");
        chunks.push(chunk);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      for (const batch of body.batches) replica.receive(batch);
      if (dropReplyOnce) {
        dropReplyOnce = false;
        response.destroy();
        return;
      }
      reply({ batches: replica.exportSince(body.frontier) });
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

export async function synchronize(replica, url) {
  const remote = await fetch(`${url}/state`, { signal: AbortSignal.timeout(3000) });
  if (!remote.ok) throw new Error(`读取同步进度失败：${remote.status}`);
  const { frontier } = await remote.json();
  const outgoing = replica.exportSince(frontier);
  const payload = JSON.stringify({ frontier: replica.frontier(), batches: outgoing });
  const response = await fetch(`${url}/sync`, {
    method: "POST",
    body: payload,
    headers: { "content-type": "application/json" },
    signal: AbortSignal.timeout(3000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  for (const batch of result.batches) replica.receive(batch);
  return {
    sent: outgoing.length,
    received: result.batches.length,
    sentBytes: Buffer.byteLength(payload),
  };
}

export function startAutoSync(
  replica,
  url,
  { interval = 50, onError = error => console.error(error.message) } = {}
) {
  let stopped = false;
  let timer;
  let running;
  const tick = () => {
    running = synchronize(replica, url)
      .catch(onError)
      .finally(() => {
        if (!stopped) timer = setTimeout(tick, interval);
      });
  };
  tick();
  return async () => {
    stopped = true;
    clearTimeout(timer);
    await running;
  };
}
