import type { IncomingMessage, ServerResponse } from "node:http";

/** 隔离服务只实现验收需要的WebDAV目录查询与创建。 */
export function handleWebDavDirectory(
  req: IncomingMessage,
  res: ServerResponse,
  objects: Map<string, Buffer>,
  directories: Set<string>
): boolean {
  const key = new URL(req.url ?? "/", "http://localhost").pathname.replace(/\/$/, "") || "/";
  if (req.method === "MKCOL") {
    directories.add(key);
    res.writeHead(201).end();
    return true;
  }
  if (req.method !== "PROPFIND") return false;
  if (!directories.has(key) && !objects.has(key)) {
    res.writeHead(404).end();
    return true;
  }
  const children =
    req.headers.depth === "0"
      ? []
      : [...directories, ...objects.keys()].filter(
          name => name !== key && name.split("/").slice(0, -1).join("/") === key
        );
  const xml = [key, ...children]
    .map(
      name =>
        `<d:response><d:href>${name}</d:href><d:propstat><d:prop><d:resourcetype>${directories.has(name) ? "<d:collection/>" : ""}</d:resourcetype><d:getcontentlength>${objects.get(name)?.length ?? 0}</d:getcontentlength><d:getlastmodified>Sun, 18 Oct 2026 00:00:00 GMT</d:getlastmodified></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`
    )
    .join("");
  res.writeHead(207, { "Content-Type": "application/xml" });
  res.end(`<d:multistatus xmlns:d="DAV:">${xml}</d:multistatus>`);
  return true;
}
