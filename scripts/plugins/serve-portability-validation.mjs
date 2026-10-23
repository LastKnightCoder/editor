import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const directory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../output/plugin-portability-validation"
);
const sources = JSON.parse(await readFile(path.join(directory, "sources.json"), "utf8"));
const names = new Set(sources.map(source => new URL(source.url).pathname.slice(1)));
createServer(async (request, response) => {
  const name = new URL(request.url ?? "/", "http://127.0.0.1").pathname.slice(1);
  if (request.method !== "GET" || !names.has(name)) {
    response.writeHead(404).end();
    return;
  }
  try {
    const bytes = await readFile(path.join(directory, name));
    response
      .writeHead(200, { "content-type": "application/zip", "content-length": bytes.length })
      .end(bytes);
  } catch {
    response.writeHead(500).end();
  }
}).listen(2430, "127.0.0.1", () => console.log("跨端验证包服务：http://127.0.0.1:2430"));
