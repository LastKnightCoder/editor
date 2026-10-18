import { createServer } from "node:http";
import { expect, it } from "vitest";
import { WebDavSyncProvider } from "../../../../utils/sync-providers/webdav.js";

it("WebDAV 的创建请求携带后端原子条件，两个客户端只允许一个成功", async () => {
  let exists = false;
  const conditions: Array<string | undefined> = [];
  const server = createServer((req, res) => {
    if (req.method === "HEAD") {
      res.writeHead(exists ? 200 : 404).end();
      return;
    }
    req.resume();
    req.on("end", () => {
      if (req.method !== "PUT") {
        res.writeHead(405).end();
        return;
      }
      const condition = req.headers["if-none-match"] as string | undefined;
      conditions.push(condition);
      if (condition !== "*") {
        res.writeHead(400).end();
        return;
      }
      if (exists) {
        res.writeHead(412).end();
        return;
      }
      exists = true;
      res.writeHead(200, { ETag: '"commit"' }).end();
    });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  const endpoint = `http://127.0.0.1:${address.port}`;
  const create = () =>
    new WebDavSyncProvider({ url: endpoint, username: "test", password: "test" });
  try {
    const results = await Promise.allSettled(
      [create(), create()].map(provider =>
        provider.createFileIfAbsent("commit", Buffer.from("payload"))
      )
    );
    expect(
      results.filter(result => result.status === "fulfilled" && result.value === true)
    ).toHaveLength(1);
    expect(conditions.length).toBeGreaterThanOrEqual(1);
    expect(conditions.every(value => value === "*")).toBe(true);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close(error => (error ? reject(error) : resolve()))
    );
  }
});
