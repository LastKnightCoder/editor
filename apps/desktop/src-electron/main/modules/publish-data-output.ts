import { createHash } from "node:crypto";
import { posix } from "node:path";
import { replaceTemplatePaths } from "@tau/plugins/template-html";
import { assertPublishPath } from "@tau/plugins/template";
import type {
  ContentRef,
  DataManifest,
  ListData,
  ManifestItem,
  PublishedData,
  ResourceRef,
  SearchFile,
} from "@tau/plugins/publish-data";
import type { IPublishFile } from "@/types/publish";
import type { TemplatePackage } from "../services/template-package";

type DataKind = PublishedData["meta"]["type"];
/** 单条内容的正文数据；版本、key、发布时间与资源依赖由输出层补齐。 */
export type PublishDataBody = {
  [K in DataKind]: {
    meta: { type: K };
    content: Extract<PublishedData, { meta: { type: K } }>["content"];
  };
}[DataKind];
/** 站点级数据，只写入清单一次。 */
export type PublishSiteShared = Omit<DataManifest, "version" | "search" | "items">;

const digest = (content: Buffer | string) => createHash("sha256").update(content).digest("hex");

export class PublishDataOutput {
  constructor(
    private readonly dependencies: (
      data: unknown,
      dataPath: string
    ) => import("@tau/plugins/rendering").PublishedPluginRender[],
    /** 站内链接目标键（`${contentType}:${refId}`）→ 已发布内容。 */
    private readonly linkTarget: (identity: string) => ContentRef | undefined
  ) {}
  private readonly output = new Map<string, IPublishFile>();
  private readonly items: ManifestItem[] = [];

  add(file: Omit<IPublishFile, "hash">) {
    assertPublishPath(file.path);
    if (this.output.has(file.path)) throw new Error(`发布文件重复：${file.path}`);
    const result = { ...file, hash: digest(file.content) };
    this.output.set(file.path, result);
    return result;
  }

  data(ref: ContentRef, body: PublishDataBody, css = "", projectId?: number): IPublishFile {
    const id = "id" in body.content ? body.content.id : undefined;
    if (body.meta.type !== ref.type || (ref.id !== undefined && id !== ref.id))
      throw new Error("发布数据身份不一致");
    const collectionType = body.meta.type === "list" ? (body.content as ListData).type : undefined;
    if (ref.type === "list" && !["card", "article", "doc"].includes(String(collectionType)))
      throw new Error("集合数据类型无效");
    const stem =
      ref.type === "home"
        ? "home"
        : ref.type === "doc"
          ? `projects/${projectId}/${ref.id}`
          : ref.type === "list"
            ? `lists/${collectionType}`
            : `${ref.type}s/${ref.id}`;
    const dataPath = `data/${stem}.json`;
    const contentStyles: ResourceRef[] = [];
    if (css.trim()) {
      const hash = digest(css);
      const path = `data/styles/${hash}.css`;
      if (!this.output.has(path)) this.add({ path, content: css });
      contentStyles.push({ href: posix.relative(posix.dirname(dataPath), path), integrity: hash });
    }
    const content = body.content;
    const revisions: number[] = [];
    const links: Record<string, ContentRef> = {};
    const visit = (value: unknown): void => {
      if (!value || typeof value !== "object") return;
      const node = value as Record<string, unknown>;
      if (node.type === "content-link") {
        const identity = `${node.contentType}:${node.refId}`;
        const target = this.linkTarget(identity);
        if (target) links[identity] = target;
      }
      for (const [key, item] of Object.entries(value)) {
        if (["createTime", "updateTime", "publishTime"].includes(key) && typeof item === "number")
          revisions.push(item);
        else if (typeof item === "object") visit(item);
      }
    };
    visit(content);
    const pluginRenderers = this.dependencies(content, dataPath);
    const payload = {
      version: 1,
      key: ref.key,
      content,
      meta: {
        type: body.meta.type,
        publishTime: revisions.reduce((max, value) => Math.max(max, value), 0),
      },
      ...(Object.keys(links).length ? { links } : {}),
      ...(pluginRenderers.length ? { pluginRenderers } : {}),
      ...(contentStyles.length ? { contentStyles } : {}),
    } as PublishedData;
    const text = JSON.stringify(payload);
    const hash = digest(text);
    const file = this.add({
      path: `data/${stem}.${hash}.json`,
      content: text,
      ...(ref.type === "card" || ref.type === "article"
        ? { sourceType: ref.type, sourceId: ref.id }
        : ref.type === "doc"
          ? { sourceType: "project" as const, sourceId: projectId }
          : {}),
    });
    if (this.items.some(item => item.key === ref.key))
      throw new Error(`发布数据 key 重复：${ref.key}`);
    this.items.push({
      ...ref,
      ...(collectionType ? { collectionType } : {}),
      ...(projectId === undefined ? {} : { projectId }),
      title: "title" in content && typeof content.title === "string" ? content.title : ref.key,
      data: file.path.slice(5),
      integrity: hash,
    });
    return file;
  }

  finish(template: TemplatePackage, search: SearchFile, shared: PublishSiteShared) {
    const keys = new Set(this.items.map(item => item.key));
    for (const item of search.documents)
      if (!keys.has(item.key)) throw new Error("搜索 key 未闭合");
    const searchText = JSON.stringify(search);
    const searchFile = this.add({
      path: `data/search.${digest(searchText)}.json`,
      content: searchText,
    });
    const manifest: DataManifest = {
      version: 1,
      ...shared,
      search: { data: searchFile.path.slice(5), integrity: searchFile.hash },
      items: this.items.slice().sort((a, b) => a.key.localeCompare(b.key)),
    };
    const text = JSON.stringify(manifest);
    const manifestFile = this.add({ path: `data/site.${digest(text)}.json`, content: text });
    const base = shared.site.basePath;
    if (
      !base.startsWith("/") ||
      !base.endsWith("/") ||
      /[?#\\]/.test(base) ||
      base.split("/").some(part => part === "." || part === "..")
    )
      throw new Error("部署 basePath 无效");
    for (const file of template.files) {
      if (/^(?:data|_tau|plugin-assets)(?:\/|$)/.test(file.path))
        throw new Error("模板覆盖了协议资源目录");
      let content = Buffer.from(file.content);
      if (template.manifest.template.entries.includes(file.path)) {
        content = Buffer.from(
          replaceTemplatePaths(content.toString("utf8"), {
            BASE: base,
            MANIFEST: base + manifestFile.path,
          })
        );
      }
      this.add({
        path: file.path,
        content,
        ...(template.manifest.template.entries.includes(file.path)
          ? {
              publicationEntry: true as const,
              templateIdentity: {
                id: template.manifest.id,
                version: template.manifest.version,
                digest: digest(JSON.stringify(template.manifest)),
              },
            }
          : {}),
      });
    }
    return [...this.output.values()];
  }
}
