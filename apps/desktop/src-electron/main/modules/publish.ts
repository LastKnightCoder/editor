import { ipcMain, BrowserWindow, app } from "electron";
import type Database from "better-sqlite3";
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
  IPublishPlanPreview,
  IPublishResult,
  IPublishProgress,
  IPublishAppearanceSettings,
  IPublishFaviconConfig,
} from "@/types/publish";
import { join, resolve, dirname } from "path";
import { existsSync, mkdirSync, rmSync, writeFileSync, readdirSync } from "fs";
import log from "electron-log";
import BackendWebSocketServer from "../utils/BackendWebSocketServer";
import CardTable from "./tables/card";
import ContentLinkTable from "./tables/content-link";
import ArticleTable from "./tables/article";
import ProjectTable from "./tables/project";
import QuestionTable from "./tables/question";
import QuestionGroupTable from "./tables/question-group";
import publishTemplateManager from "./publish-template-manager";
import type { ISiteMeta, PublishDataSource, PublishSelectionInput } from "./publish-site-generator";
import {
  generatePublishFilesInWorker,
  generatePublishPathsInWorker,
} from "./publish-generator-client";

function createPublishDataSource(db: Database.Database): PublishDataSource {
  return {
    getCardByIds: ids => CardTable.getCardByIds(db, ids),
    getCardById: id => CardTable.getCardById(db, id),
    getCardByContentId: contentId => CardTable.getCardByContentId(db, contentId),
    getContentLinkTargetContentIds: contentId =>
      ContentLinkTable.edgesOf(db, [contentId]).get(contentId) ?? [],
    getArticleByIds: ids => ArticleTable.getArticleByIds(db, ids),
    getArticleByContentId: contentId => ArticleTable.getArticleByContentId(db, contentId),
    getProject: id => ProjectTable.getProject(db, id),
    getProjectItemsByIds: ids => ProjectTable.getProjectItemsByIds(db, ids),
    getProjectItemsByContentId: contentId => ProjectTable.getProjectItemsByContentId(db, contentId),
    listQuestionGroups: () => QuestionGroupTable.listGroups(db),
    listQuestionsByGroup: (groupId, filter, search) =>
      QuestionTable.listByGroup(db, groupId, filter, search),
    getQuestionAnswerById: id => QuestionTable.getAnswerById(db, id),
  };
}

type ExecutePublishConfig =
  | {
      providerType: "github";
      providerConfig: IGithubPagesConfig;
      siteConfig: {
        title: string;
        description: string;
        publicUrl?: string;
        favicon?: IPublishFaviconConfig;
      };
      settings?: IPublishAppearanceSettings;
      options?: IUploadOptions;
    }
  | {
      providerType: "s3";
      providerConfig: IS3HostingConfig;
      siteConfig: {
        title: string;
        description: string;
        publicUrl?: string;
        favicon?: IPublishFaviconConfig;
      };
      settings?: IPublishAppearanceSettings;
      options?: IUploadOptions;
    };

type GithubExecuteConfig = Extract<ExecutePublishConfig, { providerType: "github" }>;

class PublishModule implements Module {
  name = "publish";
  private templateDir: string | null = null;
  private backendServer: BackendWebSocketServer | null = null;
  private progressWarningLogged = false;
  private pendingProgressEvents: IPublishProgress[] = [];

  async init() {
    // 获取发布配置
    ipcMain.handle("get-publish-config", async event => {
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
    ipcMain.handle("execute-publish", async (event, config: ExecutePublishConfig) => {
      const db = this.getDatabase(event);
      if (!db) {
        throw new Error("Database not available");
      }

      const siteMeta = this.resolveSiteMeta(
        config.providerType,
        config.providerConfig,
        config.siteConfig
      );

      return this.executePublish(db, config, siteMeta);
    });

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
        }
      ) => {
        return this.retryPublish(config);
      }
    );

    // 预览发布计划
    ipcMain.handle("preview-publish-plan", async event => {
      const db = this.getDatabase(event);
      if (!db) {
        throw new Error("Database not available");
      }

      const siteMeta: ISiteMeta = {
        title: "我的博客",
        description: "",
        basePath: "/",
      };

      return this.previewPublishPlan(db, siteMeta);
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
          siteConfig: {
            title: string;
            description: string;
            publicUrl?: string;
            favicon?: IPublishFaviconConfig;
          };
          settings?: IPublishAppearanceSettings;
        }
      ) => {
        const db = this.getDatabase(event);
        if (!db) {
          throw new Error("Database not available");
        }

        const siteMeta = this.resolveSiteMeta(
          payload.providerType,
          payload.providerConfig || {},
          payload.siteConfig
        );

        return this.exportPublishOutput(db, siteMeta, payload.targetDir, payload.settings);
      }
    );

    // 检查连接
    ipcMain.handle(
      "check-publish-connection",
      async (
        _event,
        config: {
          providerType: "github" | "s3";
          providerConfig: Record<string, unknown>;
        }
      ) => {
        const provider = createPublishProvider({
          type: config.providerType,
          [config.providerType]: config.providerConfig,
        });
        return provider.checkConnection();
      }
    );
  }

  private async exportPublishOutput(
    db: Database.Database,
    site: ISiteMeta,
    targetDir: string,
    settings?: IPublishAppearanceSettings
  ): Promise<string[]> {
    const selections = PublishSelectionTable.getAll(db);
    const { files } = await this.generatePublishFiles(db, selections, site, settings);

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

    return files.map(file => join(targetDir, file.path));
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
    siteConfig: {
      title: string;
      description: string;
      publicUrl?: string;
      favicon?: IPublishFaviconConfig;
    }
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
      publicUrl: siteConfig?.publicUrl?.trim() || "",
      favicon: siteConfig?.favicon,
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

    const templateDir = await publishTemplateManager.ensureTemplateReady();
    this.templateDir = templateDir;
    log.info(`Publish template ready at ${templateDir}`);
    return templateDir;
  }

  /**
   * 构建发布计划
   */
  async buildPublishPlan(
    db: Database.Database,
    site: ISiteMeta,
    appearanceSettings?: IPublishAppearanceSettings
  ): Promise<IPublishPlan> {
    // 获取选中的内容
    const selections = PublishSelectionTable.getAll(db);

    // 获取历史发布记录
    const history = PublishHistoryTable.getAll(db);
    const historyMap = new Map(history.map(h => [h.filePath, h]));

    // 生成要发布的文件
    const { files: newFiles, virtualProcessed } = await this.generatePublishFiles(
      db,
      selections,
      site,
      appearanceSettings
    );
    const newFileMap = new Map(newFiles.map(f => [f.path, f]));

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
   * 预览发布计划：只取路径，文件内容不离开 worker
   */
  private async previewPublishPlan(
    db: Database.Database,
    site: ISiteMeta
  ): Promise<IPublishPlanPreview> {
    const selections = PublishSelectionTable.getAll(db);
    const { paths } = await generatePublishPathsInWorker(createPublishDataSource(db), {
      templateDir: await this.ensureTemplateReady(),
      selections,
      site,
    });
    const generated = new Set(paths);
    const toDelete = PublishHistoryTable.getAll(db)
      .map(h => h.filePath)
      .filter(path => !generated.has(path));
    return { toUpload: paths, toDelete };
  }

  /**
   * 生成要发布的文件（worker 线程执行）
   */
  async generatePublishFiles(
    db: Database.Database,
    selections: PublishSelectionInput[],
    site: ISiteMeta,
    settings?: IPublishAppearanceSettings
  ): Promise<{ files: IPublishFile[]; virtualProcessed: number }> {
    return generatePublishFilesInWorker(createPublishDataSource(db), {
      templateDir: await this.ensureTemplateReady(),
      selections,
      site,
      settings,
    });
  }

  /**
   * 执行发布
   */
  async executePublish(
    db: Database.Database,
    config: ExecutePublishConfig,
    site: ISiteMeta
  ): Promise<IPublishResult> {
    const provider = createPublishProvider(
      config.providerType === "github"
        ? { type: "github", github: config.providerConfig }
        : { type: "s3", s3: config.providerConfig }
    );

    const options = { ...DEFAULT_UPLOAD_OPTIONS, ...config.options };
    const plan = await this.buildPublishPlan(db, site, config.settings);

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
    const totalOperations = plan.toUpload.length + plan.toDelete.length + extraProcessed;
    const total = Math.max(1, totalOperations);
    let current = extraProcessed;

    this.emitProgress({
      phase: "preparing",
      current,
      total,
    });

    const sendProgress = (phase: IPublishProgress["phase"], currentFile?: string) => {
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
      const concurrency = Math.max(1, Math.min(options.concurrency, plan.toUpload.length));
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

    // 新文件不完整时保留旧地址和历史，下一次发布继续重试。
    if (result.failed.length > 0) {
      sendProgress("finishing");
      return result;
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
    options: Required<IUploadOptions>
  ): Promise<boolean> {
    for (let attempt = 1; attempt <= options.maxRetries; attempt++) {
      try {
        const content = typeof file.content === "string" ? Buffer.from(file.content) : file.content;
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
    db: Database.Database,
    config: GithubExecuteConfig,
    plan: IPublishPlan
  ): Promise<IPublishResult> {
    const providerConfig = config.providerConfig;
    const needsPushStep = plan.toUpload.length + plan.toDelete.length > 0;
    const extraProcessed = plan.virtualProcessed || 0;
    const totalOperations =
      plan.toUpload.length + plan.toDelete.length + (needsPushStep ? 1 : 0) + extraProcessed;
    const total = Math.max(1, totalOperations);
    let current = extraProcessed;

    this.emitProgress({
      phase: "preparing",
      current,
      total,
    });

    const sendProgress = (phase: IPublishProgress["phase"], currentFile?: string) => {
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
        const content = typeof file.content === "string" ? Buffer.from(file.content) : file.content;
        writeFileSync(filePath, content);
        current++;
        sendProgress("uploading");
      }

      await repoGit.add(["-A"]);

      const committerName =
        providerConfig.committerName || config.siteConfig.title || "Tau Publisher";
      const committerEmail = providerConfig.committerEmail || "noreply@tau-editor.local";

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
        } else {
          log.info("No content changes detected, retry publishing the current commit.");
        }
        // 上次提交可能已成功但推送失败，必须确认远端更新后才能清理发布历史。
        await repoGit.push("origin", providerConfig.branch, ["--force"]);
        current++;
        sendProgress("pushing");
      }

      const result: IPublishResult = {
        success: true,
        uploaded: plan.toUpload.map(file => file.path),
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

  private async prepareGitRepository(workingDir: string, remoteUrl: string): Promise<void> {
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
      log.warn(`Clone ${remoteUrl} failed, fallback to initializing repo:`, error);
      mkdirSync(workingDir, { recursive: true });
      const repoGit = simpleGit(workingDir);
      await repoGit.init();
      const remotes = await repoGit.getRemotes(true);
      if (remotes.some(remote => remote.name === "origin")) {
        await repoGit.remote(["set-url", "origin", remoteUrl]);
      } else {
        await repoGit.addRemote("origin", remoteUrl);
      }
    }
  }

  private async checkoutTargetBranch(git: SimpleGit, branch: string): Promise<void> {
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
        log.warn("Backend WebSocket server is not ready, skip publish progress");
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
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default new PublishModule();
