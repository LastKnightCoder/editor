/**
 * 发布站点生成器：按发布选择生成数据、资源与搜索索引，并复制作者静态产物。
 *
 * 不依赖 electron 与数据表模块——数据经 PublishDataSource 读取、Tailwind 编译经注入函数完成，
 * 因此可跑在 worker 线程里（publish-generator-worker），生成期间不阻塞主进程。
 */

import type { ContentRef, DataManifest, TreeItem } from "@tau/plugins/publish-data";
import type { ContentEntityReference } from "@tau/db-schema/content-identities";
import type { TemplatePackage } from "../services/template-package";
import type { JsonValue } from "@tau/plugins";
import { resolveSiteFields } from "@tau/plugins/template";
import { PublishDataOutput, type PublishDataBody } from "./publish-data-output";
import { PublishImages } from "./publish-images";
import type { ContentResourceDeclarations } from "@tau/db-schema/content-resources";
import { existsSync, readFileSync } from "fs";
import type { Descendant } from "slate";
import { PublishPluginCatalog, type PublishPluginSnapshot } from "../services/plugin-publish";
import type {
  IPublishFile,
  PublishContentType,
  IPublishCardTagTree,
  IPublishCardListItem,
  IPublishListItem,
  IPublishAppearanceSettings,
  IPublishFaviconConfig,
  PublishImageWarning,
} from "@/types/publish";
import type { ICard } from "@/types/card";
import type { IArticle } from "@/types/article";
import { Project, ProjectItem, EProjectItemType } from "@/types/project";
import {
  contentRef,
  buildSelectionContentLinkTargets,
  mergeDocEntryContentLinkTargets,
} from "./publish-content-link-targets";
import { buildPublishAppearanceSettings } from "./publish-appearance-settings";
import { resolvePublishFaviconOutput } from "./publish-favicon";
import { createPublishContentResolver } from "./publish-project-card-list";
import {
  buildPublishSearchIndexPayload,
  type BuildPublishSearchIndexInput,
} from "./publish-search-index";

/** 生成所需的只读数据访问（主进程直连数据库；worker 内经同步 RPC 转发到主进程） */
export interface PublishDataSource {
  getCardByIds(ids: number[]): ICard[];
  getCardById(id: number): ICard | null;
  /** 正文显式连接的对方正文（按建立时间排序） */
  getContentLinkTargetContentIds(contentId: number): number[];
  getArticleByIds(ids: number[]): IArticle[];
  getProject(id: number): Project | null;
  getProjectItemsByIds(ids: number[]): ProjectItem[];
  resolveProjectItemId(reference: ContentEntityReference): number | null;
}

export interface PublishSelectionInput {
  contentType: PublishContentType;
  contentId: number;
  parentPath: string;
}

export interface PublishGeneratorOptions {
  resourceDeclarations?: ContentResourceDeclarations;
  buildSearchIndex?: (
    input: BuildPublishSearchIndexInput
  ) => Promise<import("@tau/plugins/publish-data").SearchFile>;
  template: TemplatePackage;
  compileTailwind: (code: string, extension: "tsx" | "html") => Promise<string>;
  logger: Pick<Console, "info" | "warn" | "error">;
  plugins?: PublishPluginSnapshot;
}

export interface ISiteMeta {
  destination?: string;
  templateId?: string;
  title: string;
  basePath: string;
  publicUrl?: string;
  favicon?: IPublishFaviconConfig;
  /** 当前模板的站点字段存储值，生成时按模板声明解析 */
  fieldValues?: Record<string, JsonValue>;
}

interface IDocEntry {
  id: number;
  entityId: number;
  title: string;
  summary: string;
  target: ContentRef;
  createTime: number;
  updateTime: number;
  tags: string[];
  kind: "project";
  content: Descendant[];
  breadcrumb: { label: string; target?: ContentRef }[];
}

interface ITimelineEntry {
  type: "card" | "article" | "doc";
  id: number;
  title?: string;
  summary: string;
  target: ContentRef;
  tags: string[];
  publishTime: number;
}

interface ILinkedCardInfo {
  id: number;
  target: ContentRef;
  summary: string;
  tags: string[];
}

interface CardTagTreeNode {
  tag: string;
  count: number;
  cards: IPublishCardListItem[];
  children: Map<string, CardTagTreeNode>;
}

interface IDocTreeNode {
  id: number;
  title: string;
  tags: string[];
  children: IDocTreeNode[];
  content: Descendant[];
  createTime: number;
  updateTime: number;
  hasContent: boolean;
}

interface IDocCollectionMetaItem {
  type: "project";
  entityId: number;
  title: string;
  target?: ContentRef;
}

type EntityScopeConfig = { mode: "all" } | { mode: "partial"; nodes: Set<number> };

export class PublishSiteGenerator {
  private favicon?: { content: Buffer; output: ReturnType<typeof resolvePublishFaviconOutput> };
  private readonly template: TemplatePackage;
  private output!: PublishDataOutput;
  private readonly compileTailwind: PublishGeneratorOptions["compileTailwind"];
  private readonly logger: PublishGeneratorOptions["logger"];
  private readonly tailwindCssCache = new Map<string, string>();
  private linkTargets: Record<string, ContentRef> = {};
  private contentNodes!: ReturnType<typeof createPublishContentResolver>;
  private readonly pluginCatalog: PublishPluginCatalog;
  private readonly buildSearchIndex: NonNullable<PublishGeneratorOptions["buildSearchIndex"]>;
  private readonly resourceDeclarations: ContentResourceDeclarations;

  constructor(options: PublishGeneratorOptions) {
    if (options.plugins?.plugins.length && !options.buildSearchIndex)
      throw new Error("发布内容插件需要独立内容转换服务");
    this.buildSearchIndex =
      options.buildSearchIndex ?? (async input => buildPublishSearchIndexPayload(input));
    this.template = options.template;
    this.compileTailwind = options.compileTailwind;
    this.logger = options.logger;
    this.pluginCatalog = new PublishPluginCatalog(options.plugins);
    this.resourceDeclarations = options.resourceDeclarations ?? {};
  }

  /** 生成全部发布文件 */
  generate(
    db: PublishDataSource,
    selections: PublishSelectionInput[],
    site: ISiteMeta,
    appearanceSettings?: IPublishAppearanceSettings
  ): Promise<{
    files: IPublishFile[];
    virtualProcessed: number;
    warnings: string[];
    imageWarnings: PublishImageWarning[];
  }> {
    return this.generatePublishFiles(db, selections, site, appearanceSettings);
  }

  private buildSiteInitMeta(site: ISiteMeta): DataManifest["site"] {
    const meta: DataManifest["site"] = {
      title: site.title,
      basePath: site.basePath,
      publicUrl: site.publicUrl,
      fields: resolveSiteFields(this.template.manifest.template.siteFields, site.fieldValues),
    };
    if (!site.favicon) return meta;
    const faviconOutput = this.favicon!.output;
    return {
      ...meta,
      favicon: {
        href: faviconOutput.href,
        format: site.favicon.format,
        mimeType: faviconOutput.mimeType,
      },
    };
  }

  /**
   * 生成要发布的文件
   */
  private async generatePublishFiles(
    db: PublishDataSource,
    selections: PublishSelectionInput[],
    site: ISiteMeta,
    appearanceSettings?: IPublishAppearanceSettings
  ): Promise<{
    files: IPublishFile[];
    virtualProcessed: number;
    warnings: string[];
    imageWarnings: PublishImageWarning[];
  }> {
    const contentWarnings = new Set<string>();
    this.contentNodes = createPublishContentResolver(
      db,
      identity => this.linkTargets[identity],
      warning => contentWarnings.add(warning)
    );
    const images = new PublishImages(site.basePath, this.resourceDeclarations);
    this.output = new PublishDataOutput(
      (data, dataPath) => this.pluginCatalog.dependencies(data, dataPath),
      identity => this.linkTargets[identity],
      images
    );
    this.pluginCatalog.reset();
    this.tailwindCssCache.clear();
    this.favicon = undefined;
    if (site.favicon) {
      if (!existsSync(site.favicon.cachePath)) throw new Error("favicon 缓存不存在，请重新选择");
      const content = readFileSync(site.favicon.cachePath);
      this.favicon = {
        content,
        output: resolvePublishFaviconOutput(site.favicon, content, site.basePath),
      };
    }
    const grouped = this.groupSelections(selections);
    const cards = this.loadCards(
      db,
      grouped.card.map(item => item.contentId)
    );
    const articles = this.loadArticles(
      db,
      grouped.article.map(item => item.contentId)
    );
    const cardMap = new Map(cards.map(card => [card.id, card]));
    const cardsByContentId = new Map(cards.map(card => [card.contentId, card]));
    const articleMap = new Map(articles.map(article => [article.id, article]));
    const projects = this.loadProjects(db, grouped.project);
    const baseTargets = buildSelectionContentLinkTargets({
      cardIds: [...cardMap.keys()],
      articleIds: [...articleMap.keys()],
    });
    this.linkTargets = baseTargets;
    const docResult = await this.buildDocData(
      db,
      projects,
      this.buildEntityScopeMap(grouped.project),
      baseTargets
    );
    for (const selection of grouped.card) {
      const card = cardMap.get(selection.contentId);
      if (!card) continue;
      this.output.data(
        contentRef("card", card.id),
        this.buildCardInitData(card, this.resolveLinkedCards(db, card, cardsByContentId)),
        await this.buildTailwindRuntimeCss(card.content)
      );
    }
    for (const article of articles) {
      this.output.data(
        contentRef("article", article.id),
        this.buildArticleInitData(article),
        await this.buildTailwindRuntimeCss(article.content)
      );
    }
    for (const [type, records] of [
      ["card", cards],
      ["article", articles],
    ] as const) {
      if (records.length)
        this.output.data(
          { key: `list:${type}`, type: "list" },
          this.buildListInitData(type, records as ICard[] | IArticle[])
        );
    }
    if (docResult.listEntries.length)
      this.output.data(
        { key: "list:doc", type: "list" },
        this.buildDocListInitData(docResult.listEntries)
      );
    this.output.data(
      contentRef("home"),
      this.buildHomeInitData(cards, articles, docResult.timelineEntries, projects.length)
    );
    for (const file of this.pluginCatalog.files()) this.output.add(file);
    for (const file of images.files()) this.output.add(file);
    if (this.favicon) {
      this.output.add({
        path: this.favicon.output.outputPath,
        content: this.favicon.content,
      });
    }
    const searchContent = (nodes: Descendant[] | undefined) =>
      this.contentNodes(nodes, true) as unknown as Descendant[];
    const search = await this.buildSearchIndex({
      cards: cards.map(card => ({ ...card, content: searchContent(card.content) })),
      articles: articles.map(article => ({ ...article, content: searchContent(article.content) })),
      docs: docResult.listEntries.map(doc => ({ ...doc, content: searchContent(doc.content) })),
    });
    return {
      files: this.output.finish(this.template, search, {
        site: this.buildSiteInitMeta(site),
        settings: buildPublishAppearanceSettings(appearanceSettings),
        ...(docResult.collections ? { collections: docResult.collections } : {}),
        ...(cards.length ? { cardTagTree: this.buildCardTagTree(cards) } : {}),
        ...(Object.keys(docResult.projectTrees).length
          ? { projectTrees: docResult.projectTrees }
          : {}),
      }),
      virtualProcessed: docResult.skippedDocItems,
      warnings: [...this.pluginCatalog.warnings(), ...contentWarnings],
      imageWarnings: images.warnings(),
    };
  }

  /**
   * 构建首页数据
   */
  private buildHomeInitData(
    cards: ICard[],
    articles: IArticle[],
    docTimeline: ITimelineEntry[],
    projectCount: number
  ): PublishDataBody {
    const timeline = this.buildTimelineEntries(cards, articles, docTimeline);

    return {
      content: {
        timeline,
        stats: {
          articles: articles.length,
          cards: cards.length,
        },
        docStats: {
          projects: projectCount,
        },
      },
      meta: { type: "home" },
    };
  }

  /**
   * 构建卡片页面数据
   */
  private buildCardInitData(card: ICard, linkedCards?: ILinkedCardInfo[]): PublishDataBody {
    return {
      content: {
        id: card.id,
        content: this.contentNodes(card.content),
        tags: card.tags || [],
        createTime: card.create_time,
        updateTime: card.update_time,
        linkedCards,
      },
      meta: { type: "card" },
    };
  }

  /**
   * 构建文章页面数据
   */
  private buildArticleInitData(article: IArticle): PublishDataBody {
    return {
      content: {
        id: article.id,
        title: article.title,
        author: article.author,
        content: this.contentNodes(article.content),
        tags: article.tags || [],
        bannerBg: article.bannerBg,
        createTime: article.create_time,
        updateTime: article.update_time,
      },
      meta: { type: "article" },
    };
  }

  /**
   * 构建列表页面数据
   */
  private buildListInitData(
    type: "card" | "article",
    records: ICard[] | IArticle[]
  ): PublishDataBody {
    const items: IPublishListItem[] =
      type === "card"
        ? (records as ICard[]).map(card => ({
            id: card.id,
            summary: this.buildSummary(card.content || []),
            target: contentRef("card", card.id),
            tags: card.tags || [],
            createTime: card.create_time,
          }))
        : (records as IArticle[]).map(article => ({
            id: article.id,
            title: article.title,
            summary: this.buildSummary(article.content || []),
            target: contentRef("article", article.id),
            tags: article.tags || [],
            createTime: article.create_time,
          }));
    items.sort((a, b) => b.createTime - a.createTime);
    const tagStats = this.buildTagStats(items);
    return {
      content: {
        title: type === "card" ? "全部卡片" : "全部文章",
        type,
        items,
        tags: tagStats,
      },
      meta: { type: "list" },
    };
  }

  private groupSelections(
    selections: Array<{
      contentType: PublishContentType;
      contentId: number;
      parentPath: string;
    }>
  ) {
    return {
      card: selections.filter(item => item.contentType === "card"),
      article: selections.filter(item => item.contentType === "article"),
      project: selections.filter(item => item.contentType === "project"),
    };
  }

  private buildEntityScopeMap(
    selections: Array<{ contentId: number; parentPath: string }>
  ): Map<number, EntityScopeConfig> {
    const map = new Map<number, EntityScopeConfig>();
    for (const selection of selections) {
      map.set(selection.contentId, this.parseEntityScopeConfig(selection));
    }
    return map;
  }

  private parseEntityScopeConfig(selection: { parentPath: string }): EntityScopeConfig {
    const raw = selection.parentPath;
    if (!raw || raw.trim().length === 0) {
      return { mode: "all" };
    }
    try {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.mode === "partial" && Array.isArray(parsed.nodes)) {
        const nodeIds = (parsed.nodes as unknown[]).filter(
          (value): value is number => typeof value === "number"
        );
        return { mode: "partial", nodes: new Set(nodeIds) };
      }
    } catch (error) {
      this.logger.warn("发布选择范围无效，已按空选择处理", error);
    }
    return { mode: "partial", nodes: new Set() };
  }

  private loadCards(db: PublishDataSource, ids: number[]): ICard[] {
    const uniqueIds = Array.from(new Set(ids));
    if (!uniqueIds.length) return [];
    return db.getCardByIds(uniqueIds);
  }

  private loadArticles(db: PublishDataSource, ids: number[]): IArticle[] {
    const uniqueIds = Array.from(new Set(ids));
    if (!uniqueIds.length) return [];
    return db.getArticleByIds(uniqueIds);
  }

  private loadProjects(db: PublishDataSource, selections: Array<{ contentId: number }>): Project[] {
    const ids = Array.from(new Set(selections.map(item => item.contentId)));
    const projects: Project[] = [];
    for (const id of ids) {
      const project = db.getProject(id);
      if (project) projects.push(project);
    }
    return projects;
  }

  private resolveLinkedCards(
    db: PublishDataSource,
    card: ICard,
    cache: ReadonlyMap<number, ICard>
  ): ILinkedCardInfo[] {
    const result: ILinkedCardInfo[] = [];
    for (const contentId of db.getContentLinkTargetContentIds(card.contentId)) {
      if (contentId === card.contentId) continue;
      const target = cache.get(contentId);
      if (target && target.id !== card.id) {
        result.push(this.toLinkedCardInfo(target));
      }
      if (result.length >= 5) {
        break;
      }
    }
    return result;
  }

  private toLinkedCardInfo(card: ICard): ILinkedCardInfo {
    return {
      id: card.id,
      target: contentRef("card", card.id),
      summary: this.buildSummary(card.content || []),
      tags: card.tags || [],
    };
  }

  private buildCardTagTree(cards: ICard[]): IPublishCardTagTree[] {
    const root = new Map<string, CardTagTreeNode>();
    for (const card of cards) {
      if (!card.tags || card.tags.length === 0) continue;
      const listItem = this.toCardListItem(card);
      for (const rawTag of card.tags) {
        const segments = rawTag
          .split("/")
          .map(segment => segment.trim())
          .filter(Boolean);
        if (!segments.length) continue;
        this.insertTagNode(root, segments, listItem);
      }
    }
    return Array.from(root.values()).map(node => this.normalizeTagNode(node));
  }

  private insertTagNode(
    container: Map<string, CardTagTreeNode>,
    segments: string[],
    card: IPublishCardListItem
  ) {
    const [current, ...rest] = segments;
    let node = container.get(current);
    if (!node) {
      node = {
        tag: current,
        count: 0,
        cards: [],
        children: new Map(),
      };
      container.set(current, node);
    }
    node.count += 1;
    if (rest.length === 0) {
      node.cards.push(card);
      return;
    }
    this.insertTagNode(node.children, rest, card);
  }

  private normalizeTagNode(node: CardTagTreeNode): IPublishCardTagTree {
    return {
      tag: node.tag,
      count: node.count,
      cards: node.cards,
      children: Array.from(node.children.values()).map(child => this.normalizeTagNode(child)),
    };
  }

  private async buildDocData(
    db: PublishDataSource,
    projects: Project[],
    projectScopes: Map<number, EntityScopeConfig>,
    baseContentLinkTargets: Record<string, ContentRef>
  ): Promise<{
    files: IPublishFile[];
    listEntries: IDocEntry[];
    timelineEntries: ITimelineEntry[];
    collections?: DataManifest["collections"];
    projectTrees: NonNullable<DataManifest["projectTrees"]>;
    contentLinkTargets: Record<string, ContentRef>;
    skippedDocItems: number;
  }> {
    const files: IPublishFile[] = [];
    const projectTrees: NonNullable<DataManifest["projectTrees"]> = {};
    const entries: IDocEntry[] = [];
    const entityEntryMap = new Map<string, IDocEntry[]>();
    const collectionMeta: IDocCollectionMetaItem[] = [];
    let skippedDocItems = 0;

    for (const project of projects) {
      const result = this.buildProjectDocEntries(db, project, projectScopes.get(project.id));
      skippedDocItems += result.skippedCount;
      if (result.entries.length === 0) {
        continue;
      }
      entries.push(...result.entries);
      entityEntryMap.set(`project-${project.id}`, result.entries);
      if (result.sidebar) projectTrees[project.id] = result.sidebar;
      if (result.defaultTarget) {
        collectionMeta.push({
          type: "project",
          entityId: project.id,
          title: project.title || `项目 #${project.id}`,
          target: result.defaultTarget,
        });
      }
    }

    const docCollections = this.buildDocCollectionsFromMeta(collectionMeta);
    const contentLinkTargets = (this.linkTargets = mergeDocEntryContentLinkTargets(
      baseContentLinkTargets,
      entries.map(entry => ({
        id: entry.id,
        kind: entry.kind,
        target: entry.target,
        title: entry.title,
      }))
    ));

    for (const entityEntries of entityEntryMap.values()) {
      for (let i = 0; i < entityEntries.length; i++) {
        const entry = entityEntries[i];
        const prev = entityEntries[i - 1];
        const next = entityEntries[i + 1];
        const initData = this.buildDocInitData(entry, prev, next);
        const runtimeCss = await this.buildTailwindRuntimeCss(entry.content || []);
        files.push(this.output.data(entry.target, initData, runtimeCss, entry.entityId));
      }
    }

    const orderedEntries = entries.slice().sort((a, b) => a.updateTime - b.updateTime);

    const timelineEntries = orderedEntries.map(entry => this.createDocTimelineEntry(entry));

    return {
      files,
      listEntries: orderedEntries,
      timelineEntries,
      collections: docCollections,
      projectTrees,
      contentLinkTargets,
      skippedDocItems,
    };
  }

  private buildDocInitData(
    entry: IDocEntry,
    prev: IDocEntry | undefined,
    next: IDocEntry | undefined
  ): PublishDataBody {
    return {
      content: {
        id: entry.id,
        title: entry.title,
        content: this.contentNodes(entry.content),
        breadcrumb: entry.breadcrumb,
        prevPage: prev ? { title: prev.title, target: prev.target } : undefined,
        nextPage: next ? { title: next.title, target: next.target } : undefined,
        createTime: entry.createTime,
        updateTime: entry.updateTime,
        projectId: entry.entityId,
      },
      meta: { type: "doc" },
    };
  }

  private buildDocCollectionsFromMeta(meta: IDocCollectionMetaItem[]): DataManifest["collections"] {
    if (!meta.length) {
      return undefined;
    }

    const labelMap: Record<IDocEntry["kind"], string> = {
      project: "项目",
    };

    const kinds: IDocEntry["kind"][] = ["project"];

    const collections = kinds
      .map(kind => {
        const items = meta
          .filter(item => item.type === kind && item.target)
          .sort((a, b) => a.title.localeCompare(b.title, "zh-CN"))
          .map(item => ({
            id: item.entityId,
            title: item.title,
            target: item.target!,
            kind,
          }));

        if (items.length === 0) {
          return null;
        }

        return {
          type: kind,
          label: labelMap[kind],
          items,
        };
      })
      .filter(Boolean) as DataManifest["collections"];

    return collections && collections.length > 0 ? collections : undefined;
  }

  private buildDocListInitData(entries: IDocEntry[]): PublishDataBody {
    const items = entries
      .slice()
      .sort((a, b) => b.updateTime - a.updateTime)
      .map(entry => ({
        id: entry.id,
        title: entry.title,
        summary: entry.summary,
        target: entry.target,
        tags: entry.tags,
        createTime: entry.createTime,
      }));
    return {
      content: {
        title: "全部文档",
        type: "doc",
        items,
      },
      meta: { type: "list" },
    };
  }

  private buildProjectDocEntries(
    db: PublishDataSource,
    project: Project,
    scope?: EntityScopeConfig
  ): {
    entries: IDocEntry[];
    sidebar?: TreeItem[];
    defaultTarget?: ContentRef;
    skippedCount: number;
  } {
    const rootIds = Array.isArray(project.children) ? project.children : [];
    if (rootIds.length === 0) {
      return {
        entries: [],
        sidebar: undefined,
        defaultTarget: undefined,
        skippedCount: 0,
      };
    }

    const itemMap = this.loadProjectItemsMap(db, rootIds);
    if (itemMap.size === 0) {
      return {
        entries: [],
        sidebar: undefined,
        defaultTarget: undefined,
        skippedCount: 0,
      };
    }

    let treeNodes = rootIds
      .map(id => this.createProjectTreeNode(itemMap, id))
      .filter((node): node is IDocTreeNode => Boolean(node));

    treeNodes = this.filterDocTreeNodes(treeNodes, scope);

    if (treeNodes.length === 0) {
      return {
        entries: [],
        sidebar: undefined,
        defaultTarget: undefined,
        skippedCount: 0,
      };
    }

    const projectId = project.id;
    const sidebar = this.buildSidebarTree(
      project.title || `项目 #${project.id}`,
      treeNodes,
      nodeId => contentRef("doc", nodeId, projectId)
    );

    const { entries, defaultTarget, skippedCount } = this.collectDocEntriesFromTree(treeNodes, {
      entityId: project.id,
      title: project.title || `项目 #${project.id}`,
      kind: "project",
      projectId,
    });

    return { entries, sidebar, defaultTarget, skippedCount };
  }

  private loadProjectItemsMap(db: PublishDataSource, rootIds: number[]): Map<number, ProjectItem> {
    const queue = [...new Set(rootIds)];
    const visited = new Set<number>();
    const map = new Map<number, ProjectItem>();

    while (queue.length > 0) {
      const batch = queue.splice(0, 20);
      const items = db.getProjectItemsByIds(batch);
      for (const item of items) {
        if (visited.has(item.id)) continue;
        visited.add(item.id);
        map.set(item.id, item);
        if (item.children && item.children.length) {
          queue.push(...item.children);
        }
      }
    }

    return map;
  }

  private createProjectTreeNode(
    map: Map<number, ProjectItem>,
    itemId: number
  ): IDocTreeNode | null {
    const item = map.get(itemId);
    if (!item) return null;

    const children = (item.children || [])
      .map(childId => this.createProjectTreeNode(map, childId))
      .filter((node): node is IDocTreeNode => Boolean(node));

    const hasContent =
      item.projectItemType === EProjectItemType.Document &&
      this.hasMeaningfulContent(item.content || []);

    return {
      id: item.id,
      title: item.title || `条目 #${item.id}`,
      tags: item.tags ?? [],
      children,
      content: item.content || [],
      createTime: item.createTime,
      updateTime: item.updateTime,
      hasContent,
    };
  }

  private filterDocTreeNodes(nodes: IDocTreeNode[], scope?: EntityScopeConfig): IDocTreeNode[] {
    if (!scope || scope.mode === "all") {
      return nodes;
    }
    const allowedNodes = scope.nodes;
    if (allowedNodes.size === 0) {
      return [];
    }
    const filterNode = (node: IDocTreeNode): IDocTreeNode | null => {
      const filteredChildren = (node.children || [])
        .map(child => filterNode(child))
        .filter((child): child is IDocTreeNode => Boolean(child));
      const includeSelf = allowedNodes.has(node.id);
      if (!includeSelf && filteredChildren.length === 0) {
        return null;
      }
      return {
        ...node,
        hasContent: includeSelf && node.hasContent,
        content: includeSelf ? node.content : [],
        children: filteredChildren,
      };
    };

    return nodes
      .map(node => filterNode(node))
      .filter((node): node is IDocTreeNode => Boolean(node));
  }

  private buildSidebarTree(
    entityTitle: string,
    nodes: IDocTreeNode[],
    targetBuilder: (nodeId: number) => ContentRef
  ): TreeItem[] | undefined {
    const children = this.buildSidebarBranch(nodes, targetBuilder) || [];
    if (children.length === 0) {
      return undefined;
    }
    return [
      {
        title: entityTitle,
        children,
      },
    ];
  }

  private buildSidebarBranch(
    nodes: IDocTreeNode[],
    targetBuilder: (nodeId: number) => ContentRef
  ): TreeItem[] | undefined {
    return nodes.map(node => {
      const childNodes = node.children || [];
      return {
        title: node.title || `文档 ${node.id}`,
        target: node.hasContent ? targetBuilder(node.id) : undefined,
        children: childNodes.length
          ? this.buildSidebarBranch(childNodes, targetBuilder)
          : undefined,
      };
    });
  }

  private collectDocEntriesFromTree(
    nodes: IDocTreeNode[],
    entity: {
      entityId: number;
      title: string;
      kind: IDocEntry["kind"];
      projectId: number;
    }
  ): { entries: IDocEntry[]; defaultTarget?: ContentRef; skippedCount: number } {
    const entryInfos: Array<{ node: IDocTreeNode; ancestors: IDocTreeNode[] }> = [];
    const visited = new Set<number>();
    let skippedCount = 0;

    const traverse = (node: IDocTreeNode, ancestors: IDocTreeNode[]): void => {
      // 同一文档可出现在多个分支，发布正文及前后篇只取首次出现的位置。
      if (visited.has(node.id)) return;
      visited.add(node.id);
      if (node.hasContent) {
        entryInfos.push({ node, ancestors });
      } else {
        skippedCount++;
      }
      node.children.forEach((child: IDocTreeNode) => traverse(child, [...ancestors, node]));
    };

    nodes.forEach(node => traverse(node, []));

    let defaultTarget: ContentRef | undefined;
    const entries = entryInfos.map(({ node, ancestors }) => {
      const target = contentRef("doc", node.id, entity.projectId);
      if (!defaultTarget) {
        defaultTarget = target;
      }
      const breadcrumb = [
        {
          label: entity.title,
          target: defaultTarget,
        },
        ...ancestors.map(ancestor => {
          const ancestorTarget = ancestor.hasContent
            ? contentRef("doc", ancestor.id, entity.projectId)
            : undefined;
          return {
            label: ancestor.title,
            target: ancestorTarget,
          };
        }),
        {
          label: node.title,
          target,
        },
      ];
      return {
        id: node.id,
        entityId: entity.entityId,
        title: node.title,
        summary: this.buildSummary(node.content || []),
        target,
        createTime: node.createTime,
        updateTime: node.updateTime,
        tags: node.tags,
        kind: entity.kind,
        content: node.content || [],
        breadcrumb,
      } as IDocEntry;
    });

    return { entries, defaultTarget, skippedCount };
  }

  private collectTailwindSources(
    nodes?: Descendant[]
  ): Array<{ code: string; extension: "tsx" | "html" }> {
    if (!nodes || nodes.length === 0) {
      return [];
    }
    const sources: Array<{ code: string; extension: "tsx" | "html" }> = [];
    const seen = new Set<string>();

    const addSource = (code: string, extension: "tsx" | "html") => {
      const trimmed = code?.trim();
      if (!trimmed) return;
      const key = `${extension}::${trimmed}`;
      if (seen.has(key)) return;
      seen.add(key);
      sources.push({ code: trimmed, extension });
    };

    const traverse = (node: any) => {
      if (!node || typeof node !== "object") {
        return;
      }
      for (const source of this.pluginCatalog.styleSources(node))
        addSource(source.code, source.extension);
      if (Array.isArray(node.children)) {
        node.children.forEach((child: Descendant) => traverse(child));
      }
    };

    nodes.forEach(node => traverse(node));
    return sources;
  }

  private async buildTailwindRuntimeCss(nodes?: Descendant[]): Promise<string> {
    const sources = this.collectTailwindSources(nodes);
    if (sources.length === 0) {
      return "";
    }
    const cssParts: string[] = [];
    for (const source of sources) {
      const cacheKey = `${source.extension}::${source.code}`;
      let css = this.tailwindCssCache.get(cacheKey);
      if (!css) {
        try {
          css = await this.compileTailwind(source.code, source.extension);
          if (css) {
            this.tailwindCssCache.set(cacheKey, css);
          }
        } catch (error) {
          this.logger.error("Tailwind runtime compile failed:", error);
          throw new Error("正文动态样式编译失败，请修复后重新发布", { cause: error });
        }
      }
      if (css) {
        cssParts.push(css);
      }
    }
    return cssParts.join("\n");
  }

  private getPlainTextFromDescendants(nodes: Descendant[]): string {
    if (!Array.isArray(nodes)) return "";
    const parts: string[] = [];
    for (const node of nodes as any[]) {
      if (!node) continue;
      if (typeof node.text === "string") {
        parts.push(node.text);
      }
      if (Array.isArray(node.children)) {
        parts.push(this.getPlainTextFromDescendants(node.children));
      }
    }
    return parts.join("");
  }

  private hasMeaningfulContent(content: Descendant[]): boolean {
    if (!Array.isArray(content) || content.length === 0) {
      return false;
    }
    return (
      this.getPlainTextFromDescendants(content).trim().length > 0 ||
      content.some(node => {
        const type = (node as unknown as { type?: string }).type;
        return type && !["paragraph", "header"].includes(type);
      })
    );
  }

  private createDocTimelineEntry(entry: IDocEntry): ITimelineEntry {
    return {
      type: "doc",
      id: entry.id,
      title: entry.title,
      summary: entry.summary,
      target: entry.target,
      tags: entry.tags,
      publishTime: entry.createTime,
    };
  }

  private buildTimelineEntries(
    cards: ICard[],
    articles: IArticle[],
    docTimeline: ITimelineEntry[]
  ): ITimelineEntry[] {
    const entries: ITimelineEntry[] = [
      ...cards.map(card => ({
        type: "card" as const,
        id: card.id,
        summary: this.buildSummary(card.content || []),
        target: contentRef("card", card.id),
        tags: card.tags || [],
        publishTime: card.create_time,
      })),
      ...articles.map(article => ({
        type: "article" as const,
        id: article.id,
        title: article.title,
        summary: this.buildSummary(article.content || []),
        target: contentRef("article", article.id),
        tags: article.tags || [],
        publishTime: article.create_time,
      })),
      ...docTimeline,
    ];
    return entries.sort((a, b) => b.publishTime - a.publishTime).slice(0, 20);
  }

  private buildTagStats(items: IPublishListItem[]) {
    const stats = new Map<string, number>();
    for (const item of items) {
      for (const tag of item.tags || []) {
        stats.set(tag, (stats.get(tag) || 0) + 1);
      }
    }
    return Array.from(stats.entries()).map(([name, count]) => ({
      name,
      count,
    }));
  }

  private buildSummary(content?: Descendant[], maxLength = 120): string {
    if (!content || content.length === 0) {
      return "";
    }
    const text = this.extractPlainText(content);
    if (!text) {
      return "";
    }
    return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
  }

  private extractPlainText(nodes: Descendant[]): string {
    const parts: string[] = [];
    const traverse = (node: any) => {
      if (!node) return;
      if (typeof node.text === "string") {
        parts.push(node.text);
      }
      if (node.code && typeof node.code === "string") {
        parts.push(node.code);
      }
      if (Array.isArray(node.children)) {
        node.children.forEach(traverse);
      }
    };
    nodes.forEach(traverse);
    return parts.join(" ").replace(/\s+/g, " ").trim();
  }

  private toCardListItem(card: ICard): IPublishCardListItem {
    return {
      id: card.id,
      summary: this.buildSummary(card.content || []),
      target: contentRef("card", card.id),
      createTime: card.create_time,
    };
  }
}
