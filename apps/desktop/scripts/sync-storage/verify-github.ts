import { createHash } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

/** 隔离Contents API服务，核验分支、SHA更新与无SHA条件创建。 */
export async function handleGithubContents(
  req: IncomingMessage,
  res: ServerResponse,
  objects: Map<string, Buffer>,
  loseResponse: () => boolean
) {
  const url = new URL(req.url ?? "/", "http://localhost");
  const prefix = "/repos/test-owner/test-repo/contents";
  const reply = (status: number, body: unknown = {}) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };
  if (!url.pathname.startsWith(prefix)) return reply(404);
  const path = decodeURIComponent(url.pathname.slice(prefix.length)).replace(/^\//, "");
  const sha = (data: Buffer) => createHash("sha1").update(data).digest("hex");
  const current = objects.get(path);
  if (req.method === "PUT") {
    const chunks: Buffer[] = [];
    for await (const part of req) chunks.push(Buffer.from(part));
    const body = JSON.parse(Buffer.concat(chunks).toString());
    if (body.branch !== "main") return reply(422);
    if (current && body.sha !== sha(current)) return reply(422);
    objects.set(path, Buffer.from(body.content, "base64"));
    if (!body.sha && loseResponse()) return reply(400);
    return reply(current ? 200 : 201);
  }
  if (url.searchParams.get("ref") !== "main") return reply(404);
  const entry = (name: string) => ({
    type: "file",
    path: name,
    name: name.split("/").pop(),
    size: objects.get(name)!.length,
    sha: sha(objects.get(name)!),
    content: objects.get(name)!.toString("base64"),
  });
  if (current) return reply(200, entry(path));
  const children = [...objects.keys()].filter(name => name.startsWith(path + "/"));
  if (!children.length) return reply(404);
  const names = new Set(
    children.map(name => path + "/" + name.slice(path.length + 1).split("/")[0])
  );
  reply(
    200,
    [...names].map(name =>
      objects.has(name) ? entry(name) : { type: "dir", path: name, name: name.split("/").pop() }
    )
  );
}
