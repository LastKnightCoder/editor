import Database from "better-sqlite3";
import { Entry, openPromise, type ZipFile } from "yauzl";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, opendir, rm, rename } from "node:fs/promises";
import { basename, extname, join, relative, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import PathUtil from "../utils/PathUtil";
import sharp from "sharp";

const ignored = (name: string, directory: boolean) =>
  name.startsWith(".") ||
  (directory ? ["node_modules", "__MACOSX"] : ["Thumbs.db", "desktop.ini"]).includes(name);

export type AssetLocation = { kind: "source" | "disk"; path: string };

// SQLite 的匿名临时库在连接关闭时删除，页缓存有界。
export class ImportWorkspace {
  private db = new Database("");
  private zip?: ZipFile;
  private prefix = "";
  private abort = new AbortController();
  readonly kind: "folder" | "zip";
  constructor(readonly root: string) {
    this.kind = /\.zip$/i.test(root) ? "zip" : "folder";
    this.db.exec(`PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF;
      CREATE TABLE files (path TEXT PRIMARY KEY, entry TEXT);
      CREATE TABLE snapshots (path TEXT PRIMARY KEY, body TEXT NOT NULL)`);
  }

  async index() {
    const markers = new Set<string>();
    const add = this.db.prepare("INSERT OR REPLACE INTO files VALUES (?,?)");
    if (this.kind === "folder") {
      const walk = async (relative: string) => {
        for await (const entry of await opendir(join(this.root, relative))) {
          this.abort.signal.throwIfAborted();
          if (ignored(entry.name, entry.isDirectory())) {
            if (!relative) markers.add(entry.name);
            continue;
          }
          const path = relative ? relative + "/" + entry.name : entry.name;
          if (entry.isDirectory()) await walk(path);
          else add.run(path, null);
        }
      };
      await walk("");
    } else {
      const zip = await openPromise(this.root, { autoClose: false });
      if (this.abort.signal.aborted) {
        zip.close();
        this.abort.signal.throwIfAborted();
      }
      this.zip = zip;
      let root: string | undefined;
      const nestedMarkers = new Set<string>();
      for await (const entry of zip.eachEntry()) {
        this.abort.signal.throwIfAborted();
        const segments = entry.fileName.split("/").filter(segment => segment && segment !== ".");
        const directory = entry.fileName.endsWith("/");
        const skip = segments.findIndex((name, i) =>
          ignored(name, directory || i < segments.length - 1)
        );
        if (skip >= 0) {
          if (skip === 0) markers.add(segments[0]);
          if (skip === 1) nestedMarkers.add(segments.slice(0, 2).join("/"));
          continue;
        }
        if (directory) continue;
        const first = segments.length > 1 ? segments[0] : "";
        root = root === undefined || root === first ? first : "";
        const {
          compressedSize,
          uncompressedSize,
          generalPurposeBitFlag,
          compressionMethod,
          relativeOffsetOfLocalHeader,
        } = entry;
        add.run(
          segments.join("/"),
          JSON.stringify({
            compressedSize,
            uncompressedSize,
            generalPurposeBitFlag,
            compressionMethod,
            relativeOffsetOfLocalHeader,
          })
        );
      }
      if (root) {
        this.prefix = root + "/";
        markers.clear();
        for (const path of nestedMarkers)
          if (path.startsWith(this.prefix)) markers.add(path.slice(this.prefix.length));
      }
    }
    return {
      name:
        this.prefix.slice(0, -1) ||
        (this.kind === "zip" ? basename(this.root).replace(/\.zip$/i, "") : basename(this.root)),
      markers: [...markers],
    };
  }

  paths(after: number) {
    const rows = this.db
      .prepare<[number], { id: number; path: string }>(
        "SELECT rowid AS id,path FROM files WHERE rowid > ? ORDER BY rowid LIMIT 1024"
      )
      .all(after);
    return {
      after: rows.at(-1)?.id ?? after,
      files: rows.map(row => row.path.slice(this.prefix.length)),
    };
  }

  save(path: string, body: string) {
    this.db.prepare("INSERT OR REPLACE INTO snapshots VALUES (?,?)").run(path, body);
  }
  load(path: string): string {
    const row = this.db
      .prepare<[string], { body: string }>("SELECT body FROM snapshots WHERE path=?")
      .get(path);
    if (!row) throw new Error("找不到导入预览中的文件：" + path);
    return row.body;
  }
  private async stream(location: AssetLocation): Promise<Readable> {
    this.abort.signal.throwIfAborted();
    if (location.kind === "disk") return createReadStream(location.path);
    const row = this.db
      .prepare<[string], { entry: string | null }>("SELECT entry FROM files WHERE path=?")
      .get(this.prefix + location.path);
    if (!row) throw new Error("来源中没有 " + location.path);
    if (!this.zip || !row.entry) return createReadStream(join(this.root, location.path));
    return this.zip.openReadStreamPromise(Object.assign(new Entry(), JSON.parse(row.entry)));
  }
  async bytes(location: AssetLocation, maxBytes: number) {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of await this.stream(location)) {
      this.abort.signal.throwIfAborted();
      size += chunk.length;
      if (size > maxBytes)
        throw new Error(
          location.path + " 超出单文件处理内存预算（" + maxBytes / 1048576 + " MiB）"
        );
      chunks.push(chunk);
    }
    return Buffer.concat(chunks, size);
  }
  private resourceUrl(path: string) {
    return "~/" + relative(PathUtil.getHomeDir(), path).split(sep).join("/");
  }
  async copyAsset(location: AssetLocation, name: string, compress = false) {
    const dir = join(PathUtil.getAppDir(), "resources");
    await mkdir(dir, { recursive: true });
    const target = join(dir, randomUUID() + extname(basename(name)));
    const temp = target + ".tmp";
    try {
      await pipeline(await this.stream(location), createWriteStream(temp, { flags: "wx" }), {
        signal: this.abort.signal,
      });
      if (compress) {
        const webp = target + ".webp";
        try {
          await sharp(temp).webp({ quality: 80 }).toFile(webp);
          return this.resourceUrl(webp);
        } catch {
          await rm(webp, { force: true });
        }
      }
      await rename(temp, target);
      return this.resourceUrl(target);
    } finally {
      await rm(temp, { force: true });
    }
  }
  close() {
    this.abort.abort();
    this.zip?.close();
    if (this.db.open) this.db.close();
  }
}
