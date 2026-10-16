/**
 * 发布站点生成器：按发布选择生成全部静态文件（HTML / 资源 / 搜索索引）。
 *
 * 不依赖 electron 与数据表模块——数据经 PublishDataSource 读取、Tailwind 编译经注入函数完成，
 * 因此可跑在 worker 线程里（publish-generator-worker），生成期间不阻塞主进程。
 */

import { createHash } from "crypto";
import { join } from "path";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
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
  buildSelectionContentLinkTargets,
  mergeDocEntryContentLinkTargets,
} from "./publish-content-link-targets";
import { attachPublishAppearanceSettings } from "./publish-appearance-settings";
import { resolvePublishFaviconOutput } from "./publish-favicon";
import {
  buildPublishSearchIndexPayload,
  PUBLISH_SEARCH_INDEX_HREF,
  PUBLISH_SEARCH_INDEX_PATH,
} from "./publish-search-index";
import { scopeRuntimeTailwindCss } from "./publish-tailwind-scope";
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
  getProject(id: number): Project;
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
  templateDir: string;
  compileTailwind: (code: string, extension: "tsx" | "html") => Promise<string>;
  logger: Pick<Console, "info" | "warn" | "error">;
  plugins?: PublishPluginSnapshot;
}

const TEMPLATE_ENTRY_MAP: Record<string, string> = {
  "home.html": "src/templates/home/index.html",
  "card.html": "src/templates/card/index.html",
  "article.html": "src/templates/article/index.html",
  "doc.html": "src/templates/doc/index.html",
  "quest.html": "src/templates/quest/index.html",
  "list.html": "src/templates/list/index.html",
};

// 数据占位符
const DATA_PLACEHOLDER = '"__DATA_PLACEHOLDER__"';

export interface ISiteMeta {
  title: string;
  description: string;
  basePath: string;
  publicUrl?: string;
  favicon?: IPublishFaviconConfig;
}

interface INavigationItem {
  label: string;
  href: string;
}

interface IDocEntry {
  id: number;
  entityId: number;
  title: string;
  summary: string;
  href: string;
  createTime: number;
  updateTime: number;
  tags: string[];
  kind: "project";
  content: Descendant[];
  breadcrumb: { label: string; href?: string }[];
  sidebar?: IPublishInitData["sidebar"];
}

interface ITimelineEntry {
  type: "card" | "article" | "doc" | "quest";
  id: number;
  title?: string;
  summary: string;
  href: string;
  tags: string[];
  publishTime: number;
}

interface ILinkedCardInfo {
  id: number;
  href: string;
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
  href: string;
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
    href?: string;
    title?: string;
    published: boolean;
  };
}

interface IDocCollectionMetaItem {
  type: "project";
  entityId: number;
  title: string;
  href?: string;
}

type EntityScopeConfig = { mode: "all" } | { mode: "partial"; nodes: Set<number> };
export class PublishSiteGenerator {
  private readonly templateDir: string;
  private readonly compileTailwind: PublishGeneratorOptions["compileTailwind"];
  private readonly logger: PublishGeneratorOptions["logger"];
  private readonly templateCache = new Map<string, string>();
  private readonly tailwindCssCache = new Map<string, string>();
  private readonly pluginCatalog: PublishPluginCatalog;

  constructor(options: PublishGeneratorOptions) {
    this.templateDir = options.templateDir;
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

    const faviconOutput = resolvePublishFaviconOutput(site.favicon, site.basePath);

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

  private buildSearchInitMeta(): NonNullable<IPublishInitData["search"]> {
    return {
      href: PUBLISH_SEARCH_INDEX_HREF,
    };
  }

  /**
   * 计算内容哈希
   */
  private computeHash(content: Buffer | string): string {
    return createHash("md5")
      .update(typeof content === "string" ? content : content.toString())
      .digest("hex");
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
    const files: IPublishFile[] = [];
    this.pluginCatalog.reset();

    // 复制静态资源
    const assetsDir = join(this.templateDir, "assets");
    if (existsSync(assetsDir)) {
      const assetFiles = this.readDirRecursive(assetsDir);
      for (const assetPath of assetFiles) {
        const relativePath = assetPath.replace(this.templateDir, "").replace(/\\/g, "/");
        const content = readFileSync(assetPath);
        files.push({
          path: relativePath.startsWith("/") ? relativePath.slice(1) : relativePath,
          content,
          hash: this.computeHash(content),
        });
      }
    }

    if (site.favicon) {
      if (!existsSync(site.favicon.cachePath)) {
        throw new Error("已缓存的 favicon 不存在，请重新选择后再发布");
      }
      const faviconContent = readFileSync(site.favicon.cachePath);
      const faviconOutput = resolvePublishFaviconOutput(site.favicon, site.basePath);
      files.push({
        path: faviconOutput.outputPath,
        content: faviconContent,
        hash: this.computeHash(faviconContent),
      });
    }

    const grouped = this.groupSelections(selections);
    const cards = this.loadCards(
      db,
      grouped.card.map(selection => selection.contentId)
    );
    const cardMap = new Map(cards.map(card => [card.id, card]));

    const articles = this.loadArticles(
      db,
      grouped.article.map(selection => selection.contentId)
    );
    const articleMap = new Map(articles.map(article => [article.id, article]));

    const projects = this.loadProjects(db, grouped.project);
    const projectScopes = this.buildEntityScopeMap(grouped.project);
    const questScopes = this.buildEntityScopeMap(grouped.quest);
    const hasSelectedQuests = grouped.quest.length > 0;
    const baseContentLinkTargets = buildSelectionContentLinkTargets({
      cardIds: grouped.card
        .map(selection => selection.contentId)
        .filter(contentId => cardMap.has(contentId)),
      articleIds: grouped.article
        .map(selection => selection.contentId)
        .filter(contentId => articleMap.has(contentId)),
    });

    const navigation = this.buildNavigation({
      cards: cards.length > 0,
      articles: articles.length > 0,
      quests: hasSelectedQuests,
      documents: projects.length > 0,
    });

    const cardTagTree = cards.length > 0 ? this.buildCardTagTree(cards) : undefined;

    const cardCache = new Map(cardMap);

    const docPublishResult = await this.buildDocPages(
      db,
      site,
      navigation,
      projects,
      projectScopes,
      baseContentLinkTargets,
      appearanceSettings
    );
    files.push(...docPublishResult.files);
    const docCollections = docPublishResult.collections;
    const contentLinkTargets = docPublishResult.contentLinkTargets;
    const questPublishResult = await this.buildQuestPages(
      db,
      site,
      navigation,
      grouped.quest,
      questScopes,
      cardMap,
      articleMap,
      docCollections,
      contentLinkTargets,
      appearanceSettings
    );
    files.push(...questPublishResult.files);

    if (docPublishResult.listEntries.length > 0) {
      const docListInit = this.buildDocListInitData(
        site,
        navigation,
        docPublishResult.listEntries,
        docCollections,
        contentLinkTargets,
        appearanceSettings
      );
      const docListHtml = this.injectData("list.html", docListInit, "docs/index.html");
      files.push({
        path: "docs/index.html",
        content: Buffer.from(docListHtml),
        hash: this.computeHash(docListHtml),
      });
    }

    for (const selection of grouped.card) {
      const card = cardMap.get(selection.contentId);
      if (!card) continue;

      const linkedCards = this.resolveLinkedCards(db, card, cardCache);

      const initData = this.buildCardInitData(
        site,
        navigation,
        card,
        cardTagTree,
        selection.parentPath || card.tags[0] || "",
        linkedCards,
        docCollections,
        contentLinkTargets,
        appearanceSettings
      );
      const path = `cards/${selection.contentId}.html`;
      const runtimeCss = await this.buildTailwindRuntimeCss(card.content || []);
      const html = this.injectData("card.html", initData, path, {
        inlineStyle: runtimeCss,
      });
      files.push({
        path,
        content: Buffer.from(html),
        hash: this.computeHash(html),
        sourceType: "card",
        sourceId: selection.contentId,
      });
    }

    for (const selection of grouped.article) {
      const article = articleMap.get(selection.contentId);
      if (!article) continue;

      const initData = this.buildArticleInitData(
        site,
        navigation,
        article,
        docCollections,
        contentLinkTargets,
        appearanceSettings
      );
      const path = `articles/${selection.contentId}.html`;
      const runtimeCss = await this.buildTailwindRuntimeCss(article.content || []);
      const html = this.injectData("article.html", initData, path, {
        inlineStyle: runtimeCss,
      });
      files.push({
        path,
        content: Buffer.from(html),
        hash: this.computeHash(html),
        sourceType: "article",
        sourceId: selection.contentId,
      });
    }

    if (cards.length > 0) {
      const cardListInit = this.buildListInitData(
        site,
        navigation,
        "card",
        cards,
        docCollections,
        contentLinkTargets,
        appearanceSettings
      );
      const cardListHtml = this.injectData("list.html", cardListInit, "cards/index.html");
      files.push({
        path: "cards/index.html",
        content: Buffer.from(cardListHtml),
        hash: this.computeHash(cardListHtml),
      });
    }

    if (articles.length > 0) {
      const articleListInit = this.buildListInitData(
        site,
        navigation,
        "article",
        articles,
        docCollections,
        contentLinkTargets,
        appearanceSettings
      );
      const articleListHtml = this.injectData("list.html", articleListInit, "articles/index.html");
      files.push({
        path: "articles/index.html",
        content: Buffer.from(articleListHtml),
        hash: this.computeHash(articleListHtml),
      });
    }

    if (questPublishResult.entries.length > 0) {
      const questListInit = this.buildQuestListInitData(
        site,
        navigation,
        questPublishResult.entries,
        docCollections,
        contentLinkTargets,
        appearanceSettings
      );
      const questListHtml = this.injectData("list.html", questListInit, "quests/index.html");
      files.push({
        path: "quests/index.html",
        content: Buffer.from(questListHtml),
        hash: this.computeHash(questListHtml),
      });
    }

    const homeInitData = this.buildHomeInitData(
      site,
      navigation,
      cards,
      articles,
      [...docPublishResult.timelineEntries, ...questPublishResult.timelineEntries],
      projects.length,
      docCollections,
      contentLinkTargets,
      appearanceSettings
    );
    const homeHtml = this.injectData("home.html", homeInitData, "index.html");
    files.push({
      path: "index.html",
      content: Buffer.from(homeHtml),
      hash: this.computeHash(homeHtml),
    });

    const searchIndexJson = JSON.stringify(
      buildPublishSearchIndexPayload({
        cards,
        articles,
        docs: docPublishResult.listEntries,
        quests: questPublishResult.entries,
      })
    );
    files.push({
      path: PUBLISH_SEARCH_INDEX_PATH,
      content: Buffer.from(searchIndexJson),
      hash: this.computeHash(searchIndexJson),
    });

    files.unshift(
      ...this.pluginCatalog.files().map(file => ({ ...file, hash: this.computeHash(file.content) }))
    );
    return { files, virtualProcessed: docPublishResult.skippedDocItems };
  }

  /**
   * 递归读取目录
   */
  private readDirRecursive(dir: string): string[] {
    const files: string[] = [];
    const items = readdirSync(dir);

    for (const item of items) {
      const fullPath = join(dir, item);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        files.push(...this.readDirRecursive(fullPath));
      } else {
        files.push(fullPath);
      }
    }

    return files;
  }

  /**
   * 根据目标文件路径计算相对于 assets 目录的路径
   * @param targetPath 目标文件路径，如 "cards/123.html"
   * @returns 相对路径，如 "../assets/"
   */
  private computeAssetsRelativePath(targetPath: string): string {
    const segments = targetPath.split("/").filter(Boolean);
    const depth = segments.length - 1; // 减去文件名本身

    if (depth <= 0) {
      return "./assets/";
    }

    return "../".repeat(depth) + "assets/";
  }

  /**
   * 注入数据到模板
   */
  private injectData(
    templateName: string,
    initData: IPublishInitData,
    targetPath: string,
    options?: { inlineStyle?: string }
  ): string {
    const relativePath = TEMPLATE_ENTRY_MAP[templateName] ?? templateName;
    const templatePath = join(this.templateDir, relativePath);
    let template = this.templateCache.get(templatePath);
    if (template === undefined) {
      if (!existsSync(templatePath)) {
        throw new Error(`Template not found: ${templateName}`);
      }
      template = readFileSync(templatePath, "utf-8");
      this.templateCache.set(templatePath, template);
    }

    let html = template;

    const pluginRenderers = this.pluginCatalog.dependencies(initData.content, targetPath);
    if (pluginRenderers.length) {
      const protocolFile = join(this.templateDir, "plugin-runtime.json");
      if (!existsSync(protocolFile) || JSON.parse(readFileSync(protocolFile, "utf8")).version !== 1)
        throw new Error("当前博客模板不支持插件渲染，请先更新发布模板");
      initData = { ...initData, pluginRenderers };
    }

    // 替换数据占位符
    const serialized = JSON.stringify(initData)
      .replace(/</g, "\\u003c")
      .replace(/>/g, "\\u003e")
      .replace(/\u2028/g, "\\u2028")
      .replace(/\u2029/g, "\\u2029");
    html = html.replace(DATA_PLACEHOLDER, serialized);

    // 替换资源路径：模板中的 ../../../assets/ 替换为实际相对路径
    const assetsPath = this.computeAssetsRelativePath(targetPath);
    html = html.replace(/\.\.\/\.\.\/\.\.\/assets\//g, assetsPath);

    if (initData.site.favicon) {
      html = html.replace(
        /<link rel="icon"[^>]*href="[^"]*" \/>/,
        `<link rel="icon" type="${initData.site.favicon.mimeType}" href="${initData.site.favicon.href}" />`
      );
    }

    const inlineStyle = options?.inlineStyle?.trim();
    if (inlineStyle) {
      const scopedStyle = scopeRuntimeTailwindCss(inlineStyle);
      const styleTag = `<style data-runtime-tailwind>${scopedStyle}</style>`;
      if (html.includes("</head>")) {
        html = html.replace("</head>", `${styleTag}\n</head>`);
      } else {
        html = `${styleTag}\n${html}`;
      }
    }

    return html;
  }

  /**
   * 构建首页数据
   */
  private buildHomeInitData(
    site: ISiteMeta,
    navigation: INavigationItem[],
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
        navigation,
        search: this.buildSearchInitMeta(),
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
          publishTime: Date.now(),
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
    navigation: INavigationItem[],
    card: ICard,
    cardTagTree?: IPublishCardTagTree[],
    activeTag?: string,
    linkedCards?: ILinkedCardInfo[],
    docCollections?: IPublishInitData["docCollections"],
    contentLinkTargets?: IPublishInitData["contentLinkTargets"],
    appearanceSettings?: IPublishAppearanceSettings
  ): IPublishInitData {
    return attachPublishAppearanceSettings(
      {
        site: this.buildSiteInitMeta(site),
        navigation,
        search: this.buildSearchInitMeta(),
        docCollections,
        contentLinkTargets,
        cardTagTree,
        activeTag,
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
          publishTime: Date.now(),
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
    navigation: INavigationItem[],
    article: IArticle,
    docCollections?: IPublishInitData["docCollections"],
    contentLinkTargets?: IPublishInitData["contentLinkTargets"],
    appearanceSettings?: IPublishAppearanceSettings
  ): IPublishInitData {
    return attachPublishAppearanceSettings(
      {
        site: this.buildSiteInitMeta(site),
        navigation,
        search: this.buildSearchInitMeta(),
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
          publishTime: Date.now(),
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
    navigation: INavigationItem[],
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
            href: `/cards/${card.id}.html`,
            tags: card.tags || [],
            createTime: card.create_time,
          }))
        : (records as IArticle[]).map(article => ({
            id: article.id,
            title: article.title,
            summary: this.buildSummary(article.content || []),
            href: `/articles/${article.id}.html`,
            tags: article.tags || [],
            createTime: article.create_time,
          }));
    items.sort((a, b) => b.createTime - a.createTime);
    const tagStats = this.buildTagStats(items);
    return attachPublishAppearanceSettings(
      {
        site: this.buildSiteInitMeta(site),
        navigation,
        search: this.buildSearchInitMeta(),
        docCollections,
        contentLinkTargets,
        content: {
          title: type === "card" ? "全部卡片" : "全部文章",
          type,
          items,
          tags: tagStats,
          pagination: {
            current: 1,
            total: items.length,
            pageSize: Math.max(items.length, 1),
          },
        },
        meta: {
          type: "list",
          publishTime: Date.now(),
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

  private buildNavigation(sections: {
    cards: boolean;
    articles: boolean;
    quests: boolean;
    documents: boolean;
  }): INavigationItem[] {
    const navigation: INavigationItem[] = [{ label: "首页", href: "/" }];
    if (sections.cards) {
      navigation.push({ label: "卡片", href: "/cards/" });
    }
    if (sections.articles) {
      navigation.push({ label: "文章", href: "/articles/" });
    }
    if (sections.quests) {
      navigation.push({ label: "求索录", href: "/quests/" });
    }
    return navigation;
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
      try {
        const project = db.getProject(id);
        if (project) {
          projects.push(project);
        }
      } catch (error) {
        this.logger.warn(`Project ${id} not found`, error);
      }
    }
    return projects;
  }

  private resolveLinkedCards(
    db: PublishDataSource,
    card: ICard,
    cache: Map<number, ICard>
  ): ILinkedCardInfo[] {
    const result: ILinkedCardInfo[] = [];
    for (const contentId of db.getContentLinkTargetContentIds(card.contentId)) {
      if (contentId === card.contentId) continue;
      let target = cache.get(contentId);
      if (!target) {
        target = db.getCardByContentId(contentId) || undefined;
        if (target) {
          cache.set(contentId, target);
        }
      }
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
      href: `/cards/${card.id}.html`,
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

  private async buildDocPages(
    db: PublishDataSource,
    site: ISiteMeta,
    navigation: INavigationItem[],
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
      if (result.defaultHref) {
        collectionMeta.push({
          type: "project",
          entityId: project.id,
          title: project.title || `项目 #${project.id}`,
          href: result.defaultHref,
        });
      }
    }

    const docCollections = this.buildDocCollectionsFromMeta(collectionMeta);
    const contentLinkTargets = mergeDocEntryContentLinkTargets(
      baseContentLinkTargets,
      entries.map(entry => ({
        id: entry.id,
        kind: entry.kind,
        href: entry.href,
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
          navigation,
          entry,
          prev,
          next,
          docCollections,
          contentLinkTargets,
          appearanceSettings
        );
        const path = entry.href.replace(/^\//, "");
        const runtimeCss = await this.buildTailwindRuntimeCss(entry.content || []);
        const html = this.injectData("doc.html", initData, path, {
          inlineStyle: runtimeCss,
        });
        files.push({
          path,
          content: Buffer.from(html),
          hash: this.computeHash(html),
          sourceType: entry.kind,
          sourceId: entry.id,
        });
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
    navigation: INavigationItem[],
    entry: IDocEntry,
    prev: IDocEntry | undefined,
    next: IDocEntry | undefined,
    docCollections?: IPublishInitData["docCollections"],
    contentLinkTargets?: IPublishInitData["contentLinkTargets"],
    appearanceSettings?: IPublishAppearanceSettings
  ): IPublishInitData {
    const activeCollections = this.applyActiveDocCollections(
      docCollections,
      entry.kind,
      entry.entityId
    );
    return attachPublishAppearanceSettings(
      {
        site: this.buildSiteInitMeta(site),
        navigation,
        search: this.buildSearchInitMeta(),
        sidebar: entry.sidebar,
        docCollections: activeCollections,
        contentLinkTargets,
        content: {
          id: entry.id,
          title: entry.title,
          content: entry.content || [],
          breadcrumb: entry.breadcrumb,
          prevPage: prev ? { title: prev.title, href: prev.href } : undefined,
          nextPage: next ? { title: next.title, href: next.href } : undefined,
          createTime: entry.createTime,
          updateTime: entry.updateTime,
          currentPath: entry.href,
        },
        meta: {
          type: "doc",
          publishTime: Date.now(),
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
          .filter(item => item.type === kind && item.href)
          .sort((a, b) => a.title.localeCompare(b.title, "zh-CN"))
          .map(item => ({
            id: item.entityId,
            title: item.title,
            href: item.href!,
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

  private applyActiveDocCollections(
    base: IPublishInitData["docCollections"],
    kind: IDocEntry["kind"],
    entityId: number
  ): IPublishInitData["docCollections"] {
    if (!base) return undefined;
    return base.map(collection => ({
      ...collection,
      items: collection.items.map(item => ({
        ...item,
        active: collection.type === kind && item.id === entityId ? true : undefined,
      })),
    }));
  }

  private buildDocListInitData(
    site: ISiteMeta,
    navigation: INavigationItem[],
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
        href: entry.href,
        tags: entry.tags,
        createTime: entry.createTime,
      }));
    return attachPublishAppearanceSettings(
      {
        site: this.buildSiteInitMeta(site),
        navigation,
        search: this.buildSearchInitMeta(),
        docCollections,
        contentLinkTargets,
        content: {
          title: "全部文档",
          type: "doc",
          items,
          pagination: {
            current: 1,
            total: items.length,
            pageSize: Math.max(items.length, 1),
          },
        },
        meta: {
          type: "list",
          publishTime: Date.now(),
        },
      },
      appearanceSettings
    );
  }

  private async buildQuestPages(
    db: PublishDataSource,
    site: ISiteMeta,
    navigation: INavigationItem[],
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
        navigation,
        entry,
        docCollections,
        contentLinkTargets,
        appearanceSettings
      );
      const path = entry.href.replace(/^\//, "");
      const runtimeCss = await this.buildTailwindRuntimeCss(this.collectQuestInlineContent(entry));
      const html = this.injectData("quest.html", initData, path, {
        inlineStyle: runtimeCss,
      });
      files.push({
        path,
        content: Buffer.from(html),
        hash: this.computeHash(html),
        sourceType: "quest",
        sourceId: entry.id,
      });
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
      .map(answer => this.createQuestAnswerEntry(db, answer, publishedCards, publishedArticles));

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
      href: `/quests/${question.id}.html`,
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
    publishedArticles: Map<number, IArticle>
  ): IQuestAnswerEntry {
    const source = this.resolveQuestAnswerSource(db, answer.id, publishedCards, publishedArticles);
    const shouldInline = !source?.href;

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
    publishedArticles: Map<number, IArticle>
  ): IQuestAnswerEntry["source"] {
    const card = db.getCardByContentId(contentId);
    if (card) {
      const published = publishedCards.has(card.id);
      return {
        type: "card",
        id: card.id,
        contentId,
        href: published ? `/cards/${card.id}.html` : undefined,
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
        href: published ? `/articles/${article.id}.html` : undefined,
        title: article.title || `文章 #${article.id}`,
        published,
      };
    }

    const projectItem = db.getProjectItemsByContentId(contentId)[0];
    if (projectItem) {
      return {
        type: "project-item",
        id: projectItem.id,
        contentId,
        title: projectItem.title || `项目条目 #${projectItem.id}`,
        published: false,
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
    navigation: INavigationItem[],
    entry: IQuestEntry,
    docCollections?: IPublishInitData["docCollections"],
    contentLinkTargets?: IPublishInitData["contentLinkTargets"],
    appearanceSettings?: IPublishAppearanceSettings
  ): IPublishInitData {
    return attachPublishAppearanceSettings(
      {
        site: this.buildSiteInitMeta(site),
        navigation,
        search: this.buildSearchInitMeta(),
        docCollections,
        contentLinkTargets,
        content: { ...entry },
        meta: {
          type: "quest",
          publishTime: Date.now(),
        },
      },
      appearanceSettings
    );
  }

  private buildQuestListInitData(
    site: ISiteMeta,
    navigation: INavigationItem[],
    entries: IQuestEntry[],
    docCollections?: IPublishInitData["docCollections"],
    contentLinkTargets?: IPublishInitData["contentLinkTargets"],
    appearanceSettings?: IPublishAppearanceSettings
  ): IPublishInitData {
    const items: IPublishQuestListItem[] = entries.map(entry => ({
      id: entry.id,
      title: entry.title,
      summary: entry.summary,
      href: entry.href,
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
        navigation,
        search: this.buildSearchInitMeta(),
        docCollections,
        contentLinkTargets,
        content: {
          title: "求索录",
          type: "quest",
          items,
          pagination: {
            current: 1,
            total: items.length,
            pageSize: Math.max(items.length, 1),
          },
        },
        meta: {
          type: "list",
          publishTime: Date.now(),
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
    defaultHref?: string;
    skippedCount: number;
  } {
    const rootIds = Array.isArray(project.children) ? project.children : [];
    if (rootIds.length === 0) {
      return {
        entries: [],
        sidebar: undefined,
        defaultHref: undefined,
        skippedCount: 0,
      };
    }

    const itemMap = this.loadProjectItemsMap(db, rootIds);
    if (itemMap.size === 0) {
      return {
        entries: [],
        sidebar: undefined,
        defaultHref: undefined,
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
        defaultHref: undefined,
        skippedCount: 0,
      };
    }

    const basePath = `/docs/project/${project.id}`;
    const sidebar = this.buildSidebarTree(
      project.title || `项目 #${project.id}`,
      treeNodes,
      nodeId => `${basePath}/${nodeId}.html`
    );

    const { entries, defaultHref, skippedCount } = this.collectDocEntriesFromTree(
      treeNodes,
      {
        entityId: project.id,
        title: project.title || `项目 #${project.id}`,
        kind: "project",
        basePath,
      },
      sidebar
    );

    return { entries, sidebar, defaultHref, skippedCount };
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
    hrefBuilder: (nodeId: number) => string
  ): IPublishInitData["sidebar"] {
    const children = this.buildSidebarBranch(nodes, hrefBuilder) || [];
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
    hrefBuilder: (nodeId: number) => string
  ): IPublishInitData["sidebar"] {
    return nodes.map(node => {
      const childNodes = node.children || [];
      return {
        title: node.title || `文档 ${node.id}`,
        href: node.hasContent ? hrefBuilder(node.id) : undefined,
        children: childNodes.length ? this.buildSidebarBranch(childNodes, hrefBuilder) : undefined,
      };
    });
  }

  private collectDocEntriesFromTree(
    nodes: IDocTreeNode[],
    entity: {
      entityId: number;
      title: string;
      kind: IDocEntry["kind"];
      basePath: string;
    },
    sidebar?: IPublishInitData["sidebar"]
  ): { entries: IDocEntry[]; defaultHref?: string; skippedCount: number } {
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

    let defaultHref: string | undefined;
    const entries = entryInfos.map(({ node, ancestors }) => {
      const href = `${entity.basePath}/${node.id}.html`;
      if (!defaultHref) {
        defaultHref = href;
      }
      const breadcrumb = [
        {
          label: entity.title,
          href: defaultHref,
        },
        ...ancestors.map(ancestor => {
          const ancestorHref = ancestor.hasContent
            ? `${entity.basePath}/${ancestor.id}.html`
            : undefined;
          return {
            label: ancestor.title,
            href: ancestorHref,
          };
        }),
        {
          label: node.title,
          href,
        },
      ];
      return {
        id: node.id,
        entityId: entity.entityId,
        title: node.title,
        summary: this.buildSummary(node.content || []),
        href,
        createTime: node.createTime,
        updateTime: node.updateTime,
        tags: node.tags,
        kind: entity.kind,
        content: node.content || [],
        breadcrumb,
        sidebar,
      } as IDocEntry;
    });

    return { entries, defaultHref, skippedCount };
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
      const type = typeof node.type === "string" ? node.type : "";
      for (const source of this.pluginCatalog.styleSources(node))
        addSource(source.code, source.extension);
      if ((type === "html-block" || type === "html-inline") && typeof node.html === "string") {
        addSource(node.html, "html");
      }
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
          css = "";
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
    return this.getPlainTextFromDescendants(content).trim().length > 0;
  }

  private createDocTimelineEntry(entry: IDocEntry): ITimelineEntry {
    return {
      type: "doc",
      id: entry.id,
      title: entry.title,
      summary: entry.summary,
      href: entry.href,
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
      href: entry.href,
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
        href: `/cards/${card.id}.html`,
        tags: card.tags || [],
        publishTime: card.create_time,
      })),
      ...articles.map(article => ({
        type: "article" as const,
        id: article.id,
        title: article.title,
        summary: this.buildSummary(article.content || []),
        href: `/articles/${article.id}.html`,
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
      href: `/cards/${card.id}.html`,
      createTime: card.create_time,
    };
  }
}
