import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

export async function serveSite({ directory, basePath, delayedFiles = new Set() }) {
  const requests = [];
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, "http://localhost");
    const record = { path: url.pathname, status: 0 };
    requests.push(record);
    try {
      if (!url.pathname.startsWith(basePath)) throw new Error("部署路径不匹配");
      const relative = decodeURIComponent(url.pathname.slice(basePath.length));
      let file = path.resolve(directory, relative || "index.html");
      if (!file.startsWith(directory + path.sep)) throw new Error("文件越界");
      let info = await stat(file).catch(() => null);
      if (info?.isDirectory()) {
        file = path.join(file, "index.html");
        info = await stat(file).catch(() => null);
      }
      // 与静态托管一致：不存在的路径返回站点的 404.html，状态码仍为 404。
      let status = 200;
      if (!info?.isFile()) {
        file = path.join(directory, "404.html");
        info = await stat(file).catch(() => null);
        status = 404;
      }
      if (!info?.isFile()) throw new Error("文件不存在");
      if (delayedFiles.has(path.relative(directory, file).split(path.sep).join("/"))) {
        await new Promise(resolve => setTimeout(resolve, 350));
      }
      const type =
        {
          ".html": "text/html",
          ".js": "text/javascript",
          ".css": "text/css",
          ".json": "application/json",
          ".svg": "image/svg+xml",
        }[path.extname(file)] ?? "application/octet-stream";
      record.status = status;
      response.writeHead(status, {
        "Content-Type": type + "; charset=utf-8",
        "Cache-Control": "no-store",
      });
      response.end(await readFile(file));
    } catch {
      record.status = 404;
      response.writeHead(404).end("not found");
    }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}${basePath}`,
    requests,
    close: () => new Promise(resolve => server.close(resolve)),
  };
}
