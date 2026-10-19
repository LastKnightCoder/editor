import { ipcMain, BrowserWindow, app, dialog } from "electron";
import type Database from "better-sqlite3";
import { Module } from "../types/module";
import { pluginPublishSessions } from "../services/plugin-publish-provider";
import { publicationGitService } from "../services/publication-git-service";
import { copyJson } from "@tau/plugins/host";
import type { PublishTarget, GitSnapshotRequest } from "@tau/plugins";
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
  PublishRequest,
  PublishSiteConfig,
  IUploadOptions,
  DEFAULT_UPLOAD_OPTIONS,
} from "@/types/publish";
import { join, dirname } from "path";
import { createHash } from "node:crypto";
import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { describeRelease, planPublication, type ReleaseState } from "./publish-release-state";
import { uploadPublication } from "./publish-upload";
import { publicationDestination } from "./publish-destination";
import { assertPublishPath } from "@tau/plugins/template";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { recordSyncIo } from "./perf-record";
import log from "electron-log";
import BackendWebSocketServer from "../utils/BackendWebSocketServer";
import CardTable from "./tables/card";
import ContentLinkTable from "./tables/content-link";
import ArticleTable from "./tables/article";
import ProjectTable from "./tables/project";
import QuestionTable from "./tables/question";
import QuestionGroupTable from "./tables/question-group";
import QuestionLinkTable from "./tables/question-link";
import { readTemplatePackage } from "../services/template-package";
import { discoverPlugins } from "../services/plugin-discovery";
import { assertLocalId } from "@tau/plugins/package";
import { readPublishPlugins } from "../services/plugin-publish";
import type { PluginRenderContext } from "@tau/plugins/rendering";
import PathUtil from "../utils/PathUtil";
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
    getProject: id => ProjectTable.getProjectOrNull(db, id),
    getProjectItemsByIds: ids => ProjectTable.getProjectItemsByIds(db, ids),
    getProjectItemsByContentId: contentId => ProjectTable.getProjectItemsByContentId(db, contentId),
    listQuestionGroups: () => QuestionGroupTable.listGroups(db),
    listQuestionsByGroup: (groupId, filter, search) =>
      QuestionTable.listByGroup(db, groupId, filter, search),
    getQuestionAnswerById: id => QuestionTable.getAnswerById(db, id),
    getQuestionDetail: questionId => QuestionLinkTable.getDetail(db, questionId),
  };
}

type ProviderSession = Awaited<ReturnType<typeof pluginPublishSessions.begin>> & { owner: number };

class PublishModule implements Module {
  private readonly publishing = new Set<string>();
  private statePath(site: ISiteMeta) {
    if (!site.destination) throw new Error("发布目标身份缺失");
    const key = createHash("sha256")
      .update(site.destination ?? "")
      .digest("hex");
    return join(PathUtil.getAppDir(), "publish-releases", key + ".json");
  }
  private async readRelease(site: ISiteMeta): Promise<ReleaseState | undefined> {
    try {
      const state = JSON.parse(await readFile(this.statePath(site), "utf8"));
      if (state.version !== 1 || !state.current?.hashes || !state.current.data || !state.published)
        throw new Error("发布记录无效，请保留文件并检查");
      return state;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }
  private async saveRelease(site: ISiteMeta, state?: ReleaseState) {
    if (!state) return;
    const file = this.statePath(site);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file + ".tmp", JSON.stringify(state));
    await rename(file + ".tmp", file);
  }
  name = "publish";
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

    ipcMain.handle("list-publish-templates", async () => {
      const scan = await discoverPlugins(join(PathUtil.getAppDir(), "plugins"), app.getVersion());
      return scan.entries.flatMap(entry => (entry.template ? [entry.template] : []));
    });

    ipcMain.handle("execute-publish", async (event, config: PublishRequest) => {
      const db = this.getDatabase(event);
      if (!db) throw new Error("Database not available");
      if (config.providerType !== "plugin") throw new Error("远端发布需要选择插件");
      return this.withTarget(event.sender.id, config, (site, session) => {
        if (!session) throw new Error("发布会话缺失");
        return this.executePublish(db, config, site, session);
      });
    });
    ipcMain.handle("preview-publish-plan", async (event, config: PublishRequest) => {
      const db = this.getDatabase(event);
      if (!db) throw new Error("Database not available");
      return this.withTarget(event.sender.id, config, site =>
        this.previewPublishPlan(db, site, config.editorContext, config.settings)
      );
    });
    ipcMain.handle("describe-publish-target", (event, config: PublishRequest) =>
      this.withTarget(event.sender.id, config, site =>
        Promise.resolve({
          basePath: site.basePath,
          publicUrl: site.publicUrl,
        })
      )
    );
    ipcMain.handle(
      "export-publish-output",
      async (
        event,
        payload: {
          targetDir: string;
          basePath?: string;
          siteConfig: PublishSiteConfig;
          settings?: IPublishAppearanceSettings;
          editorContext?: PluginRenderContext;
        }
      ) => {
        const db = this.getDatabase(event);
        if (!db) throw new Error("Database not available");
        return this.exportPublishOutput(
          db,
          this.resolveSiteMeta(
            {
              identity: "local",
              basePath: this.normalizeBasePath(payload.basePath ?? "/"),
            },
            payload.siteConfig
          ),
          payload.targetDir,
          payload.settings,
          payload.editorContext
        );
      }
    );
    ipcMain.handle("check-publish-connection", (event, config: PublishRequest) =>
      this.withTarget(event.sender.id, config, (_site, session) =>
        session
          ? pluginPublishSessions.call<boolean>(event.sender.id, session.id, "checkConnection")
          : Promise.resolve(true)
      )
    );
    ipcMain.handle("publish-git:snapshot", (event, input: GitSnapshotRequest) =>
      publicationGitService.publish(event.sender.id, input)
    );
    ipcMain.handle("publish-git:cancel", (event, id: string) =>
      publicationGitService.cancel(event.sender.id, id)
    );
    ipcMain.handle("publish-git:select-cache", async event => {
      const window = BrowserWindow.fromWebContents(event.sender);
      if (!window) throw new Error("选择目录需要应用窗口");
      const selected = await dialog.showOpenDialog(window, {
        properties: ["openDirectory", "createDirectory"],
      });
      if (selected.canceled || !selected.filePaths[0]) return null;
      return publicationGitService.registerDirectory(selected.filePaths[0]);
    });
  }

  private async withTarget<T>(
    owner: number,
    config: PublishRequest,
    run: (site: ISiteMeta, session?: ProviderSession) => Promise<T>
  ): Promise<T> {
    if (config.providerType === "local")
      return run(
        this.resolveSiteMeta(
          {
            identity: "local",
            basePath: this.normalizeBasePath(config.basePath ?? "/"),
          },
          config.siteConfig
        )
      );
    if (config.providerType !== "plugin" || !config.pluginId)
      throw new Error("请先选择并启用发布插件");
    assertLocalId(config.pluginId);
    const opened = await pluginPublishSessions.begin(
      owner,
      config.pluginId,
      copyJson(config.providerConfig ?? {})
    );
    try {
      const target = await pluginPublishSessions.describe(owner, opened.id);
      return await run(this.resolveSiteMeta(target, config.siteConfig), { ...opened, owner });
    } finally {
      await pluginPublishSessions.end(owner, opened.id);
    }
  }

  private async exportPublishOutput(
    db: Database.Database,
    site: ISiteMeta,
    targetDir: string,
    settings?: IPublishAppearanceSettings,
    editorContext?: PluginRenderContext
  ): Promise<string[]> {
    const selections = PublishSelectionTable.getAll(db);
    const { files } = await this.generatePublishFiles(
      db,
      selections,
      site,
      settings,
      editorContext
    );

    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, { recursive: true });
    }

    const ordered = [
      ...files.filter(file => !file.publicationEntry),
      ...files.filter(file => file.publicationEntry),
    ];
    const targets = ordered.map(file => ({
      file,
      filePath: publicationDestination(targetDir, file.path),
    }));
    for (const { file, filePath } of targets) {
      const dir = dirname(filePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      const syncIoStart = Date.now();
      writeFileSync(filePath, file.content);
      recordSyncIo(`write:${filePath}`, file.content.length, Date.now() - syncIoStart);
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

  private resolveSiteMeta(target: PublishTarget, siteConfig: PublishSiteConfig): ISiteMeta {
    return {
      destination: target.identity,
      templateId: siteConfig?.templateId,
      title: siteConfig?.title?.trim() || "我的博客",
      description: siteConfig?.description || "",
      basePath: target.basePath,
      publicUrl: siteConfig?.publicUrl?.trim() || target.publicUrl || "",
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

  private async ensureTemplateReady(id?: string) {
    if (!id) throw new Error("请先选择已安装的模板插件");
    assertLocalId(id);
    const template = await readTemplatePackage(
      join(PathUtil.getAppDir(), "plugins", id),
      app.getVersion()
    );
    if (template.manifest.id !== id) throw new Error("模板身份与目录不一致");
    return template;
  }

  /**
   * 构建发布计划
   */
  async buildPublishPlan(
    db: Database.Database,
    site: ISiteMeta,
    appearanceSettings?: IPublishAppearanceSettings,
    editorContext?: PluginRenderContext
  ): Promise<IPublishPlan> {
    // 获取选中的内容
    const selections = PublishSelectionTable.getAll(db);

    const { files, virtualProcessed } = await this.generatePublishFiles(
      db,
      selections,
      site,
      appearanceSettings,
      editorContext
    );
    const { state, history: targetHistory } = await this.publicationHistory(db, site);
    const plan = planPublication(files, targetHistory, state);
    // 首次迁移到本目标时完整上传，不能沿用其他目标或旧生成器的上传摘要。
    if (!state) {
      plan.toUpload = files;
      plan.unchanged = [];
    }
    return { ...plan, virtualProcessed };
  }

  private async publicationHistory(_db: Database.Database, site: ISiteMeta) {
    const state = await this.readRelease(site);
    const history = state
      ? Object.entries({ ...state.published, ...state.pending }).map(([filePath, contentHash]) => ({
          filePath,
          contentHash,
        }))
      : [];
    return { state, history };
  }

  /**
   * 预览发布计划：只取路径，文件内容不离开 worker
   */
  private async previewPublishPlan(
    db: Database.Database,
    site: ISiteMeta,
    editorContext?: PluginRenderContext,
    settings?: IPublishAppearanceSettings
  ): Promise<IPublishPlanPreview> {
    const selections = PublishSelectionTable.getAll(db);
    const result = await generatePublishPathsInWorker(
      createPublishDataSource(db),
      await this.generatorRequest(selections, site, settings, editorContext)
    );
    const { state, history } = await this.publicationHistory(db, site);
    const plan = planPublication(result.files, history, state, result.release);
    return {
      toUpload: state ? plan.toUpload.map(file => file.path) : result.paths,
      toDelete: plan.toDelete,
    };
  }

  /**
   * 生成要发布的文件（worker 线程执行）
   */
  async generatePublishFiles(
    db: Database.Database,
    selections: PublishSelectionInput[],
    site: ISiteMeta,
    settings?: IPublishAppearanceSettings,
    editorContext?: PluginRenderContext
  ): Promise<{ files: IPublishFile[]; virtualProcessed: number }> {
    return generatePublishFilesInWorker(
      createPublishDataSource(db),
      await this.generatorRequest(selections, site, settings, editorContext)
    );
  }

  private async generatorRequest(
    selections: PublishSelectionInput[],
    site: ISiteMeta,
    settings?: IPublishAppearanceSettings,
    editorContext?: PluginRenderContext
  ) {
    return {
      template: await this.ensureTemplateReady(site.templateId),
      selections,
      site,
      settings,
      plugins: editorContext
        ? await readPublishPlugins(join(PathUtil.getAppDir(), "plugins"), editorContext)
        : undefined,
    };
  }

  /**
   * 执行发布
   */
  async executePublish(
    db: Database.Database,
    config: PublishRequest,
    site: ISiteMeta,
    session: ProviderSession
  ): Promise<IPublishResult> {
    const key = this.statePath(site);
    const keys = [key];
    if (keys.some(key => this.publishing.has(key)))
      throw new Error("此发布目标或缓存已有任务正在执行");
    keys.forEach(key => this.publishing.add(key));
    try {
      return await this.publish(db, config, site, session);
    } finally {
      keys.forEach(key => this.publishing.delete(key));
    }
  }

  private async publish(
    db: Database.Database,
    config: PublishRequest,
    site: ISiteMeta,
    session: ProviderSession
  ): Promise<IPublishResult> {
    const options = {
      maxRetries: Math.min(
        5,
        Math.max(1, config.options?.maxRetries ?? DEFAULT_UPLOAD_OPTIONS.maxRetries)
      ),
      retryDelay: Math.min(
        30_000,
        Math.max(0, config.options?.retryDelay ?? DEFAULT_UPLOAD_OPTIONS.retryDelay)
      ),
      concurrency: Math.min(
        session.concurrency,
        Math.max(1, config.options?.concurrency ?? DEFAULT_UPLOAD_OPTIONS.concurrency)
      ),
    };
    const provider = {
      uploadFile: (path: string, content: Buffer) =>
        pluginPublishSessions.call<void>(session.owner, session.id, "uploadFile", [
          path,
          new Uint8Array(content),
        ]),
      deleteFile: (path: string) =>
        pluginPublishSessions.call<void>(session.owner, session.id, "deleteFile", [path]),
    };
    const plan = await this.buildPublishPlan(db, site, config.settings, config.editorContext);
    session.signal.throwIfAborted();
    if (session.mode === "snapshot") {
      const publication = publicationGitService.register(session.owner, plan, session.signal);
      try {
        this.emitProgress({ phase: "pushing", current: 0, total: 1 });
        await pluginPublishSessions.call<void>(session.owner, session.id, "publish", [
          {
            id: publication.id,
            files: plan.toUpload.map(file => ({ path: file.path, hash: file.hash })),
            deletions: plan.toDelete,
          },
        ]);
        session.signal.throwIfAborted();
        for (const file of plan.toUpload)
          PublishHistoryTable.upsert(db, {
            filePath: file.path,
            contentHash: file.hash,
            sourceType: file.sourceType,
            sourceId: file.sourceId,
          });
        for (const path of plan.toDelete) PublishHistoryTable.delete(db, path);
        if (plan.releaseState) delete plan.releaseState.pending;
        await this.saveRelease(site, plan.releaseState);
        this.emitProgress({ phase: "finishing", current: 1, total: 1 });
        return {
          success: true,
          uploaded: plan.toUpload.map(file => file.path),
          deleted: plan.toDelete,
          failed: [],
          skipped: plan.unchanged,
        };
      } finally {
        publication.dispose();
      }
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
    await uploadPublication(plan.toUpload, options.concurrency, async file => {
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
      return success;
    });

    // 新文件不完整时保留旧地址和历史，下一次发布继续重试。
    if (result.failed.length > 0) {
      const baseline = (await this.readRelease(site)) ?? {
        version: 1 as const,
        current: describeRelease([]),
        published: {},
      };
      const completed = plan.toUpload.filter(file => result.uploaded.includes(file.path));
      await this.saveRelease(site, {
        ...baseline,
        pending: {
          ...baseline.pending,
          ...Object.fromEntries(completed.map(file => [file.path, file.hash])),
        },
      });
      sendProgress("finishing");
      return result;
    }

    await this.saveRelease(site, plan.releaseState);

    // 删除旧文件
    sendProgress("deleting");
    for (const path of plan.toDelete) {
      current++;
      sendProgress("deleting", path);

      try {
        await provider.deleteFile(path);
        result.deleted.push(path);
        PublishHistoryTable.delete(db, path);
        if (plan.releaseState?.pending) delete plan.releaseState.pending[path];
      } catch (error) {
        result.failed.push({ path, error: String(error) });
        result.success = false;
      }
    }

    await this.saveRelease(site, plan.releaseState);
    sendProgress("finishing");
    return result;
  }

  /**
   * 带重试的上传
   */
  private async uploadWithRetry(
    provider: { uploadFile(path: string, content: Buffer): Promise<void> },
    file: IPublishFile,
    options: Required<IUploadOptions>
  ): Promise<boolean> {
    assertPublishPath(file.path);
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
