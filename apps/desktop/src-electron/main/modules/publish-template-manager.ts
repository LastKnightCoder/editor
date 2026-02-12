import { app } from "electron";
import { createWriteStream } from "node:fs";
import * as fs from "fs-extra";
import * as http from "node:http";
import * as https from "node:https";
import * as path from "node:path";
import AdmZip from "adm-zip";
import log from "electron-log";

const PUBLISH_TEMPLATE_LATEST_JSON_URL =
  "https://release-bin.oss-cn-shanghai.aliyuncs.com/publish-template-latest.json";
const DOWNLOAD_TIMEOUT_MS = 60_000;
const MAX_REDIRECTS = 5;

const REQUIRED_TEMPLATE_FILES = [
  "src/templates/home/index.html",
  "src/templates/card/index.html",
  "src/templates/article/index.html",
  "src/templates/doc/index.html",
  "src/templates/list/index.html",
];

interface PublishTemplateLatestJson {
  version: string;
  asset: {
    url: string;
    // 第一阶段可选，后续启用强校验时复用
    sha256?: string;
  };
}

interface PublishTemplateMeta {
  installedVersion: string;
  templateDir: string;
  downloadUrl: string;
  updatedAt: number;
  sha256?: string;
}

class PublishTemplateManager {
  private inFlight: Promise<string> | null = null;
  private cachedTemplateDir: string | null = null;

  async ensureTemplateReady(): Promise<string> {
    if (
      this.cachedTemplateDir &&
      (await this.validateTemplateDirectory(this.cachedTemplateDir))
    ) {
      return this.cachedTemplateDir;
    }

    if (this.inFlight) {
      return this.inFlight;
    }

    this.inFlight = this.prepareTemplate().finally(() => {
      this.inFlight = null;
    });

    return this.inFlight;
  }

  private async prepareTemplate(): Promise<string> {
    await fs.ensureDir(this.getVersionsDir());
    await fs.ensureDir(this.getDownloadsDir());

    const installed = await this.loadInstalledMeta();
    let latest: PublishTemplateLatestJson;

    try {
      latest = await this.fetchLatestJson(PUBLISH_TEMPLATE_LATEST_JSON_URL);
    } catch (error) {
      if (installed) {
        log.warn(
          `[PublishTemplate] 获取 latest.json 失败，回退本地缓存: ${error instanceof Error ? error.message : String(error)}`,
        );
        this.cachedTemplateDir = installed.templateDir;
        return installed.templateDir;
      }
      throw new Error(
        `获取 publish 模板版本信息失败: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    if (installed && installed.installedVersion === latest.version) {
      this.cachedTemplateDir = installed.templateDir;
      return installed.templateDir;
    }

    try {
      const templateDir = await this.downloadAndInstall(latest);
      this.cachedTemplateDir = templateDir;
      return templateDir;
    } catch (error) {
      if (installed) {
        log.warn(
          `[PublishTemplate] 下载新模板失败，回退本地缓存: ${error instanceof Error ? error.message : String(error)}`,
        );
        this.cachedTemplateDir = installed.templateDir;
        return installed.templateDir;
      }
      throw new Error(
        `下载 publish 模板失败，且无可用缓存: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private getBaseDir(): string {
    return path.join(app.getPath("userData"), "publish-template");
  }

  private getVersionsDir(): string {
    return path.join(this.getBaseDir(), "versions");
  }

  private getDownloadsDir(): string {
    return path.join(this.getBaseDir(), "downloads");
  }

  private getMetaPath(): string {
    return path.join(this.getBaseDir(), "meta.json");
  }

  private getVersionDir(version: string): string {
    return path.join(this.getVersionsDir(), version);
  }

  private async loadInstalledMeta(): Promise<PublishTemplateMeta | null> {
    const metaPath = this.getMetaPath();
    if (!(await fs.pathExists(metaPath))) {
      return null;
    }

    try {
      const parsed = (await fs.readJSON(
        metaPath,
      )) as Partial<PublishTemplateMeta>;
      if (
        typeof parsed.installedVersion !== "string" ||
        typeof parsed.templateDir !== "string" ||
        typeof parsed.downloadUrl !== "string"
      ) {
        await fs.remove(metaPath).catch(() => {});
        return null;
      }

      const meta: PublishTemplateMeta = {
        installedVersion: parsed.installedVersion,
        templateDir: parsed.templateDir,
        downloadUrl: parsed.downloadUrl,
        updatedAt:
          typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
        sha256: typeof parsed.sha256 === "string" ? parsed.sha256 : undefined,
      };

      const valid = await this.validateTemplateDirectory(meta.templateDir);
      if (!valid) {
        await fs.remove(metaPath).catch(() => {});
        return null;
      }

      return meta;
    } catch {
      await fs.remove(metaPath).catch(() => {});
      return null;
    }
  }

  private async writeInstalledMeta(meta: PublishTemplateMeta): Promise<void> {
    await fs.ensureDir(path.dirname(this.getMetaPath()));
    await fs.writeJSON(this.getMetaPath(), meta, { spaces: 2 });
  }

  private async validateTemplateDirectory(
    templateDir: string,
  ): Promise<boolean> {
    const rootExists = await fs.pathExists(templateDir);
    if (!rootExists) {
      return false;
    }

    for (const relativeFile of REQUIRED_TEMPLATE_FILES) {
      const filePath = path.join(templateDir, relativeFile);
      if (!(await fs.pathExists(filePath))) {
        return false;
      }
      const stat = await fs.stat(filePath);
      if (!stat.isFile()) {
        return false;
      }
    }

    const assetsDir = path.join(templateDir, "assets");
    if (!(await fs.pathExists(assetsDir))) {
      return false;
    }
    const assetsStat = await fs.stat(assetsDir);
    if (!assetsStat.isDirectory()) {
      return false;
    }
    const assetsEntries = await fs.readdir(assetsDir);
    return assetsEntries.length > 0;
  }

  private async downloadAndInstall(
    latest: PublishTemplateLatestJson,
  ): Promise<string> {
    const installToken = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const zipTempPath = path.join(
      this.getDownloadsDir(),
      `publish-template-${latest.version}-${installToken}.zip.tmp`,
    );
    const extractTempDir = path.join(
      this.getVersionsDir(),
      `${latest.version}.tmp-${installToken}`,
    );
    const finalVersionDir = this.getVersionDir(latest.version);

    await fs.remove(zipTempPath).catch(() => {});
    await fs.remove(extractTempDir).catch(() => {});

    try {
      await this.downloadFile(latest.asset.url, zipTempPath);

      const zip = new AdmZip(zipTempPath);
      zip.extractAllTo(extractTempDir, true);

      const valid = await this.validateTemplateDirectory(extractTempDir);
      if (!valid) {
        throw new Error("模板结构校验失败");
      }

      await fs.remove(finalVersionDir).catch(() => {});
      await fs.move(extractTempDir, finalVersionDir, { overwrite: true });

      await this.writeInstalledMeta({
        installedVersion: latest.version,
        templateDir: finalVersionDir,
        downloadUrl: latest.asset.url,
        updatedAt: Date.now(),
        sha256: latest.asset.sha256,
      });

      await this.cleanupOldVersions(latest.version);
      log.info(`[PublishTemplate] 模板已更新到版本 ${latest.version}`);
      return finalVersionDir;
    } finally {
      await fs.remove(zipTempPath).catch(() => {});
      await fs.remove(extractTempDir).catch(() => {});
    }
  }

  private async cleanupOldVersions(activeVersion: string): Promise<void> {
    const versionsDir = this.getVersionsDir();
    const entries = await fs.readdir(versionsDir).catch(() => []);
    for (const entry of entries) {
      if (entry !== activeVersion) {
        await fs.remove(path.join(versionsDir, entry)).catch(() => {});
      }
    }
  }

  private async fetchLatestJson(
    url: string,
    redirectCount = 0,
  ): Promise<PublishTemplateLatestJson> {
    if (redirectCount > MAX_REDIRECTS) {
      throw new Error("获取 publish template latest.json 重定向次数过多");
    }

    const response = await this.requestBuffer(url);
    if (
      response.statusCode >= 300 &&
      response.statusCode < 400 &&
      response.headers.location
    ) {
      const redirectUrl = new URL(response.headers.location, url).toString();
      return this.fetchLatestJson(redirectUrl, redirectCount + 1);
    }

    if (response.statusCode >= 400) {
      throw new Error(
        `publish template latest.json 请求失败，状态码 ${response.statusCode}`,
      );
    }

    const raw = response.body.toString("utf-8");
    return this.parseLatestJson(raw);
  }

  private parseLatestJson(raw: string): PublishTemplateLatestJson {
    const parsed = JSON.parse(raw) as {
      version?: unknown;
      asset?: {
        url?: unknown;
        sha256?: unknown;
      };
    };

    if (
      typeof parsed.version !== "string" ||
      !parsed.asset ||
      typeof parsed.asset.url !== "string"
    ) {
      throw new Error("publish template latest.json 格式无效");
    }

    return {
      version: parsed.version,
      asset: {
        url: parsed.asset.url,
        sha256:
          typeof parsed.asset.sha256 === "string"
            ? parsed.asset.sha256
            : undefined,
      },
    };
  }

  private async downloadFile(
    url: string,
    destPath: string,
    redirectCount = 0,
  ): Promise<void> {
    if (redirectCount > MAX_REDIRECTS) {
      throw new Error("下载 publish template 重定向次数过多");
    }

    await fs.ensureDir(path.dirname(destPath));

    await new Promise<void>((resolve, reject) => {
      const urlObject = new URL(url);
      const requestImpl = urlObject.protocol === "https:" ? https : http;

      const request = requestImpl.request(
        {
          method: "GET",
          hostname: urlObject.hostname,
          port: urlObject.port || (urlObject.protocol === "https:" ? 443 : 80),
          path: `${urlObject.pathname}${urlObject.search}`,
          headers: {
            "User-Agent": "Tau-PublishTemplateManager",
            Accept: "application/octet-stream,*/*",
          },
          timeout: DOWNLOAD_TIMEOUT_MS,
        },
        (response) => {
          const statusCode = response.statusCode || 0;

          if (
            statusCode >= 300 &&
            statusCode < 400 &&
            response.headers.location
          ) {
            response.resume();
            const redirectUrl = new URL(
              response.headers.location,
              url,
            ).toString();
            void this.downloadFile(redirectUrl, destPath, redirectCount + 1)
              .then(resolve)
              .catch(reject);
            return;
          }

          if (statusCode < 200 || statusCode >= 400) {
            response.resume();
            reject(
              new Error(`下载 publish template 失败，状态码 ${statusCode}`),
            );
            return;
          }

          const writeStream = createWriteStream(destPath);
          response.on("error", reject);
          writeStream.on("error", reject);
          writeStream.on("finish", () => {
            resolve();
          });
          response.pipe(writeStream);
        },
      );

      request.on("timeout", () => {
        request.destroy(new Error("请求超时"));
      });
      request.on("error", reject);
      request.end();
    });
  }

  private async requestBuffer(url: string): Promise<{
    statusCode: number;
    headers: http.IncomingHttpHeaders;
    body: Buffer;
  }> {
    return new Promise((resolve, reject) => {
      const urlObject = new URL(url);
      const requestImpl = urlObject.protocol === "https:" ? https : http;

      const request = requestImpl.request(
        {
          method: "GET",
          hostname: urlObject.hostname,
          port: urlObject.port || (urlObject.protocol === "https:" ? 443 : 80),
          path: `${urlObject.pathname}${urlObject.search}`,
          headers: {
            "User-Agent": "Tau-PublishTemplateManager",
            Accept: "application/json,application/octet-stream,*/*",
          },
          timeout: DOWNLOAD_TIMEOUT_MS,
        },
        (response) => {
          const chunks: Buffer[] = [];
          response.on("data", (chunk: Buffer) => {
            chunks.push(chunk);
          });
          response.on("error", reject);
          response.on("end", () => {
            resolve({
              statusCode: response.statusCode || 0,
              headers: response.headers,
              body: Buffer.concat(chunks),
            });
          });
        },
      );

      request.on("timeout", () => {
        request.destroy(new Error("请求超时"));
      });
      request.on("error", reject);
      request.end();
    });
  }
}

export default new PublishTemplateManager();
