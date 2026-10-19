/**
 * 发布站点生成器：按发布选择生成数据、资源与搜索索引，并复制作者静态产物。
 *
 * 不依赖 electron 与数据表模块——数据经 PublishDataSource 读取、Tailwind 编译经注入函数完成，
 * 因此可跑在 worker 线程里（publish-generator-worker），生成期间不阻塞主进程。
 */

import type { ContentRef } from "@tau/plugins/publish-data";
import type { TemplatePackage } from "../services/template-package";
import { PublishDataOutput } from "./publish-data-output";
import { existsSync, readFileSync } from "fs";
import type { Descendant } from "slate";
import { PublishPluginCatalog, type PublishPluginSnapshot } from "../services/plugin-publish";
import type {
  IPublishFile,
  PublishContentType,
  IPublishInitData,
  IPublishCardTagTree,
  IPublishCardListItem,
  IPublishListItem,
  IPublishAppearanceSettings,
  IPublishFaviconConfig,
  IPublishQuestListItem,
  IPublishQuestStatus,
} from "@/types/publish";
import type { ICard } from "@/types/card";
import type { IArticle } from "@/types/article";
import { Project, ProjectItem, EProjectItemType } from "@/types/project";
import type { IQuestion, IAnswer, QuestionDetail } from "@/types/question";
import type { QuestionGroup } from "./tables/question-group";
import {
  contentRef,
  buildSelectionContentLinkTargets,
  mergeDocEntryContentLinkTargets,
} from "./publish-content-link-targets";
import { attachPublishAppearanceSettings } from "./publish-appearance-settings";
import { resolvePublishFaviconOutput } from "./publish-favicon";
import { buildPublishSearchIndexPayload } from "./publish-search-index";

import { resolveQuestActivityTime } from "./publish-quest-time";
import {
  buildQuestMaterials,
  buildQuestTrail,
  type IQuestMaterialEntry,
  type IQuestTrailEntry,
} from "./publish-quest-research";

/** 生成所需的只读数据访问（主进程直连数据库；worker 内经同步 RPC 转发到主进程） */
export interface PublishDataSource {
  getCardByIds(ids: number[]): ICard[];
  getCardById(id: number): ICard | null;
  getCardByContentId(contentId: number): ICard | null;
  /** 正文显式连接的对方正文（按建立时间排序） */
  getContentLinkTargetContentIds(contentId: number): number[];
  getArticleByIds(ids: number[]): IArticle[];
  getArticleByContentId(contentId: number): IArticle | null;
  getProject(id: number): Project | null;
  getProjectItemsByIds(ids: number[]): ProjectItem[];
  getProjectItemsByContentId(contentId: number): ProjectItem[];
  listQuestionGroups(): QuestionGroup[];
  listQuestionsByGroup(groupId: number, filter: "all", search: string): IQuestion[];
  getQuestionAnswerById(id: number): IAnswer | null;
  /** 问题的探究材料、对话与轨迹 */
  getQuestionDetail(questionId: number): QuestionDetail | null;
}

export interface PublishSelectionInput {
  contentType: PublishContentType;
  contentId: number;
  parentPath: string;
}

export interface PublishGeneratorOptions {
  clientSource?: string;
  template: TemplatePackage;
  compileTailwind: (code: string, extension: "tsx" | "html") => Promise<string>;
  logger: Pick<Console, "info" | "warn" | "error">;
  plugins?: PublishPluginSnapshot;
}

export interface ISiteMeta {
  destination?: string;
  templateId?: string;
  title: string;
  description: string;
  basePath: string;
  publicUrl?: string;
  favicon?: IPublishFaviconConfig;
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
  sidebar?: IPublishInitData["sidebar"];
}

interface ITimelineEntry {
  type: "card" | "article" | "doc" | "quest";
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

interface IQuestEntry {
  id: number;
  title: string;
  summary: string;
  target: ContentRef;
  groupId: number;
  groupTitle: string;
  groupColor?: string;
  status: IPublishQuestStatus;
  answers: IQuestAnswerEntry[];
  /** 参考资料（据），编号即 index */
  materials: IQuestMaterialEntry[];
  /** 探索过程（径） */
  trail: IQuestTrailEntry[];
  description?: Descendant[];
  createTime: number;
  updateTime: number;
  resolvedTime?: number | null;
}

interface IQuestAnswerEntry {
  id: number;
  createTime: number;
  updateTime: number;
  content?: Descendant[];
  source?: {
    type: "card" | "article" | "project-item" | "custom";
    id?: number;
    contentId: number;
    target?: ContentRef;
    title?: string;
    published: boolean;
  };
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
  private readonly clientSource?: string;
  private readonly template: TemplatePackage;
  private output!: PublishDataOutput;
  private readonly compileTailwind: PublishGeneratorOptions["compileTailwind"];
  private readonly logger: PublishGeneratorOptions["logger"];
  private readonly tailwindCssCache = new Map<string, string>();
  private readonly pluginCatalog: PublishPluginCatalog;

  constructor(options: PublishGeneratorOptions) {
    this.clientSource = options.clientSource;
    this.template = options.template;
    this.compileTailwind = options.compileTailwind;
    this.logger = options.logger;
    this.pluginCatalog = new PublishPluginCatalog(options.plugins);
  }

  /** 生成全部发布文件 */
  generate(
    db: PublishDataSource,
    selections: PublishSelectionInput[],
    site: ISiteMeta,
    appearanceSettings?: IPublishAppearanceSettings
  ): Promise<{ files: IPublishFile[]; virtualProcessed: number }> {
    return this.generatePublishFiles(db, selections, site, appearanceSettings);
  }

  private buildSiteInitMeta(site: ISiteMeta): IPublishInitData["site"] {
    if (!site.favicon) {
      return {
        title: site.title,
        description: site.description,
        basePath: site.basePath,
        publicUrl: site.publicUrl,
      };
    }

    const faviconOutput = this.favicon!.output;

    return {
      title: site.title,
      description: site.description,
      basePath: site.basePath,
      publicUrl: site.publicUrl,
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
  ): Promise<{ files: IPublishFile[]; virtualProcessed: number }> {
    this.output = new PublishDataOutput((data, dataPath) =>
      this.pluginCatalog.dependencies(data, dataPath)
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
    const docResult = await this.buildDocData(
      db,
      site,
      projects,
      this.buildEntityScopeMap(grouped.project),
      baseTargets,
      appearanceSettings
    );
    const targets = docResult.contentLinkTargets;
    const collections = docResult.collections;
    const questResult = await this.buildQuestData(
      db,
      site,
      grouped.quest,
      this.buildEntityScopeMap(grouped.quest),
      cardMap,
      articleMap,
      collections,
      targets,
      appearanceSettings
    );
    const tagTree = cards.length ? this.buildCardTagTree(cards) : undefined;
    for (const selection of grouped.card) {
      const card = cardMap.get(selection.contentId);
      if (!card) continue;
      const data = this.buildCardInitData(
        site,
        card,
        tagTree,
        this.resolveLinkedCards(db, card, cardsByContentId),
        collections,
        targets,
        appearanceSettings
      );
      this.output.data(
        contentRef("card", card.id),
        data,
        await this.buildTailwindRuntimeCss(card.content)
      );
    }
    for (const article of articles) {
      this.output.data(
        contentRef("article", article.id),
        this.buildArticleInitData(site, article, collections, targets, appearanceSettings),
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
          this.buildListInitData(
            site,
            type,
            records as ICard[] | IArticle[],
            collections,
            targets,
            appearanceSettings
          )
        );
    }
    if (docResult.listEntries.length)
      this.output.data(
        { key: "list:doc", type: "list" },
        this.buildDocListInitData(
          site,
          docResult.listEntries,
          collections,
          targets,
          appearanceSettings
        )
      );
    if (questResult.entries.length)
      this.output.data(
        { key: "list:quest", type: "list" },
        this.buildQuestListInitData(
          site,
          questResult.entries,
          collections,
          targets,
          appearanceSettings
        )
      );
    this.output.data(
      contentRef("home"),
      this.buildHomeInitData(
        site,
        cards,
        articles,
        [...docResult.timelineEntries, ...questResult.timelineEntries],
        projects.length,
        collections,
        targets,
        appearanceSettings
      )
    );
    for (const file of this.pluginCatalog.files()) this.output.add(file);
    if (this.favicon) {
      this.output.add({
        path: this.favicon.output.outputPath,
        content: this.favicon.content,
      });
    }
    const search = buildPublishSearchIndexPayload({
      cards,
      articles,
      docs: docResult.listEntries,
      quests: questResult.entries,
    });
    return {
      files: this.output.finish(
        this.template,
        this.buildSiteInitMeta(site),
        search,
        this.clientSource
      ),
      virtualProcessed: docResult.skippedDocItems,
    };
  }

  /**
   * 构建首页数据
   */
  private buildHomeInitData(
    site: ISiteMeta,
    cards: ICard[],
    articles: IArticle[],
    docTimeline: ITimelineEntry[],
    projectCount: number,
    docCollections?: IPublishInitData["docCollections"],
    contentLinkTargets?: IPublishInitData["contentLinkTargets"],
    appearanceSettings?: IPublishAppearanceSettings
  ): IPublishInitData {
    const timeline = this.buildTimelineEntries(cards, articles, docTimeline);
    const hero =
      site.description && site.description.trim().length > 0
        ? {
            title: site.title,
            description: site.description,
          }
        : undefined;

    return attachPublishAppearanceSettings(
      {
        site: this.buildSiteInitMeta(site),
        docCollections,
        contentLinkTargets,
        content: {
          hero,
          timeline,
          stats: {
            articles: articles.length,
            cards: cards.length,
          },
          docStats: {
            projects: projectCount,
          },
        },
        meta: {
          type: "home",
          publishTime: 0,
        },
      },
      appearanceSettings
    );
  }

  /**
   * 构建卡片页面数据
   */
  private buildCardInitData(
    site: ISiteMeta,
    card: ICard,
    cardTagTree?: IPublishCardTagTree[],
    linkedCards?: ILinkedCardInfo[],
    docCollections?: IPublishInitData["docCollections"],
    contentLinkTargets?: IPublishInitData["contentLinkTargets"],
    appearanceSettings?: IPublishAppearanceSettings
  ): IPublishInitData {
    return attachPublishAppearanceSettings(
      {
        site: this.buildSiteInitMeta(site),
        docCollections,
        contentLinkTargets,
        cardTagTree,
        content: {
          id: card.id,
          content: card.content || [],
          tags: card.tags || [],
          createTime: card.create_time,
          updateTime: card.update_time,
          linkedCards,
        },
        meta: {
          type: "card",
          publishTime: 0,
        },
      },
      appearanceSettings
    );
  }

  /**
   * 构建文章页面数据
   */
  private buildArticleInitData(
    site: ISiteMeta,
    article: IArticle,
    docCollections?: IPublishInitData["docCollections"],
    contentLinkTargets?: IPublishInitData["contentLinkTargets"],
    appearanceSettings?: IPublishAppearanceSettings
  ): IPublishInitData {
    return attachPublishAppearanceSettings(
      {
        site: this.buildSiteInitMeta(site),
        docCollections,
        contentLinkTargets,
        content: {
          id: article.id,
          title: article.title,
          author: article.author,
          content: article.content || [],
          tags: article.tags || [],
          bannerBg: article.bannerBg,
          createTime: article.create_time,
          updateTime: article.update_time,
        },
        meta: {
          type: "article",
          publishTime: 0,
        },
      },
      appearanceSettings
    );
  }

  /**
   * 构建列表页面数据
   */
  private buildListInitData(
    site: ISiteMeta,
    type: "card" | "article",
    records: ICard[] | IArticle[],
    docCollections?: IPublishInitData["docCollections"],
    contentLinkTargets?: IPublishInitData["contentLinkTargets"],
    appearanceSettings?: IPublishAppearanceSettings
  ): IPublishInitData {
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
    return attachPublishAppearanceSettings(
      {
        site: this.buildSiteInitMeta(site),
        docCollections,
        contentLinkTargets,
        content: {
          title: type === "card" ? "全部卡片" : "全部文章",
          type,
          items,
          tags: tagStats,
        },
        meta: {
          type: "list",
          publishTime: 0,
        },
      },
      appearanceSettings
    );
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
      quest: selections.filter(item => item.contentType === "quest"),
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
    site: ISiteMeta,
    projects: Project[],
    projectScopes: Map<number, EntityScopeConfig>,
    baseContentLinkTargets?: IPublishInitData["contentLinkTargets"],
    appearanceSettings?: IPublishAppearanceSettings
  ): Promise<{
    files: IPublishFile[];
    listEntries: IDocEntry[];
    timelineEntries: ITimelineEntry[];
    collections?: IPublishInitData["docCollections"];
    contentLinkTargets?: IPublishInitData["contentLinkTargets"];
    skippedDocItems: number;
  }> {
    const files: IPublishFile[] = [];
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
    const contentLinkTargets = mergeDocEntryContentLinkTargets(
      baseContentLinkTargets,
      entries.map(entry => ({
        id: entry.id,
        kind: entry.kind,
        target: entry.target,
        title: entry.title,
      }))
    );

    for (const entityEntries of entityEntryMap.values()) {
      for (let i = 0; i < entityEntries.length; i++) {
        const entry = entityEntries[i];
        const prev = entityEntries[i - 1];
        const next = entityEntries[i + 1];
        const initData = this.buildDocInitData(
          site,
          entry,
          prev,
          next,
          docCollections,
          contentLinkTargets,
          appearanceSettings
        );
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
      contentLinkTargets,
      skippedDocItems,
    };
  }

  private buildDocInitData(
    site: ISiteMeta,
    entry: IDocEntry,
    prev: IDocEntry | undefined,
    next: IDocEntry | undefined,
    docCollections?: IPublishInitData["docCollections"],
    contentLinkTargets?: IPublishInitData["contentLinkTargets"],
    appearanceSettings?: IPublishAppearanceSettings
  ): IPublishInitData {
    return attachPublishAppearanceSettings(
      {
        site: this.buildSiteInitMeta(site),
        sidebar: entry.sidebar,
        docCollections,
        contentLinkTargets,
        content: {
          id: entry.id,
          title: entry.title,
          content: entry.content || [],
          breadcrumb: entry.breadcrumb,
          prevPage: prev ? { title: prev.title, target: prev.target } : undefined,
          nextPage: next ? { title: next.title, target: next.target } : undefined,
          createTime: entry.createTime,
          updateTime: entry.updateTime,
          projectId: entry.entityId,
        },
        meta: {
          type: "doc",
          publishTime: 0,
        },
      },
      appearanceSettings
    );
  }

  private buildDocCollectionsFromMeta(
    meta: IDocCollectionMetaItem[]
  ): IPublishInitData["docCollections"] {
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
      .filter(Boolean) as IPublishInitData["docCollections"];

    return collections && collections.length > 0 ? collections : undefined;
  }

  private buildDocListInitData(
    site: ISiteMeta,
    entries: IDocEntry[],
    docCollections?: IPublishInitData["docCollections"],
    contentLinkTargets?: IPublishInitData["contentLinkTargets"],
    appearanceSettings?: IPublishAppearanceSettings
  ): IPublishInitData {
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
    return attachPublishAppearanceSettings(
      {
        site: this.buildSiteInitMeta(site),
        docCollections,
        contentLinkTargets,
        content: {
          title: "全部文档",
          type: "doc",
          items,
        },
        meta: {
          type: "list",
          publishTime: 0,
        },
      },
      appearanceSettings
    );
  }

  private async buildQuestData(
    db: PublishDataSource,
    site: ISiteMeta,
    selections: Array<{ contentId: number; parentPath: string }>,
    scopes: Map<number, EntityScopeConfig>,
    publishedCards: Map<number, ICard>,
    publishedArticles: Map<number, IArticle>,
    docCollections?: IPublishInitData["docCollections"],
    contentLinkTargets?: IPublishInitData["contentLinkTargets"],
    appearanceSettings?: IPublishAppearanceSettings
  ): Promise<{
    files: IPublishFile[];
    entries: IQuestEntry[];
    timelineEntries: ITimelineEntry[];
  }> {
    if (selections.length === 0) {
      return { files: [], entries: [], timelineEntries: [] };
    }

    const files: IPublishFile[] = [];
    const entries: IQuestEntry[] = [];
    const groupMap = new Map(db.listQuestionGroups().map(group => [group.id, group]));

    for (const selection of selections) {
      const group = groupMap.get(selection.contentId);
      if (!group) continue;
      const questions = this.loadSelectedQuestQuestions(db, group.id, scopes.get(group.id));
      for (const question of questions) {
        const entry = this.createQuestEntry(
          db,
          question,
          group,
          publishedCards,
          publishedArticles,
          contentLinkTargets
        );
        entries.push(entry);
      }
    }

    entries.sort(
      (a, b) => resolveQuestActivityTime(b) - resolveQuestActivityTime(a) || b.id - a.id
    );

    for (const entry of entries) {
      const initData = this.buildQuestInitData(
        site,
        entry,
        docCollections,
        contentLinkTargets,
        appearanceSettings
      );
      const runtimeCss = await this.buildTailwindRuntimeCss(this.collectQuestInlineContent(entry));
      files.push(this.output.data(entry.target, initData, runtimeCss));
    }

    return {
      files,
      entries,
      timelineEntries: entries.map(entry => this.createQuestTimelineEntry(entry)),
    };
  }

  private loadSelectedQuestQuestions(
    db: PublishDataSource,
    groupId: number,
    scope?: EntityScopeConfig
  ): IQuestion[] {
    const questions = db.listQuestionsByGroup(groupId, "all", "");
    if (!scope || scope.mode === "all") {
      return questions;
    }
    return questions.filter(question => scope.nodes.has(question.id));
  }

  private createQuestEntry(
    db: PublishDataSource,
    question: IQuestion,
    group: QuestionGroup,
    publishedCards: Map<number, ICard>,
    publishedArticles: Map<number, IArticle>,
    contentLinkTargets?: IPublishInitData["contentLinkTargets"]
  ): IQuestEntry {
    const detail = db.getQuestionDetail(question.id);
    // 只有独立答案进「解」；关联的卡片 / 文章等是资料，进「据」
    const answerContentIds = (detail?.materials ?? [])
      .filter(material => material.targetType === "answer" && !material.missing)
      .map(material => material.contentId)
      .filter((id): id is number => id != null);
    const answers = answerContentIds
      .map(contentId => db.getQuestionAnswerById(contentId))
      .filter((answer): answer is IAnswer => Boolean(answer))
      .map(answer =>
        this.createQuestAnswerEntry(
          db,
          answer,
          publishedCards,
          publishedArticles,
          contentLinkTargets
        )
      );

    const summary =
      this.buildSummary(question.description || [], 96) ||
      answers
        .map(answer => this.buildSummary(answer.content || [], 96))
        .find(text => text.length > 0) ||
      (answers.length > 0 ? `收录 ${answers.length} 个答案` : "暂未记录答案");
    const activityTime = resolveQuestActivityTime({
      createTime: question.createTime,
      answers,
    });
    const { materials, indexByKey } = buildQuestMaterials(
      detail ?? { materials: [], chats: [] },
      contentLinkTargets
    );

    return {
      id: question.id,
      title: question.questionContent || `求索 #${question.id}`,
      summary,
      target: contentRef("quest", question.id),
      groupId: group.id,
      groupTitle: group.title,
      groupColor: group.color,
      status: question.status,
      answers,
      materials,
      trail: buildQuestTrail(detail?.events ?? [], indexByKey),
      description: question.description,
      createTime: question.createTime,
      updateTime: activityTime,
      resolvedTime: question.resolvedTime,
    };
  }

  private createQuestAnswerEntry(
    db: PublishDataSource,
    answer: IAnswer,
    publishedCards: Map<number, ICard>,
    publishedArticles: Map<number, IArticle>,
    targets?: IPublishInitData["contentLinkTargets"]
  ): IQuestAnswerEntry {
    const source = this.resolveQuestAnswerSource(
      db,
      answer.id,
      publishedCards,
      publishedArticles,
      targets
    );
    const shouldInline = !source?.target;

    return {
      id: answer.id,
      createTime: answer.createTime,
      updateTime: answer.updateTime,
      content: shouldInline ? answer.content || [] : undefined,
      source,
    };
  }

  private resolveQuestAnswerSource(
    db: PublishDataSource,
    contentId: number,
    publishedCards: Map<number, ICard>,
    publishedArticles: Map<number, IArticle>,
    targets?: IPublishInitData["contentLinkTargets"]
  ): IQuestAnswerEntry["source"] {
    const card = db.getCardByContentId(contentId);
    if (card) {
      const published = publishedCards.has(card.id);
      return {
        type: "card",
        id: card.id,
        contentId,
        target: published ? contentRef("card", card.id) : undefined,
        title: this.buildSummary(card.content || [], 48) || `卡片 #${card.id}`,
        published,
      };
    }

    const article = db.getArticleByContentId(contentId);
    if (article) {
      const published = publishedArticles.has(article.id);
      return {
        type: "article",
        id: article.id,
        contentId,
        target: published ? contentRef("article", article.id) : undefined,
        title: article.title || `文章 #${article.id}`,
        published,
      };
    }

    const projectItems = db.getProjectItemsByContentId(contentId);
    const projectItem =
      projectItems.find(item => targets?.[`project-item:${item.id}`]) ?? projectItems[0];
    if (projectItem) {
      return {
        type: "project-item",
        id: projectItem.id,
        contentId,
        title: projectItem.title || `项目条目 #${projectItem.id}`,
        target: targets?.[`project-item:${projectItem.id}`],
        published: Boolean(targets?.[`project-item:${projectItem.id}`]),
      };
    }

    return {
      type: "custom",
      contentId,
      published: false,
    };
  }

  private buildQuestInitData(
    site: ISiteMeta,
    entry: IQuestEntry,
    docCollections?: IPublishInitData["docCollections"],
    contentLinkTargets?: IPublishInitData["contentLinkTargets"],
    appearanceSettings?: IPublishAppearanceSettings
  ): IPublishInitData {
    return attachPublishAppearanceSettings(
      {
        site: this.buildSiteInitMeta(site),
        docCollections,
        contentLinkTargets,
        content: { ...entry },
        meta: {
          type: "quest",
          publishTime: 0,
        },
      },
      appearanceSettings
    );
  }

  private buildQuestListInitData(
    site: ISiteMeta,
    entries: IQuestEntry[],
    docCollections?: IPublishInitData["docCollections"],
    contentLinkTargets?: IPublishInitData["contentLinkTargets"],
    appearanceSettings?: IPublishAppearanceSettings
  ): IPublishInitData {
    const items: IPublishQuestListItem[] = entries.map(entry => ({
      id: entry.id,
      title: entry.title,
      summary: entry.summary,
      target: entry.target,
      tags: [entry.groupTitle],
      groupId: entry.groupId,
      groupTitle: entry.groupTitle,
      status: entry.status,
      answerCount: entry.answers.length,
      createTime: entry.createTime,
      updateTime: resolveQuestActivityTime(entry),
    }));

    return attachPublishAppearanceSettings(
      {
        site: this.buildSiteInitMeta(site),
        docCollections,
        contentLinkTargets,
        content: {
          title: "求索录",
          type: "quest",
          items,
        },
        meta: {
          type: "list",
          publishTime: 0,
        },
      },
      appearanceSettings
    );
  }

  private collectQuestInlineContent(entry: IQuestEntry): Descendant[] {
    return [...(entry.description || []), ...entry.answers.flatMap(answer => answer.content || [])];
  }

  private buildProjectDocEntries(
    db: PublishDataSource,
    project: Project,
    scope?: EntityScopeConfig
  ): {
    entries: IDocEntry[];
    sidebar?: IPublishInitData["sidebar"];
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

    const { entries, defaultTarget, skippedCount } = this.collectDocEntriesFromTree(
      treeNodes,
      {
        entityId: project.id,
        title: project.title || `项目 #${project.id}`,
        kind: "project",
        projectId,
      },
      sidebar
    );

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
  ): IPublishInitData["sidebar"] {
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
  ): IPublishInitData["sidebar"] {
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
    },
    sidebar?: IPublishInitData["sidebar"]
  ): { entries: IDocEntry[]; defaultTarget?: ContentRef; skippedCount: number } {
    const entryInfos: Array<{ node: IDocTreeNode; ancestors: IDocTreeNode[] }> = [];
    let skippedCount = 0;

    const traverse = (node: IDocTreeNode, ancestors: IDocTreeNode[]): void => {
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
        sidebar,
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

  private createQuestTimelineEntry(entry: IQuestEntry): ITimelineEntry {
    return {
      type: "quest",
      id: entry.id,
      title: entry.title,
      summary: entry.summary,
      target: entry.target,
      tags: [entry.groupTitle],
      publishTime: resolveQuestActivityTime(entry),
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
