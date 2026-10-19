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
import { createHash } from "node:crypto";
import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { describeRelease, planPublication, type ReleaseState } from "./publish-release-state";
import { uploadPublication } from "./publish-upload";
import { publicationDestination } from "./publish-destination";
import { stagePublication, publicationGitError } from "./publish-git";
import { assertPublishPath } from "@tau/plugins/template";
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync } from "fs";
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

type ExecutePublishConfig = (
  | {
      providerType: "github";
      providerConfig: IGithubPagesConfig;
      siteConfig: {
        templateId?: string;
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
        templateId?: string;
        title: string;
        description: string;
        publicUrl?: string;
        favicon?: IPublishFaviconConfig;
      };
      settings?: IPublishAppearanceSettings;
      options?: IUploadOptions;
    }
) & { editorContext?: PluginRenderContext };

type GithubExecuteConfig = Extract<ExecutePublishConfig, { providerType: "github" }>;

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

    // 预览发布计划
    ipcMain.handle(
      "preview-publish-plan",
      async (
        event,
        config: {
          providerType: "github" | "s3" | "local";
          providerConfig?: Record<string, unknown>;
          siteConfig: {
            templateId?: string;
            title: string;
            description: string;
            publicUrl?: string;
            favicon?: IPublishFaviconConfig;
          };
          settings?: IPublishAppearanceSettings;
          editorContext?: PluginRenderContext;
        }
      ) => {
        const db = this.getDatabase(event);
        if (!db) {
          throw new Error("Database not available");
        }

        const siteMeta = this.resolveSiteMeta(
          config.providerType,
          config.providerConfig ?? {},
          config.siteConfig
        );
        return this.previewPublishPlan(db, siteMeta, config.editorContext, config.settings);
      }
    );

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
            templateId?: string;
            title: string;
            description: string;
            publicUrl?: string;
            favicon?: IPublishFaviconConfig;
          };
          settings?: IPublishAppearanceSettings;
          editorContext?: PluginRenderContext;
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

        return this.exportPublishOutput(
          db,
          siteMeta,
          payload.targetDir,
          payload.settings,
          payload.editorContext
        );
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

  private resolveSiteMeta(
    providerType: "github" | "s3" | "local",
    providerConfig: unknown,
    siteConfig: {
      templateId?: string;
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
      destination: JSON.stringify([
        providerType,
        ...(providerType === "github"
          ? [
              (providerConfig as IGithubPagesConfig).repo,
              (providerConfig as IGithubPagesConfig).branch,
            ]
          : [
              (providerConfig as IS3HostingConfig).bucket,
              (providerConfig as IS3HostingConfig).pathPrefix,
              (providerConfig as IS3HostingConfig).endpoint,
            ]),
      ]),
      templateId: siteConfig?.templateId,
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

  private async publicationHistory(db: Database.Database, site: ISiteMeta) {
    const state = await this.readRelease(site);
    const history = state
      ? Object.entries({ ...state.published, ...state.pending }).map(([filePath, contentHash]) => ({
          filePath,
          contentHash,
        }))
      : PublishHistoryTable.getAll(db);
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
      clientSource: readFileSync(join(__dirname, "publish-data-client.js"), "utf8"),
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
    config: ExecutePublishConfig,
    site: ISiteMeta
  ): Promise<IPublishResult> {
    const key = this.statePath(site);
    const keys = [
      key,
      ...(config.providerType === "github" && config.providerConfig.useGitCli
        ? ["git:" + this.gitWorkingDirectory(config.providerConfig)]
        : []),
    ];
    if (keys.some(key => this.publishing.has(key)))
      throw new Error("此发布目标或缓存已有任务正在执行");
    keys.forEach(key => this.publishing.add(key));
    try {
      return await this.publish(db, config, site);
    } finally {
      keys.forEach(key => this.publishing.delete(key));
    }
  }

  private async publish(
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
    const plan = await this.buildPublishPlan(db, site, config.settings, config.editorContext);

    if (config.providerType === "github" && config.providerConfig.useGitCli) {
      const result = await this.executeGitCliPublish(db, config, plan);
      if (result.success) {
        delete plan.releaseState?.pending;
        await this.saveRelease(site, plan.releaseState);
      }
      return result;
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
    provider: IPublishProvider,
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

  private gitWorkingDirectory(config: IGithubPagesConfig): string {
    const repoSafeName = config.repo.replace(/[\/\\]/g, "_");
    if (
      !/^[a-zA-Z0-9-]+\/[a-zA-Z0-9_.-]+$/.test(config.repo) ||
      [".", ".."].includes(config.repo.split("/")[1])
    )
      throw new Error("GitHub 发布仓库必须是 owner/repository");
    const customBaseDir = config.gitWorkingDir?.trim();
    const baseDir = customBaseDir
      ? resolve(customBaseDir)
      : join(app.getPath("userData"), "publish-git");
    return join(baseDir, repoSafeName);
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

    const workingDir = this.gitWorkingDirectory(providerConfig);
    mkdirSync(dirname(workingDir), { recursive: true });
    const remoteUrl = `https://x-access-token:${providerConfig.token}@github.com/${providerConfig.repo}.git`;

    try {
      await this.prepareGitRepository(workingDir, remoteUrl);

      const repoGit = simpleGit(workingDir);
      await repoGit.raw(["remote", "set-url", "origin", remoteUrl]);
      try {
        await repoGit.fetch();
      } catch (fetchError) {
        log.warn(
          "Git fetch failed, continue with local workspace",
          publicationGitError(fetchError, [remoteUrl, providerConfig.token])
        );
      }

      await this.checkoutTargetBranch(repoGit, providerConfig.branch);
      const targets = new Map(
        [...plan.toDelete, ...plan.toUpload.map(file => file.path)].map(file => [
          file,
          publicationDestination(workingDir, file),
        ])
      );
      for (const file of plan.toDelete) rmSync(targets.get(file)!, { force: true });

      sendProgress("uploading");
      for (const file of plan.toUpload) {
        sendProgress("uploading", file.path);
        const filePath = targets.get(file.path)!;
        const dir = dirname(filePath);
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }
        const content = typeof file.content === "string" ? Buffer.from(file.content) : file.content;
        writeFileSync(filePath, content);
        current++;
        sendProgress("uploading");
      }

      await stagePublication(
        repoGit,
        plan.toUpload.map(file => file.path),
        plan.toDelete
      );

      const committerName =
        providerConfig.committerName || config.siteConfig.title || "Tau Publisher";
      const committerEmail = providerConfig.committerEmail || "noreply@tau-editor.local";

      await repoGit.addConfig("user.name", committerName);
      await repoGit.addConfig("user.email", committerEmail);

      let status: Awaited<ReturnType<SimpleGit["status"]>> | null = null;
      if (needsPushStep) {
        sendProgress("pushing", "git push");
        status = await repoGit.status();
        if (status.staged.length > 0) {
          const commitMessage = `Publish at ${new Date().toISOString()}`;
          await repoGit.commit(commitMessage, undefined, {
            "--author": `${committerName} <${committerEmail}>`,
          });
        } else {
          log.info("No content changes detected, retry publishing the current commit.");
        }
        // 上次提交可能已成功但推送失败，必须确认远端更新后才能清理发布历史。
        await repoGit.push("origin", providerConfig.branch);
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
      const safeError = publicationGitError(error, [remoteUrl, providerConfig.token]);
      log.error("Git publish failed:", safeError);
      throw safeError;
    }
  }

  private async prepareGitRepository(workingDir: string, remoteUrl: string): Promise<void> {
    const gitDir = join(workingDir, ".git");
    if (existsSync(gitDir)) {
      return;
    }

    if (existsSync(workingDir)) {
      if (readdirSync(workingDir).length)
        throw new Error("发布缓存非空且不是 Git 仓库，请选择独立缓存目录");
    }
    mkdirSync(dirname(workingDir), { recursive: true });

    try {
      await simpleGit().clone(remoteUrl, workingDir);
    } catch (error) {
      log.warn(
        "Clone failed, fallback to initializing publish cache:",
        publicationGitError(error, [remoteUrl])
      );
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
      if (await this.remoteBranchExists(git, branch))
        await git.merge(["--ff-only", `origin/${branch}`]);
      return;
    }

    const remoteExists = await this.remoteBranchExists(git, branch);
    if (remoteExists) {
      await git.checkout(["-B", branch, `origin/${branch}`]);
      return;
    }

    await git.checkout(["--orphan", branch]);
    await git.raw(["rm", "-r", "--cached", "--ignore-unmatch", "."]);
  }

  private async remoteBranchExists(git: SimpleGit, branch: string) {
    const output = await git.listRemote(["--heads", "origin", branch]);
    return output.trim().length > 0;
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
