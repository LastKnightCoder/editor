import { invoke } from "@/electron";
import { ensureModule } from "@/commands/module-init";
import type { ToolDefinition } from "@/types/tool";
import type { Descendant } from "slate";
import { getChatDatabase } from "@/services/chatDatabase";
import toolRegistry, { ensureToolingReady } from "@/tools";
import { templateFiles, ORIGINAL_TEMPLATE } from "./template";
import { originalShellPath } from "./original-shell";
import { withPPTRuntime } from "@/utils/ppt-runtime";
import {
  compilePPT,
  readManifest,
  slidePath,
  validatePPTSlide,
  encodePPTFiles,
  type PPTFiles,
} from "./document";

type Checked = { files: PPTFiles; title: string };
export class PPTWorkspace {
  private checked?: Checked;
  private queue: Promise<unknown> = Promise.resolve();
  readonly tools: ToolDefinition[];
  private constructor(
    private handle: { id: string; cwd: string },
    private files: PPTFiles,
    databaseName: string,
    readonly template: string,
    pack: PPTFiles
  ) {
    const text = { type: "string" };
    const tool = (
      name: string,
      description: string,
      keys: string[],
      required: string[],
      risk: "read" | "write",
      execute: (args: Record<string, string>, signal?: AbortSignal) => Promise<string>
    ): ToolDefinition => ({
      name,
      description,
      risk,
      parameters: {
        type: "object",
        properties: Object.fromEntries(keys.map(key => [key, text])),
        required,
        additionalProperties: false,
      },
      executor: (args, context) => {
        const result = this.queue.then(async () => {
          context?.signal?.throwIfAborted();
          if (risk === "write") this.checked = undefined;
          for (const key of required)
            if (typeof args[key] !== "string") throw new Error(`缺少 ${key}`);
          return await execute(args as Record<string, string>, context?.signal);
        });
        this.queue = result.catch(() => undefined);
        return result.catch(error => ({
          content: `检查失败：${(error as Error).message}`,
          isParameterError: true,
        }));
      },
    });
    this.tools = [
      tool(
        "ppt_read",
        "列出工作目录（不传 path），或读一份草稿文件、模板目录或页型示例。草稿路径从 deck.json 或 slides/ 开始。",
        ["path"],
        [],
        "read",
        async ({ path }) => {
          if (!path) return [...Object.keys(this.files), ...Object.keys(pack)].join("\n");
          if (path.startsWith("assets/") && Object.hasOwn(this.files, path))
            return `图片资源 ${path}`;
          return this.file<string>("read", path.startsWith("template/") ? path : "draft/" + path);
        }
      ),
      tool(
        "ppt_write",
        "写入清单、整稿样式或单页 HTML 文件。成功仅回文件名。",
        ["path", "content"],
        ["path", "content"],
        "write",
        ({ path, content }) => this.write(path, content)
      ),
      tool(
        "ppt_edit",
        "仅替换指定文件中唯一匹配的一段原文。",
        ["path", "before", "after"],
        ["path", "before", "after"],
        "write",
        async ({ path, before, after }) => {
          const source = this.files[path];
          if (
            !before ||
            !source ||
            source.indexOf(before) < 0 ||
            source.indexOf(before) !== source.lastIndexOf(before)
          )
            throw new Error("原文须在指定文件里唯一匹配");
          return this.write(
            path,
            source.replace(before, () => after)
          );
        }
      ),
      tool(
        "ppt_remove",
        "删除不再使用的草稿页或样式。删除页面时也要修改清单。",
        ["path"],
        ["path"],
        "write",
        async ({ path }) => {
          if (path === originalShellPath || !Object.hasOwn(this.files, path))
            throw new Error("文件不可删除");
          await this.file("remove", "draft/" + path);
          delete this.files[path];
          return `已删除 ${path}`;
        }
      ),
      tool(
        "ppt_check",
        "构建独立 HTML 并在离线浏览器逐页检查。失败后按诊断修复再检查。",
        [],
        [],
        "read",
        async () => {
          const manifest = await this.check();
          return `build/deck.html 检查通过，共 ${manifest.slides.length} 页，可以完成任务。`;
        }
      ),
    ];
    ensureToolingReady();
    const imageTool = toolRegistry
      .getRegisteredTools()
      .find(
        item =>
          item.enabled && item.source === "openai-image-tools" && item.name === "generate_image"
      );
    if (imageTool)
      this.tools.push(
        tool(
          "ppt_illustrate",
          "为页面生成教学插图，返回可直接写入 img src 的随稿资源名。",
          ["prompt"],
          ["prompt"],
          "write",
          async ({ prompt }, signal) => {
            if (getChatDatabase() !== databaseName.replace(/\.db$/, ""))
              throw new Error("请切回原资料库生成插图");
            const result = await imageTool.executor(
              { prompt },
              {
                signal,
                toolName: imageTool.name,
                toolCallId: crypto.randomUUID(),
                source: "vibe-learning",
              }
            );
            const payload = JSON.parse(
              typeof result === "string" ? result : (result?.content ?? "{}")
            );
            if (!payload.success || typeof payload.images?.[0]?.url !== "string")
              throw new Error("未生成可用的插图");
            const { resolveImageInputFile } = await import("@/utils/image-generation/shared");
            const { bytesToBase64 } = await import("@/utils/content-transfer/assets");
            const image = await resolveImageInputFile(payload.images[0].url, {}, signal);
            const path = `assets/image-${crypto.randomUUID()}.image`;
            const data = `data:${image.type};base64,${bytesToBase64(new Uint8Array(await image.arrayBuffer()))}`;
            signal?.throwIfAborted();
            await this.file("write", "draft/" + path, data);
            this.files[path] = data;
            return path;
          }
        )
      );
  }
  get cwd() {
    return this.handle.cwd;
  }
  get progress() {
    const manifest = this.files["deck.json"] && readManifest(this.files["deck.json"]);
    if (!manifest) return { done: 0, total: 0 };
    return {
      total: manifest.slides.length,
      done: manifest.slides.filter(s => Object.hasOwn(this.files, `slides/${s.id}.html`)).length,
    };
  }
  async checkOriginal(source: string) {
    const { manifest, html } = compilePPT(this.files);
    const ids = manifest.slides.map(s => s.id);
    const before = await invoke<string>(
      "ppt-workspace:verify",
      this.handle.id,
      withPPTRuntime(source),
      ids,
      "original"
    );
    const after = await invoke<string>(
      "ppt-workspace:verify",
      this.handle.id,
      html,
      ids,
      "roundtrip"
    );
    if (!before || before !== after) throw new Error("拆页前后的页面内容或样式不一致");
  }
  private async check() {
    this.checked = undefined;
    const files: PPTFiles = {};
    for (const path of Object.keys(this.files))
      files[path] = await this.file<string>("read", "draft/" + path);
    const { manifest, html } = compilePPT(files);
    await invoke(
      "ppt-workspace:verify",
      this.handle.id,
      html,
      manifest.slides.map(s => s.id)
    );
    this.checked = { files, title: manifest.title };
    return manifest;
  }
  static async open(
    initial: PPTFiles,
    databaseName: string,
    template = readManifest(initial["deck.json"]).template
  ) {
    await ensureModule("vibe-learning-db");
    const pack =
      template === ORIGINAL_TEMPLATE
        ? { "template/layouts.md": "保留旧稿样式，新增页以同稿现有页为示例。" }
        : templateFiles(template);
    const sources = Object.fromEntries(Object.entries(initial).map(([k, v]) => ["draft/" + k, v]));
    const handle = await invoke<{ id: string; cwd: string }>("ppt-workspace:open", {
      ...pack,
      ...sources,
    });
    return new PPTWorkspace(handle, { ...initial }, databaseName, template, pack);
  }
  private file<T>(action: string, path: string, content?: string) {
    return invoke<T>("ppt-workspace:file", this.handle.id, action, path, content);
  }
  private async write(path: string, content: string) {
    const page = slidePath.exec(path);
    if (page) validatePPTSlide(page[1], content);
    else if (path === "deck.json") {
      if (readManifest(content).template !== this.template)
        throw new Error(`模板版本必须为 ${this.template}`);
    } else if (path !== "overrides.css") throw new Error("不支持的草稿路径");
    await this.file("write", "draft/" + path, content);
    this.files[path] = content;
    return `已写入 ${path}`;
  }
  result(original: Descendant[]) {
    if (!this.checked) throw new Error("模型未完成最新版草稿的播放检查，可以重试继续");
    return { title: this.checked.title, nodes: encodePPTFiles(this.checked.files, original) };
  }
  close() {
    return this.file("close", "");
  }
}
