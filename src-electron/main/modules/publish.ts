import { ipcMain, BrowserWindow } from "electron";
import { Module } from "../types/module";
import {
  createPublishProvider,
  IPublishProvider,
  DEFAULT_UPLOAD_OPTIONS,
  IUploadOptions,
} from "./publish-providers";
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
} from "@/types/publish";
import { createHash } from "crypto";
import { join } from "path";
import { tmpdir } from "os";
import {
  existsSync,
  mkdirSync,
  rmSync,
  readFileSync,
  readdirSync,
  statSync,
} from "fs";
import log from "electron-log";
import fetch from "node-fetch";
import AdmZip from "adm-zip";

// 模板下载地址（硬编码）
const TEMPLATE_URL =
  "https://your-oss-bucket.oss-cn-hangzhou.aliyuncs.com/blog-template.zip";

// 数据占位符
const DATA_PLACEHOLDER = '"__DATA_PLACEHOLDER__"';

class PublishModule implements Module {
  name = "publish";
  private templateDir: string | null = null;

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
      return this.downloadTemplate();
    });

    // 执行发布
    ipcMain.handle(
      "execute-publish",
      async (
        event,
        config: {
          providerType: "github" | "s3";
          providerConfig: Record<string, unknown>;
          siteConfig: { title: string; description: string };
          options?: IUploadOptions;
        },
      ) => {
        const db = this.getDatabase(event);
        if (!db) {
          throw new Error("Database not available");
        }

        const win = BrowserWindow.fromWebContents(event.sender);
        return this.executePublish(db, config, win);
      },
    );

    // 重试失败的文件
    ipcMain.handle(
      "retry-publish-files",
      async (
        event,
        config: {
          providerType: "github" | "s3";
          providerConfig: Record<string, unknown>;
          files: IPublishFile[];
          options?: IUploadOptions;
        },
      ) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        return this.retryPublish(config, win);
      },
    );

    // 预览发布计划
    ipcMain.handle("preview-publish-plan", async (event) => {
      const db = this.getDatabase(event);
      if (!db) {
        throw new Error("Database not available");
      }

      return this.buildPublishPlan(db);
    });

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

  private getDatabase(event: Electron.IpcMainInvokeEvent) {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return null;

    const dbName = DatabaseModule.windowToDatabase.get(win.id);
    if (!dbName) return null;

    return DatabaseModule.getDatabase(dbName);
  }

  /**
   * 下载并解压模板
   */
  async downloadTemplate(): Promise<string> {
    const tempDir = join(tmpdir(), "tau-publish-template");

    // 清理旧模板
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true });
    }
    mkdirSync(tempDir, { recursive: true });

    log.info(`Downloading template from ${TEMPLATE_URL}`);

    try {
      const response = await fetch(TEMPLATE_URL);
      if (!response.ok) {
        throw new Error(`Failed to download template: ${response.statusText}`);
      }

      const buffer = await response.buffer();
      const zipPath = join(tempDir, "template.zip");

      // 写入 zip 文件
      const fs = await import("fs/promises");
      await fs.writeFile(zipPath, buffer);

      // 解压
      const zip = new AdmZip(zipPath);
      zip.extractAllTo(tempDir, true);

      // 删除 zip 文件
      rmSync(zipPath);

      this.templateDir = tempDir;
      log.info(`Template extracted to ${tempDir}`);

      return tempDir;
    } catch (error) {
      log.error("Failed to download template:", error);
      throw error;
    }
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
  ): Promise<IPublishPlan> {
    // 获取选中的内容
    const selections = PublishSelectionTable.getAll(db);

    // 获取历史发布记录
    const history = PublishHistoryTable.getAll(db);
    const historyMap = new Map(history.map((h) => [h.filePath, h]));

    // 生成要发布的文件
    const newFiles = await this.generatePublishFiles(db, selections);
    const newFileMap = new Map(newFiles.map((f) => [f.path, f]));

    const toUpload: IPublishFile[] = [];
    const toDelete: string[] = [];
    const unchanged: string[] = [];

    // 检查新增/更新的文件
    for (const file of newFiles) {
      const historyRecord = historyMap.get(file.path);
      if (!historyRecord) {
        // 新文件
        toUpload.push(file);
      } else if (historyRecord.contentHash !== file.hash) {
        // 内容已变化
        toUpload.push(file);
      } else {
        // 未变化
        unchanged.push(file.path);
      }
    }

    // 检查需要删除的文件
    for (const [path] of historyMap) {
      if (!newFileMap.has(path)) {
        toDelete.push(path);
      }
    }

    return { toUpload, toDelete, unchanged };
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
  ): Promise<IPublishFile[]> {
    const files: IPublishFile[] = [];

    // 确保模板已下载
    if (!this.templateDir || !existsSync(this.templateDir)) {
      await this.downloadTemplate();
    }

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

    // 按类型分组
    const byType = new Map<PublishContentType, typeof selections>();
    for (const selection of selections) {
      const list = byType.get(selection.contentType) || [];
      list.push(selection);
      byType.set(selection.contentType, list);
    }

    // 生成首页
    const homeInitData = await this.buildHomeInitData(db, selections);
    const homeHtml = this.injectData("home.html", homeInitData);
    files.push({
      path: "index.html",
      content: Buffer.from(homeHtml),
      hash: this.computeHash(homeHtml),
    });

    // 生成卡片页面
    const cards = byType.get("card") || [];
    for (const selection of cards) {
      const initData = await this.buildCardInitData(db, selection.contentId);
      if (initData) {
        const html = this.injectData("card.html", initData);
        const path = `cards/${selection.contentId}.html`;
        files.push({
          path,
          content: Buffer.from(html),
          hash: this.computeHash(html),
          sourceType: "card",
          sourceId: selection.contentId,
        });
      }
    }

    // 生成文章页面
    const articles = byType.get("article") || [];
    for (const selection of articles) {
      const initData = await this.buildArticleInitData(db, selection.contentId);
      if (initData) {
        const html = this.injectData("article.html", initData);
        const path = `articles/${selection.contentId}.html`;
        files.push({
          path,
          content: Buffer.from(html),
          hash: this.computeHash(html),
          sourceType: "article",
          sourceId: selection.contentId,
        });
      }
    }

    // 生成列表页面
    if (cards.length > 0) {
      const cardListInitData = await this.buildListInitData(db, "card", cards);
      const cardListHtml = this.injectData("list.html", cardListInitData);
      files.push({
        path: "cards/index.html",
        content: Buffer.from(cardListHtml),
        hash: this.computeHash(cardListHtml),
      });
    }

    if (articles.length > 0) {
      const articleListInitData = await this.buildListInitData(
        db,
        "article",
        articles,
      );
      const articleListHtml = this.injectData("list.html", articleListInitData);
      files.push({
        path: "articles/index.html",
        content: Buffer.from(articleListHtml),
        hash: this.computeHash(articleListHtml),
      });
    }

    // TODO: 生成项目和知识库的文档页面

    return files;
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
   * 注入数据到模板
   */
  private injectData(templateName: string, initData: IPublishInitData): string {
    const templatePath = join(this.templateDir!, templateName);
    if (!existsSync(templatePath)) {
      throw new Error(`Template not found: ${templateName}`);
    }

    let html = readFileSync(templatePath, "utf-8");
    html = html.replace(DATA_PLACEHOLDER, JSON.stringify(initData));

    return html;
  }

  /**
   * 构建首页数据
   */
  private async buildHomeInitData(
    _db: import("better-sqlite3").Database,
    _selections: Array<{
      contentType: PublishContentType;
      contentId: number;
    }>,
  ): Promise<IPublishInitData> {
    // TODO: 从数据库获取实际数据
    return {
      site: {
        title: "My Blog",
        description: "Welcome to my blog",
        basePath: "/",
      },
      navigation: [
        { label: "首页", href: "/" },
        { label: "卡片", href: "/cards/" },
        { label: "文章", href: "/articles/" },
      ],
      content: {
        hero: {
          title: "欢迎访问我的博客",
          description: "记录学习与思考",
        },
        timeline: [],
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
  private async buildCardInitData(
    _db: import("better-sqlite3").Database,
    _cardId: number,
  ): Promise<IPublishInitData | null> {
    // TODO: 从数据库获取实际卡片数据
    return {
      site: {
        title: "Card",
        description: "",
        basePath: "/",
      },
      navigation: [
        { label: "首页", href: "/" },
        { label: "卡片", href: "/cards/" },
        { label: "文章", href: "/articles/" },
      ],
      content: {
        id: _cardId,
        content: "<p>Card content placeholder</p>",
        tags: [],
        category: "permanent",
        createTime: Date.now(),
        updateTime: Date.now(),
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
  private async buildArticleInitData(
    _db: import("better-sqlite3").Database,
    _articleId: number,
  ): Promise<IPublishInitData | null> {
    // TODO: 从数据库获取实际文章数据
    return {
      site: {
        title: "Article",
        description: "",
        basePath: "/",
      },
      navigation: [
        { label: "首页", href: "/" },
        { label: "卡片", href: "/cards/" },
        { label: "文章", href: "/articles/" },
      ],
      content: {
        id: _articleId,
        title: "Article Title",
        author: "",
        content: "<p>Article content placeholder</p>",
        tags: [],
        createTime: Date.now(),
        updateTime: Date.now(),
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
  private async buildListInitData(
    _db: import("better-sqlite3").Database,
    type: "card" | "article",
    _selections: Array<{ contentId: number }>,
  ): Promise<IPublishInitData> {
    // TODO: 从数据库获取实际列表数据
    return {
      site: {
        title: type === "card" ? "卡片列表" : "文章列表",
        description: "",
        basePath: "/",
      },
      navigation: [
        { label: "首页", href: "/" },
        { label: "卡片", href: "/cards/" },
        { label: "文章", href: "/articles/" },
      ],
      content: {
        title: type === "card" ? "全部卡片" : "全部文章",
        type,
        items: [],
      },
      meta: {
        type: "list",
        publishTime: Date.now(),
      },
    };
  }

  /**
   * 执行发布
   */
  async executePublish(
    db: import("better-sqlite3").Database,
    config: {
      providerType: "github" | "s3";
      providerConfig: Record<string, unknown>;
      siteConfig: { title: string; description: string };
      options?: IUploadOptions;
    },
    win: BrowserWindow | null,
  ): Promise<IPublishResult> {
    const provider = createPublishProvider({
      type: config.providerType,
      [config.providerType]: config.providerConfig,
    });

    const options = { ...DEFAULT_UPLOAD_OPTIONS, ...config.options };
    const plan = await this.buildPublishPlan(db);

    const result: IPublishResult = {
      success: true,
      uploaded: [],
      deleted: [],
      failed: [],
      skipped: plan.unchanged,
    };

    const total = plan.toUpload.length + plan.toDelete.length;
    let current = 0;

    const sendProgress = (
      phase: IPublishProgress["phase"],
      currentFile?: string,
    ) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send("publish-progress", {
          phase,
          current,
          total,
          currentFile,
        } as IPublishProgress);
      }
    };

    // 上传文件
    sendProgress("uploading");
    for (const file of plan.toUpload) {
      current++;
      sendProgress("uploading", file.path);

      const success = await this.uploadWithRetry(provider, file, options);
      if (success) {
        result.uploaded.push(file.path);
        // 更新历史记录
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

  /**
   * 重试发布
   */
  async retryPublish(
    config: {
      providerType: "github" | "s3";
      providerConfig: Record<string, unknown>;
      files: IPublishFile[];
      options?: IUploadOptions;
    },
    win: BrowserWindow | null,
  ): Promise<IPublishResult> {
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

    const total = config.files.length;
    let current = 0;

    for (const file of config.files) {
      current++;
      if (win && !win.isDestroyed()) {
        win.webContents.send("publish-progress", {
          phase: "uploading",
          current,
          total,
          currentFile: file.path,
        } as IPublishProgress);
      }

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

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export default new PublishModule();
