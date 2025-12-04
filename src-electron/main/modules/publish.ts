import { ipcMain, BrowserWindow, app } from "electron";
import { Module } from "../types/module";
import {
  createPublishProvider,
  IPublishProvider,
  DEFAULT_UPLOAD_OPTIONS,
  IUploadOptions,
  computeBasePath,
  IGithubPagesConfig,
  IS3HostingConfig,
} from "./publish-providers";
import simpleGit, { SimpleGit } from "simple-git";
import PublishSelectionTable from "./tables/publish-selection";
import PublishHistoryTable from "./tables/publish-history";
import DatabaseModule from "./database";
import {
  IPublishFile,
  IPublishPlan,
  IPublishResult,
  IPublishProgress,
  PublishContentType,
  IPublishInitData,
  IPublishCardTagTree,
  IPublishCardListItem,
  IPublishListItem,
} from "@/types/publish";
import { createHash } from "crypto";
import { join, resolve, dirname } from "path";
import {
  existsSync,
  mkdirSync,
  rmSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
} from "fs";
import log from "electron-log";
import AdmZip from "adm-zip";
import BackendWebSocketServer from "../utils/BackendWebSocketServer";
import CardTable from "./tables/card";
import ArticleTable from "./tables/article";
import ProjectTable from "./tables/project";
import DocumentTable from "./tables/document";
import { ICard } from "@/types/card";
import { IArticle } from "@/types/article";
import { Project, ProjectItem, EProjectItemType } from "@/types/project";
import { IDocument, IDocumentItem } from "@/types/document";
import { Descendant } from "slate";

const BUNDLED_TEMPLATE_ZIP_NAME = "publish-template.zip";
const TEMPLATE_CACHE_DIR_NAME = "publish-template";
const TEMPLATE_ENTRY_MAP: Record<string, string> = {
  "home.html": "src/templates/home/index.html",
  "card.html": "src/templates/card/index.html",
  "article.html": "src/templates/article/index.html",
  "doc.html": "src/templates/doc/index.html",
  "list.html": "src/templates/list/index.html",
};

// 数据占位符
const DATA_PLACEHOLDER = '"__DATA_PLACEHOLDER__"';

interface ISiteMeta {
  title: string;
  description: string;
  basePath: string;
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
  kind: "project" | "document";
  content: Descendant[];
  breadcrumb: { label: string; href?: string }[];
  sidebar?: IPublishInitData["sidebar"];
}

interface ITimelineEntry {
  type: "card" | "article" | "doc";
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
  category: ICard["category"];
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
  children: IDocTreeNode[];
  content: Descendant[];
  createTime: number;
  updateTime: number;
  hasContent: boolean;
}

interface IDocCollectionMetaItem {
  type: "project" | "document";
  entityId: number;
  title: string;
  href?: string;
}

type EntityScopeConfig =
  | { mode: "all" }
  | { mode: "partial"; nodes: Set<number> };

type ExecutePublishConfig =
  | {
      providerType: "github";
      providerConfig: IGithubPagesConfig;
      siteConfig: { title: string; description: string };
      options?: IUploadOptions;
    }
  | {
      providerType: "s3";
      providerConfig: IS3HostingConfig;
      siteConfig: { title: string; description: string };
      options?: IUploadOptions;
    };

type GithubExecuteConfig = Extract<
  ExecutePublishConfig,
  { providerType: "github" }
>;

class PublishModule implements Module {
  name = "publish";
  private templateDir: string | null = null;
  private backendServer: BackendWebSocketServer | null = null;
  private progressWarningLogged = false;
  private pendingProgressEvents: IPublishProgress[] = [];

  async init() {
    // 获取发布配置
    ipcMain.handle("get-publish-config", async (event) => {
      const db = this.getDatabase(event);
      if (!db) return null;

      const selections = PublishSelectionTable.getAll(db);
      return { selections };
    });

    // 下载并解压模板
    ipcMain.handle("download-publish-template", async () => {
      return this.ensureTemplateReady();
    });

    // 执行发布
    ipcMain.handle(
      "execute-publish",
      async (event, config: ExecutePublishConfig) => {
        const db = this.getDatabase(event);
        if (!db) {
          throw new Error("Database not available");
        }

        const siteMeta = this.resolveSiteMeta(
          config.providerType,
          config.providerConfig,
          config.siteConfig,
        );

        return this.executePublish(db, config, siteMeta);
      },
    );

    // 重试失败的文件
    ipcMain.handle(
      "retry-publish-files",
      async (
        _event,
        config: {
          providerType: "github" | "s3";
          providerConfig: Record<string, unknown>;
          files: IPublishFile[];
          options?: IUploadOptions;
        },
      ) => {
        return this.retryPublish(config);
      },
    );

    // 预览发布计划
    ipcMain.handle("preview-publish-plan", async (event) => {
      const db = this.getDatabase(event);
      if (!db) {
        throw new Error("Database not available");
      }

      const siteMeta: ISiteMeta = {
        title: "我的博客",
        description: "",
        basePath: "/",
      };

      return this.buildPublishPlan(db, siteMeta);
    });

    // 导出构建产物
    ipcMain.handle(
      "export-publish-output",
      async (
        event,
        payload: {
          targetDir: string;
          providerType: "github" | "s3" | "local";
          providerConfig?: Record<string, unknown>;
          siteConfig: { title: string; description: string };
        },
      ) => {
        const db = this.getDatabase(event);
        if (!db) {
          throw new Error("Database not available");
        }

        const siteMeta = this.resolveSiteMeta(
          payload.providerType,
          payload.providerConfig || {},
          payload.siteConfig,
        );

        return this.exportPublishOutput(db, siteMeta, payload.targetDir);
      },
    );

    // 检查连接
    ipcMain.handle(
      "check-publish-connection",
      async (
        _event,
        config: {
          providerType: "github" | "s3";
          providerConfig: Record<string, unknown>;
        },
      ) => {
        const provider = createPublishProvider({
          type: config.providerType,
          [config.providerType]: config.providerConfig,
        });
        return provider.checkConnection();
      },
    );
  }

  private async exportPublishOutput(
    db: import("better-sqlite3").Database,
    site: ISiteMeta,
    targetDir: string,
  ): Promise<string[]> {
    const selections = PublishSelectionTable.getAll(db);
    const { files } = await this.generatePublishFiles(db, selections, site);

    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, { recursive: true });
    }

    for (const file of files) {
      const filePath = join(targetDir, file.path);
      const dir = dirname(filePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(filePath, file.content);
    }

    return files.map((file) => join(targetDir, file.path));
  }

  setBackendServer(server: BackendWebSocketServer) {
    this.backendServer = server;
    if (this.pendingProgressEvents.length > 0) {
      for (const event of this.pendingProgressEvents) {
        this.backendServer.sendNotification("publish-progress", event);
      }
      this.pendingProgressEvents = [];
    }
  }

  private resolveSiteMeta(
    providerType: "github" | "s3" | "local",
    providerConfig: unknown,
    siteConfig: { title: string; description: string },
  ): ISiteMeta {
    let basePath = "/";
    if (providerType === "local") {
      const raw =
        typeof (providerConfig as { basePath?: string })?.basePath === "string"
          ? ((providerConfig as { basePath?: string }).basePath as string)
          : "/";
      basePath = this.normalizeBasePath(raw);
    } else {
      basePath = computeBasePath(providerType, {
        type: providerType,
        [providerType]: providerConfig,
      } as any);
    }
    return {
      title: siteConfig?.title?.trim() || "我的博客",
      description: siteConfig?.description || "",
      basePath,
    };
  }

  private getDatabase(event: Electron.IpcMainInvokeEvent) {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return null;

    const dbName = DatabaseModule.windowToDatabase.get(win.id);
    if (!dbName) return null;

    return DatabaseModule.getDatabase(dbName);
  }

  private async ensureTemplateReady(): Promise<string> {
    if (this.templateDir && existsSync(this.templateDir)) {
      return this.templateDir;
    }
    const templateDir = this.prepareBundledTemplate();
    this.templateDir = templateDir;
    return templateDir;
  }

  private prepareBundledTemplate(): string {
    const zipPath = this.getBundledTemplatePath();
    const targetDir = join(app.getPath("userData"), TEMPLATE_CACHE_DIR_NAME);
    if (existsSync(targetDir)) {
      rmSync(targetDir, { recursive: true, force: true });
    }
    mkdirSync(targetDir, { recursive: true });
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(targetDir, true);
    log.info(`Publish template ready at ${targetDir}`);
    return targetDir;
  }

  private getBundledTemplatePath(): string {
    const candidates = [
      join(process.resourcesPath, BUNDLED_TEMPLATE_ZIP_NAME),
      resolve(app.getAppPath(), BUNDLED_TEMPLATE_ZIP_NAME),
      resolve(app.getAppPath(), "build", BUNDLED_TEMPLATE_ZIP_NAME),
      resolve(app.getAppPath(), "..", "build", BUNDLED_TEMPLATE_ZIP_NAME),
    ];

    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        return candidate;
      }
    }

    throw new Error(
      `Bundled publish template ${BUNDLED_TEMPLATE_ZIP_NAME} not found`,
    );
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
   * 构建发布计划
   */
  async buildPublishPlan(
    db: import("better-sqlite3").Database,
    site: ISiteMeta,
  ): Promise<IPublishPlan> {
    // 获取选中的内容
    const selections = PublishSelectionTable.getAll(db);

    // 获取历史发布记录
    const history = PublishHistoryTable.getAll(db);
    const historyMap = new Map(history.map((h) => [h.filePath, h]));

    // 生成要发布的文件
    const { files: newFiles, virtualProcessed } =
      await this.generatePublishFiles(db, selections, site);
    const newFileMap = new Map(newFiles.map((f) => [f.path, f]));

    const toUpload: IPublishFile[] = [];
    const toDelete: string[] = [];
    const unchanged: string[] = [];

    // 全量上传：所有生成的文件都在待上传列表中
    toUpload.push(...newFiles);

    // 删除历史中存在但本次未生成的文件
    for (const [path] of historyMap) {
      if (!newFileMap.has(path)) {
        toDelete.push(path);
      }
    }

    return { toUpload, toDelete, unchanged, virtualProcessed };
  }

  /**
   * 生成要发布的文件
   */
  private async generatePublishFiles(
    db: import("better-sqlite3").Database,
    selections: Array<{
      contentType: PublishContentType;
      contentId: number;
      parentPath: string;
    }>,
    site: ISiteMeta,
  ): Promise<{ files: IPublishFile[]; virtualProcessed: number }> {
    const files: IPublishFile[] = [];

    await this.ensureTemplateReady();

    // 复制静态资源
    const assetsDir = join(this.templateDir!, "assets");
    if (existsSync(assetsDir)) {
      const assetFiles = this.readDirRecursive(assetsDir);
      for (const assetPath of assetFiles) {
        const relativePath = assetPath
          .replace(this.templateDir!, "")
          .replace(/\\/g, "/");
        const content = readFileSync(assetPath);
        files.push({
          path: relativePath.startsWith("/")
            ? relativePath.slice(1)
            : relativePath,
          content,
          hash: this.computeHash(content),
        });
      }
    }

    const grouped = this.groupSelections(selections);
    const cards = this.loadCards(
      db,
      grouped.card.map((selection) => selection.contentId),
    );
    const cardMap = new Map(cards.map((card) => [card.id, card]));

    const articles = this.loadArticles(
      db,
      grouped.article.map((selection) => selection.contentId),
    );
    const articleMap = new Map(
      articles.map((article) => [article.id, article]),
    );

    const projects = this.loadProjects(db, grouped.project);
    const documents = this.loadDocuments(db, grouped.document);
    const projectScopes = this.buildEntityScopeMap(grouped.project);
    const documentScopes = this.buildEntityScopeMap(grouped.document);

    const navigation = this.buildNavigation({
      cards: cards.length > 0,
      articles: articles.length > 0,
      documents: projects.length > 0 || documents.length > 0,
    });

    const cardTagTree =
      cards.length > 0 ? this.buildCardTagTree(cards) : undefined;

    const cardCache = new Map(cardMap);

    const docPublishResult = this.buildDocPages(
      db,
      site,
      navigation,
      projects,
      documents,
      projectScopes,
      documentScopes,
    );
    files.push(...docPublishResult.files);
    const docCollections = docPublishResult.collections;

    if (docPublishResult.listEntries.length > 0) {
      const docListInit = this.buildDocListInitData(
        site,
        navigation,
        docPublishResult.listEntries,
        docCollections,
      );
      const docListHtml = this.injectData(
        "list.html",
        docListInit,
        "docs/index.html",
      );
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
      const relatedCards = this.buildRelatedCards(card, cards);

      const initData = this.buildCardInitData(
        site,
        navigation,
        card,
        cardTagTree,
        selection.parentPath || card.tags[0] || "",
        linkedCards,
        relatedCards,
        docCollections,
      );
      const path = `cards/${selection.contentId}.html`;
      const html = this.injectData("card.html", initData, path);
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
      );
      const path = `articles/${selection.contentId}.html`;
      const html = this.injectData("article.html", initData, path);
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
      );
      const cardListHtml = this.injectData(
        "list.html",
        cardListInit,
        "cards/index.html",
      );
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
      );
      const articleListHtml = this.injectData(
        "list.html",
        articleListInit,
        "articles/index.html",
      );
      files.push({
        path: "articles/index.html",
        content: Buffer.from(articleListHtml),
        hash: this.computeHash(articleListHtml),
      });
    }

    const homeInitData = this.buildHomeInitData(
      site,
      navigation,
      cards,
      articles,
      docPublishResult.timelineEntries,
      projects.length,
      documents.length,
      docCollections,
    );
    const homeHtml = this.injectData("home.html", homeInitData, "index.html");
    files.push({
      path: "index.html",
      content: Buffer.from(homeHtml),
      hash: this.computeHash(homeHtml),
    });

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
  ): string {
    const relativePath = TEMPLATE_ENTRY_MAP[templateName] ?? templateName;
    const templatePath = join(this.templateDir!, relativePath);
    console.log("templatePath", templatePath);
    if (!existsSync(templatePath)) {
      throw new Error(`Template not found: ${templateName}`);
    }

    let html = readFileSync(templatePath, "utf-8");

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
    documentCount: number,
    docCollections?: IPublishInitData["docCollections"],
  ): IPublishInitData {
    const timeline = this.buildTimelineEntries(cards, articles, docTimeline);
    const hero =
      site.description && site.description.trim().length > 0
        ? {
            title: site.title,
            description: site.description,
          }
        : undefined;

    return {
      site,
      navigation,
      docCollections,
      content: {
        hero,
        timeline,
        stats: {
          articles: articles.length,
          cards: cards.length,
        },
        docStats: {
          projects: projectCount,
          documents: documentCount,
        },
      },
      meta: {
        type: "home",
        publishTime: Date.now(),
      },
    };
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
    relatedCards?: ILinkedCardInfo[],
    docCollections?: IPublishInitData["docCollections"],
  ): IPublishInitData {
    return {
      site,
      navigation,
      docCollections,
      cardTagTree,
      activeTag,
      content: {
        id: card.id,
        content: card.content || [],
        tags: card.tags || [],
        category: card.category,
        createTime: card.create_time,
        updateTime: card.update_time,
        linkedCards,
        relatedCards,
      },
      meta: {
        type: "card",
        publishTime: Date.now(),
      },
    };
  }

  /**
   * 构建文章页面数据
   */
  private buildArticleInitData(
    site: ISiteMeta,
    navigation: INavigationItem[],
    article: IArticle,
    docCollections?: IPublishInitData["docCollections"],
  ): IPublishInitData {
    return {
      site,
      navigation,
      docCollections,
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
    };
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
  ): IPublishInitData {
    const items: IPublishListItem[] =
      type === "card"
        ? (records as ICard[]).map((card) => ({
            id: card.id,
            summary: this.buildSummary(card.content || []),
            href: `/cards/${card.id}.html`,
            tags: card.tags || [],
            createTime: card.create_time,
          }))
        : (records as IArticle[]).map((article) => ({
            id: article.id,
            title: article.title,
            summary: this.buildSummary(article.content || []),
            href: `/articles/${article.id}.html`,
            tags: article.tags || [],
            createTime: article.create_time,
          }));
    const tagStats = this.buildTagStats(items);
    return {
      site,
      navigation,
      docCollections,
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
    };
  }

  private groupSelections(
    selections: Array<{
      contentType: PublishContentType;
      contentId: number;
      parentPath: string;
    }>,
  ) {
    return {
      card: selections.filter((item) => item.contentType === "card"),
      article: selections.filter((item) => item.contentType === "article"),
      project: selections.filter((item) => item.contentType === "project"),
      document: selections.filter((item) => item.contentType === "document"),
    };
  }

  private buildEntityScopeMap(
    selections: Array<{ contentId: number; parentPath: string }>,
  ): Map<number, EntityScopeConfig> {
    const map = new Map<number, EntityScopeConfig>();
    for (const selection of selections) {
      map.set(selection.contentId, this.parseEntityScopeConfig(selection));
    }
    return map;
  }

  private parseEntityScopeConfig(selection: {
    parentPath: string;
  }): EntityScopeConfig {
    const raw = selection.parentPath;
    if (!raw || raw.trim().length === 0) {
      return { mode: "all" };
    }
    try {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.mode === "partial" && Array.isArray(parsed.nodes)) {
        const nodeIds = (parsed.nodes as unknown[]).filter(
          (value): value is number => typeof value === "number",
        );
        if (nodeIds.length > 0) {
          return { mode: "partial", nodes: new Set(nodeIds) };
        }
      }
    } catch (error) {
      // ignore invalid scope payloads
    }
    return { mode: "all" };
  }

  private buildNavigation(sections: {
    cards: boolean;
    articles: boolean;
    documents: boolean;
  }): INavigationItem[] {
    const navigation: INavigationItem[] = [{ label: "首页", href: "/" }];
    if (sections.cards) {
      navigation.push({ label: "卡片", href: "/cards/" });
    }
    if (sections.articles) {
      navigation.push({ label: "文章", href: "/articles/" });
    }
    return navigation;
  }

  private loadCards(
    db: import("better-sqlite3").Database,
    ids: number[],
  ): ICard[] {
    const uniqueIds = Array.from(new Set(ids));
    if (!uniqueIds.length) return [];
    return CardTable.getCardByIds(db, uniqueIds);
  }

  private loadArticles(
    db: import("better-sqlite3").Database,
    ids: number[],
  ): IArticle[] {
    const uniqueIds = Array.from(new Set(ids));
    if (!uniqueIds.length) return [];
    return ArticleTable.getArticleByIds(db, uniqueIds);
  }

  private loadProjects(
    db: import("better-sqlite3").Database,
    selections: Array<{ contentId: number }>,
  ): Project[] {
    const ids = Array.from(new Set(selections.map((item) => item.contentId)));
    const projects: Project[] = [];
    for (const id of ids) {
      try {
        const project = ProjectTable.getProject(db, id);
        if (project) {
          projects.push(project);
        }
      } catch (error) {
        log.warn(`Project ${id} not found`, error);
      }
    }
    return projects;
  }

  private loadDocuments(
    db: import("better-sqlite3").Database,
    selections: Array<{ contentId: number }>,
  ): IDocument[] {
    const ids = Array.from(new Set(selections.map((item) => item.contentId)));
    const docs: IDocument[] = [];
    for (const id of ids) {
      try {
        const doc = DocumentTable.getDocument(db, id);
        if (doc) {
          docs.push(doc);
        }
      } catch (error) {
        log.warn(`Document ${id} not found`, error);
      }
    }
    return docs;
  }

  private resolveLinkedCards(
    db: import("better-sqlite3").Database,
    card: ICard,
    cache: Map<number, ICard>,
  ): ILinkedCardInfo[] {
    if (!Array.isArray(card.links) || card.links.length === 0) {
      return [];
    }
    const result: ILinkedCardInfo[] = [];
    for (const linkId of card.links) {
      if (linkId === card.id) continue;
      let target = cache.get(linkId);
      if (!target) {
        target = CardTable.getCardById(db, linkId) || undefined;
        if (target) {
          cache.set(linkId, target);
        }
      }
      if (target) {
        result.push(this.toLinkedCardInfo(target));
      }
      if (result.length >= 5) {
        break;
      }
    }
    return result;
  }

  private buildRelatedCards(card: ICard, cards: ICard[]): ILinkedCardInfo[] {
    if (!card.tags || card.tags.length === 0) {
      return [];
    }
    const matchTags = new Set(
      card.tags.map((tag) => tag.toLowerCase().trim()).filter(Boolean),
    );
    const related: ILinkedCardInfo[] = [];
    for (const candidate of cards) {
      if (candidate.id === card.id) continue;
      const hasIntersection = (candidate.tags || []).some((tag) =>
        matchTags.has(tag.toLowerCase().trim()),
      );
      if (hasIntersection) {
        related.push(this.toLinkedCardInfo(candidate));
      }
      if (related.length >= 5) {
        break;
      }
    }
    return related;
  }

  private toLinkedCardInfo(card: ICard): ILinkedCardInfo {
    return {
      id: card.id,
      href: `/cards/${card.id}.html`,
      summary: this.buildSummary(card.content || []),
      tags: card.tags || [],
      category: card.category,
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
          .map((segment) => segment.trim())
          .filter(Boolean);
        if (!segments.length) continue;
        this.insertTagNode(root, segments, listItem);
      }
    }
    return Array.from(root.values()).map((node) => this.normalizeTagNode(node));
  }

  private insertTagNode(
    container: Map<string, CardTagTreeNode>,
    segments: string[],
    card: IPublishCardListItem,
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
      children: Array.from(node.children.values()).map((child) =>
        this.normalizeTagNode(child),
      ),
    };
  }

  private buildDocPages(
    db: import("better-sqlite3").Database,
    site: ISiteMeta,
    navigation: INavigationItem[],
    projects: Project[],
    documents: IDocument[],
    projectScopes: Map<number, EntityScopeConfig>,
    documentScopes: Map<number, EntityScopeConfig>,
  ): {
    files: IPublishFile[];
    listEntries: IDocEntry[];
    timelineEntries: ITimelineEntry[];
    collections?: IPublishInitData["docCollections"];
    skippedDocItems: number;
  } {
    const files: IPublishFile[] = [];
    const entries: IDocEntry[] = [];
    const entityEntryMap = new Map<string, IDocEntry[]>();
    const collectionMeta: IDocCollectionMetaItem[] = [];
    let skippedDocItems = 0;

    for (const project of projects) {
      const result = this.buildProjectDocEntries(
        db,
        project,
        projectScopes.get(project.id),
      );
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

    for (const document of documents) {
      const result = this.buildDocumentDocEntries(
        db,
        document,
        documentScopes.get(document.id),
      );
      skippedDocItems += result.skippedCount;
      if (result.entries.length === 0) {
        continue;
      }
      entries.push(...result.entries);
      entityEntryMap.set(`document-${document.id}`, result.entries);
      if (result.defaultHref) {
        collectionMeta.push({
          type: "document",
          entityId: document.id,
          title: document.title || `知识库 #${document.id}`,
          href: result.defaultHref,
        });
      }
    }

    const docCollections = this.buildDocCollectionsFromMeta(collectionMeta);

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
        );
        const path = entry.href.replace(/^\//, "");
        const html = this.injectData("doc.html", initData, path);
        files.push({
          path,
          content: Buffer.from(html),
          hash: this.computeHash(html),
          sourceType: entry.kind,
          sourceId: entry.id,
        });
      }
    }

    const orderedEntries = entries
      .slice()
      .sort((a, b) => a.updateTime - b.updateTime);

    const timelineEntries = orderedEntries.map((entry) =>
      this.createDocTimelineEntry(entry),
    );

    return {
      files,
      listEntries: orderedEntries,
      timelineEntries,
      collections: docCollections,
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
  ): IPublishInitData {
    const activeCollections = this.applyActiveDocCollections(
      docCollections,
      entry.kind,
      entry.entityId,
    );
    return {
      site,
      navigation,
      sidebar: entry.sidebar,
      docCollections: activeCollections,
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
    };
  }

  private buildDocCollectionsFromMeta(
    meta: IDocCollectionMetaItem[],
  ): IPublishInitData["docCollections"] {
    if (!meta.length) {
      return undefined;
    }

    const labelMap: Record<IDocEntry["kind"], string> = {
      project: "项目",
      document: "知识库",
    };

    const kinds: IDocEntry["kind"][] = ["project", "document"];

    const collections = kinds
      .map((kind) => {
        const items = meta
          .filter((item) => item.type === kind && item.href)
          .sort((a, b) => a.title.localeCompare(b.title, "zh-CN"))
          .map((item) => ({
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
    entityId: number,
  ): IPublishInitData["docCollections"] {
    if (!base) return undefined;
    return base.map((collection) => ({
      ...collection,
      items: collection.items.map((item) => ({
        ...item,
        active:
          collection.type === kind && item.id === entityId ? true : undefined,
      })),
    }));
  }

  private buildDocListInitData(
    site: ISiteMeta,
    navigation: INavigationItem[],
    entries: IDocEntry[],
    docCollections?: IPublishInitData["docCollections"],
  ): IPublishInitData {
    const items = entries
      .slice()
      .sort((a, b) => b.updateTime - a.updateTime)
      .map((entry) => ({
        id: entry.id,
        title: entry.title,
        summary: entry.summary,
        href: entry.href,
        tags: entry.tags,
        createTime: entry.createTime,
      }));
    return {
      site,
      navigation,
      docCollections,
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
    };
  }

  private buildProjectDocEntries(
    db: import("better-sqlite3").Database,
    project: Project,
    scope?: EntityScopeConfig,
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
      .map((id) => this.createProjectTreeNode(itemMap, id))
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
      (nodeId) => `${basePath}/${nodeId}.html`,
    );

    const { entries, defaultHref, skippedCount } =
      this.collectDocEntriesFromTree(
        treeNodes,
        {
          entityId: project.id,
          title: project.title || `项目 #${project.id}`,
          kind: "project",
          basePath,
        },
        sidebar,
      );

    return { entries, sidebar, defaultHref, skippedCount };
  }

  private buildDocumentDocEntries(
    db: import("better-sqlite3").Database,
    document: IDocument,
    scope?: EntityScopeConfig,
  ): {
    entries: IDocEntry[];
    sidebar?: IPublishInitData["sidebar"];
    defaultHref?: string;
    skippedCount: number;
  } {
    const rootIds = Array.isArray(document.children) ? document.children : [];
    if (rootIds.length === 0) {
      return {
        entries: [],
        sidebar: undefined,
        defaultHref: undefined,
        skippedCount: 0,
      };
    }

    const itemMap = this.loadDocumentItemsMap(db, rootIds);
    if (itemMap.size === 0) {
      return {
        entries: [],
        sidebar: undefined,
        defaultHref: undefined,
        skippedCount: 0,
      };
    }

    let treeNodes = rootIds
      .map((id) => this.createDocumentTreeNode(itemMap, id))
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

    const basePath = `/docs/document/${document.id}`;
    const sidebar = this.buildSidebarTree(
      document.title || `知识库 #${document.id}`,
      treeNodes,
      (nodeId) => `${basePath}/${nodeId}.html`,
    );

    const { entries, defaultHref, skippedCount } =
      this.collectDocEntriesFromTree(
        treeNodes,
        {
          entityId: document.id,
          title: document.title || `知识库 #${document.id}`,
          kind: "document",
          basePath,
        },
        sidebar,
      );

    return { entries, sidebar, defaultHref, skippedCount };
  }

  private loadProjectItemsMap(
    db: import("better-sqlite3").Database,
    rootIds: number[],
  ): Map<number, ProjectItem> {
    const queue = [...new Set(rootIds)];
    const visited = new Set<number>();
    const map = new Map<number, ProjectItem>();

    while (queue.length > 0) {
      const batch = queue.splice(0, 20);
      const items = ProjectTable.getProjectItemsByIds(db, batch);
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

  private loadDocumentItemsMap(
    db: import("better-sqlite3").Database,
    rootIds: number[],
  ): Map<number, IDocumentItem> {
    const queue = [...new Set(rootIds)];
    const visited = new Set<number>();
    const map = new Map<number, IDocumentItem>();

    while (queue.length > 0) {
      const batch = queue.splice(0, 20);
      const items = DocumentTable.getDocumentItemsByIds(db, batch);
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
    itemId: number,
  ): IDocTreeNode | null {
    const item = map.get(itemId);
    if (!item) return null;

    const children = (item.children || [])
      .map((childId) => this.createProjectTreeNode(map, childId))
      .filter((node): node is IDocTreeNode => Boolean(node));

    const hasContent =
      item.projectItemType === EProjectItemType.Document &&
      this.hasMeaningfulContent(item.content || []);

    return {
      id: item.id,
      title: item.title || `条目 #${item.id}`,
      children,
      content: item.content || [],
      createTime: item.createTime,
      updateTime: item.updateTime,
      hasContent,
    };
  }

  private createDocumentTreeNode(
    map: Map<number, IDocumentItem>,
    itemId: number,
  ): IDocTreeNode | null {
    const item = map.get(itemId);
    if (!item) return null;

    const children = (item.children || [])
      .map((childId) => this.createDocumentTreeNode(map, childId))
      .filter((node): node is IDocTreeNode => Boolean(node));

    const hasContent = this.hasMeaningfulContent(item.content || []);

    return {
      id: item.id,
      title: item.title || `文档 ${item.id}`,
      children,
      content: item.content || [],
      createTime: item.createTime,
      updateTime: item.updateTime,
      hasContent,
    };
  }

  private filterDocTreeNodes(
    nodes: IDocTreeNode[],
    scope?: EntityScopeConfig,
  ): IDocTreeNode[] {
    if (!scope || scope.mode === "all") {
      return nodes;
    }
    const allowedNodes = scope.nodes;
    if (allowedNodes.size === 0) {
      return [];
    }
    const filterNode = (node: IDocTreeNode): IDocTreeNode | null => {
      const filteredChildren = (node.children || [])
        .map((child) => filterNode(child))
        .filter((child): child is IDocTreeNode => Boolean(child));
      const includeSelf = allowedNodes.has(node.id);
      if (!includeSelf && filteredChildren.length === 0) {
        return null;
      }
      return {
        ...node,
        children: filteredChildren,
      };
    };

    return nodes
      .map((node) => filterNode(node))
      .filter((node): node is IDocTreeNode => Boolean(node));
  }

  private buildSidebarTree(
    entityTitle: string,
    nodes: IDocTreeNode[],
    hrefBuilder: (nodeId: number) => string,
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
    hrefBuilder: (nodeId: number) => string,
  ): IPublishInitData["sidebar"] {
    return nodes.map((node) => {
      const childNodes = node.children || [];
      return {
        title: node.title || `文档 ${node.id}`,
        href: node.hasContent ? hrefBuilder(node.id) : undefined,
        children: childNodes.length
          ? this.buildSidebarBranch(childNodes, hrefBuilder)
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
      basePath: string;
    },
    sidebar?: IPublishInitData["sidebar"],
  ): { entries: IDocEntry[]; defaultHref?: string; skippedCount: number } {
    const entryInfos: Array<{ node: IDocTreeNode; ancestors: IDocTreeNode[] }> =
      [];
    let skippedCount = 0;

    const traverse = (node: IDocTreeNode, ancestors: IDocTreeNode[]): void => {
      if (node.hasContent) {
        entryInfos.push({ node, ancestors });
      } else {
        skippedCount++;
      }
      node.children.forEach((child) => traverse(child, [...ancestors, node]));
    };

    nodes.forEach((node) => traverse(node, []));

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
        ...ancestors.map((ancestor) => {
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
        tags: [],
        kind: entity.kind,
        content: node.content || [],
        breadcrumb,
        sidebar,
      } as IDocEntry;
    });

    return { entries, defaultHref, skippedCount };
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
      publishTime: entry.updateTime,
    };
  }

  private buildTimelineEntries(
    cards: ICard[],
    articles: IArticle[],
    docTimeline: ITimelineEntry[],
  ): ITimelineEntry[] {
    const entries: ITimelineEntry[] = [
      ...cards.map((card) => ({
        type: "card" as const,
        id: card.id,
        summary: this.buildSummary(card.content || []),
        href: `/cards/${card.id}.html`,
        tags: card.tags || [],
        publishTime: card.update_time,
      })),
      ...articles.map((article) => ({
        type: "article" as const,
        id: article.id,
        title: article.title,
        summary: this.buildSummary(article.content || []),
        href: `/articles/${article.id}.html`,
        tags: article.tags || [],
        publishTime: article.update_time,
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
      category: card.category,
      createTime: card.create_time,
    };
  }

  /**
   * 执行发布
   */
  async executePublish(
    db: import("better-sqlite3").Database,
    config: ExecutePublishConfig,
    site: ISiteMeta,
  ): Promise<IPublishResult> {
    const provider = createPublishProvider(
      config.providerType === "github"
        ? { type: "github", github: config.providerConfig }
        : { type: "s3", s3: config.providerConfig },
    );

    const options = { ...DEFAULT_UPLOAD_OPTIONS, ...config.options };
    const plan = await this.buildPublishPlan(db, site);

    if (config.providerType === "github" && config.providerConfig.useGitCli) {
      return this.executeGitCliPublish(db, config, plan);
    }

    const result: IPublishResult = {
      success: true,
      uploaded: [],
      deleted: [],
      failed: [],
      skipped: plan.unchanged,
    };

    const extraProcessed = plan.virtualProcessed || 0;
    const totalOperations =
      plan.toUpload.length + plan.toDelete.length + extraProcessed;
    const total = Math.max(1, totalOperations);
    let current = extraProcessed;

    this.emitProgress({
      phase: "preparing",
      current,
      total,
    });

    const sendProgress = (
      phase: IPublishProgress["phase"],
      currentFile?: string,
    ) => {
      this.emitProgress({
        phase,
        current,
        total,
        currentFile,
      });
    };

    // 上传文件
    sendProgress("uploading");
    if (plan.toUpload.length > 0) {
      const concurrency = Math.max(
        1,
        Math.min(options.concurrency, plan.toUpload.length),
      );
      let uploadIndex = 0;

      const worker = async () => {
        while (uploadIndex < plan.toUpload.length) {
          const currentIndex = uploadIndex++;
          if (currentIndex >= plan.toUpload.length) {
            break;
          }
          const file = plan.toUpload[currentIndex];
          sendProgress("uploading", file.path);

          const success = await this.uploadWithRetry(provider, file, options);
          if (success) {
            result.uploaded.push(file.path);
            PublishHistoryTable.upsert(db, {
              filePath: file.path,
              contentHash: file.hash,
              sourceType: file.sourceType,
              sourceId: file.sourceId,
            });
          } else {
            result.failed.push({
              path: file.path,
              error: "Upload failed after retries",
            });
            result.success = false;
          }

          current++;
          sendProgress("uploading");
        }
      };

      const workers = Array.from({ length: concurrency }, () => worker());
      await Promise.all(workers);
    }

    // 删除旧文件
    sendProgress("deleting");
    for (const path of plan.toDelete) {
      current++;
      sendProgress("deleting", path);

      try {
        await provider.deleteFile(path);
        result.deleted.push(path);
        PublishHistoryTable.delete(db, path);
      } catch (error) {
        result.failed.push({ path, error: String(error) });
        result.success = false;
      }
    }

    sendProgress("finishing");
    return result;
  }

  /**
   * 带重试的上传
   */
  private async uploadWithRetry(
    provider: IPublishProvider,
    file: IPublishFile,
    options: Required<IUploadOptions>,
  ): Promise<boolean> {
    for (let attempt = 1; attempt <= options.maxRetries; attempt++) {
      try {
        const content =
          typeof file.content === "string"
            ? Buffer.from(file.content)
            : file.content;
        await provider.uploadFile(file.path, content);
        return true;
      } catch (error) {
        log.warn(`Upload attempt ${attempt} failed for ${file.path}:`, error);
        if (attempt < options.maxRetries) {
          await this.delay(options.retryDelay * attempt);
        }
      }
    }
    return false;
  }

  private async executeGitCliPublish(
    db: import("better-sqlite3").Database,
    config: GithubExecuteConfig,
    plan: IPublishPlan,
  ): Promise<IPublishResult> {
    const providerConfig = config.providerConfig;
    const needsPushStep = plan.toUpload.length + plan.toDelete.length > 0;
    const extraProcessed = plan.virtualProcessed || 0;
    const totalOperations =
      plan.toUpload.length +
      plan.toDelete.length +
      (needsPushStep ? 1 : 0) +
      extraProcessed;
    const total = Math.max(1, totalOperations);
    let current = extraProcessed;

    this.emitProgress({
      phase: "preparing",
      current,
      total,
    });

    const sendProgress = (
      phase: IPublishProgress["phase"],
      currentFile?: string,
    ) => {
      this.emitProgress({
        phase,
        current,
        total,
        currentFile,
      });
    };

    const repoSafeName = providerConfig.repo.replace(/[\/\\]/g, "_");
    const customBaseDir = providerConfig.gitWorkingDir?.trim();
    const baseDir = customBaseDir
      ? resolve(customBaseDir)
      : join(app.getPath("userData"), "publish-git");
    mkdirSync(baseDir, { recursive: true });
    const workingDir = join(baseDir, repoSafeName);
    const remoteUrl = `https://x-access-token:${providerConfig.token}@github.com/${providerConfig.repo}.git`;

    try {
      await this.prepareGitRepository(workingDir, remoteUrl);

      const repoGit = simpleGit(workingDir);
      await repoGit.raw(["remote", "set-url", "origin", remoteUrl]);
      try {
        await repoGit.fetch();
      } catch (fetchError) {
        log.warn("Git fetch failed, continue with local workspace", fetchError);
      }

      await this.checkoutTargetBranch(repoGit, providerConfig.branch);
      this.clearGitWorkingDir(workingDir);

      sendProgress("uploading");
      for (const file of plan.toUpload) {
        sendProgress("uploading", file.path);
        const filePath = join(workingDir, file.path);
        const dir = dirname(filePath);
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }
        const content =
          typeof file.content === "string"
            ? Buffer.from(file.content)
            : file.content;
        writeFileSync(filePath, content);
        current++;
        sendProgress("uploading");
      }

      await repoGit.add(["-A"]);

      const committerName =
        providerConfig.committerName ||
        config.siteConfig.title ||
        "Tau Publisher";
      const committerEmail =
        providerConfig.committerEmail || "noreply@tau-editor.local";

      await repoGit.addConfig("user.name", committerName);
      await repoGit.addConfig("user.email", committerEmail);

      let status: Awaited<ReturnType<SimpleGit["status"]>> | null = null;
      if (needsPushStep) {
        sendProgress("pushing", "git push");
        status = await repoGit.status();
        if (status.files.length > 0 || status.staged.length > 0) {
          const commitMessage = `Publish at ${new Date().toISOString()}`;
          await repoGit.commit(commitMessage, undefined, {
            "--author": `${committerName} <${committerEmail}>`,
          });
          await repoGit.push("origin", providerConfig.branch);
        } else {
          log.info("No content changes detected, skip git push.");
        }
        current++;
        sendProgress("pushing");
      }

      const result: IPublishResult = {
        success: true,
        uploaded: plan.toUpload.map((file) => file.path),
        deleted: plan.toDelete,
        failed: [],
        skipped: plan.unchanged,
      };

      for (const file of plan.toUpload) {
        PublishHistoryTable.upsert(db, {
          filePath: file.path,
          contentHash: file.hash,
          sourceType: file.sourceType,
          sourceId: file.sourceId,
        });
      }

      if (plan.toDelete.length > 0) {
        sendProgress("deleting");
        for (const path of plan.toDelete) {
          current++;
          sendProgress("deleting", path);
          PublishHistoryTable.delete(db, path);
        }
      }

      sendProgress("finishing");
      return result;
    } catch (error) {
      log.error("Git publish failed:", error);
      throw error;
    }
  }

  private clearGitWorkingDir(dir: string) {
    if (!existsSync(dir)) {
      return;
    }
    const entries = readdirSync(dir);
    for (const entry of entries) {
      if (entry === ".git") {
        continue;
      }
      const target = join(dir, entry);
      rmSync(target, { recursive: true, force: true });
    }
  }

  private async prepareGitRepository(
    workingDir: string,
    remoteUrl: string,
  ): Promise<void> {
    const gitDir = join(workingDir, ".git");
    if (existsSync(gitDir)) {
      return;
    }

    if (existsSync(workingDir)) {
      rmSync(workingDir, { recursive: true, force: true });
    }
    mkdirSync(dirname(workingDir), { recursive: true });

    try {
      await simpleGit().clone(remoteUrl, workingDir);
    } catch (error) {
      log.warn(
        `Clone ${remoteUrl} failed, fallback to initializing repo:`,
        error,
      );
      mkdirSync(workingDir, { recursive: true });
      const repoGit = simpleGit(workingDir);
      await repoGit.init();
      const remotes = await repoGit.getRemotes(true);
      if (remotes.some((remote) => remote.name === "origin")) {
        await repoGit.remote(["set-url", "origin", remoteUrl]);
      } else {
        await repoGit.addRemote("origin", remoteUrl);
      }
    }
  }

  private async checkoutTargetBranch(
    git: SimpleGit,
    branch: string,
  ): Promise<void> {
    const localBranches = await git.branchLocal();
    if (localBranches.all.includes(branch)) {
      await git.checkout(branch);
      return;
    }

    const remoteExists = await this.remoteBranchExists(git, branch);
    if (remoteExists) {
      await git.checkout(["-B", branch, `origin/${branch}`]);
      return;
    }

    await git.checkoutLocalBranch(branch);
  }

  private async remoteBranchExists(git: SimpleGit, branch: string) {
    try {
      const output = await git.listRemote(["--heads", "origin", branch]);
      return output.trim().length > 0;
    } catch (error) {
      log.warn("Failed to check remote branch:", error);
      return false;
    }
  }

  /**
   * 重试发布
   */
  async retryPublish(config: {
    providerType: "github" | "s3";
    providerConfig: Record<string, unknown>;
    files: IPublishFile[];
    options?: IUploadOptions;
  }): Promise<IPublishResult> {
    const provider = createPublishProvider({
      type: config.providerType,
      [config.providerType]: config.providerConfig,
    });

    const options = { ...DEFAULT_UPLOAD_OPTIONS, ...config.options };
    const result: IPublishResult = {
      success: true,
      uploaded: [],
      deleted: [],
      failed: [],
      skipped: [],
    };

    const total = Math.max(1, config.files.length);
    let current = 0;

    for (const file of config.files) {
      current++;
      this.emitProgress({
        phase: "uploading",
        current,
        total,
        currentFile: file.path,
      });

      const success = await this.uploadWithRetry(provider, file, options);
      if (success) {
        result.uploaded.push(file.path);
      } else {
        result.failed.push({ path: file.path, error: "Retry failed" });
        result.success = false;
      }
    }

    return result;
  }

  private emitProgress(progress: IPublishProgress) {
    if (!this.backendServer) {
      if (!this.progressWarningLogged) {
        log.warn(
          "Backend WebSocket server is not ready, skip publish progress",
        );
        this.progressWarningLogged = true;
      }
      this.pendingProgressEvents.push(progress);
      return;
    }
    this.progressWarningLogged = false;
    this.backendServer.sendNotification("publish-progress", progress);
  }

  private normalizeBasePath(raw: string): string {
    if (!raw || raw === "/") {
      return "/";
    }
    let value = raw.trim();
    if (!value.startsWith("/")) {
      value = `/${value}`;
    }
    if (!value.endsWith("/")) {
      value = `${value}/`;
    }
    return value;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export default new PublishModule();
