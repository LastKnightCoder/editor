import { app, net } from "electron";
import { mkdir, readFile, writeFile, link, rm } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";

/** 安装级匿名凭证只由主进程使用，不向渲染进程或插件返回。 */
export class PluginCenterVisitor {
  private pending?: Promise<string>;
  constructor(
    private readonly file: string,
    private readonly origin: string,
    private readonly fetch: (input: string, init?: RequestInit) => Promise<Response>
  ) {}
  token() {
    if (!this.pending)
      this.pending = this.load().catch(error => {
        this.pending = undefined;
        throw error;
      });
    return this.pending;
  }
  private async saved() {
    const saved = JSON.parse(await readFile(this.file, "utf8"));
    if (
      saved.origin !== this.origin ||
      typeof saved.token !== "string" ||
      !/^[\w-]{64,128}$/.test(saved.token)
    )
      throw new Error("匿名身份文件无效");
    return saved.token as string;
  }
  private async load() {
    try {
      return await this.saved();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const response = await this.fetch(this.origin + "/v1/visitor-session", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Tau-Visitor": "1" },
      body: JSON.stringify({ client: "desktop" }),
      signal: AbortSignal.timeout(5000),
    });
    const data = await response.json();
    if (
      !response.ok ||
      typeof data?.data?.token !== "string" ||
      !/^[\w-]{64,128}$/.test(data.data.token)
    )
      throw new Error("匿名身份申请失败");
    await mkdir(path.dirname(this.file), { recursive: true, mode: 0o700 });
    const temporary = this.file + "." + randomUUID();
    try {
      await writeFile(temporary, JSON.stringify({ origin: this.origin, token: data.data.token }), {
        mode: 0o600,
        flag: "wx",
      });
      try {
        await link(temporary, this.file);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        return await this.saved();
      }
    } finally {
      await rm(temporary, { force: true });
    }
    return data.data.token as string;
  }
}

const visitors = new Map<string, PluginCenterVisitor>();
export async function visitorHeaders(origin: string): Promise<Record<string, string>> {
  try {
    let visitor = visitors.get(origin);
    if (!visitor) {
      visitor = new PluginCenterVisitor(
        path.join(
          app.getPath("userData"),
          "plugin-center",
          createHash("sha256").update(origin).digest("hex") + ".json"
        ),
        origin,
        (input, init) => net.fetch(input, init)
      );
      visitors.set(origin, visitor);
    }
    return { Authorization: `Bearer ${await visitor.token()}` };
  } catch {
    console.warn("plugin_center_visitor_unavailable");
    return {};
  }
}
