import { app, BrowserWindow, ipcMain } from "electron";
import fs from "fs-extra";
import type { IncomingHttpHeaders, IncomingMessage } from "http";
import http from "http";
import https from "https";
import path from "path";

const PYTHON_RUNTIME_LATEST_JSON_URL =
  "https://release-bin.oss-cn-shanghai.aliyuncs.com/python-services-latest.json";

const DOWNLOAD_TIMEOUT_MS = 60_000;
const MAX_REDIRECTS = 5;

export type PythonRuntimeState =
  | "idle"
  | "checking"
  | "downloading"
  | "ready"
  | "degraded"
  | "error";

export type PythonRuntimeErrorCode =
  | "PY_RUNTIME_NOT_READY"
  | "PY_RUNTIME_DOWNLOAD_FAILED"
  | "PY_RUNTIME_PLATFORM_UNSUPPORTED";

export interface PythonRuntimeStatus {
  state: PythonRuntimeState;
  message: string;
  progress: number;
  installedVersion: string | null;
  latestVersion: string | null;
  isDownloading: boolean;
}

export interface PythonRuntimeProgress extends PythonRuntimeStatus {
  trigger: "foreground" | "background";
}

interface PythonRuntimeAsset {
  url: string;
}

interface PythonRuntimeLatestJson {
  version: string;
  assets: {
    win32?: PythonRuntimeAsset;
    darwin?: PythonRuntimeAsset;
  };
}

interface HttpBufferedResponse {
  statusCode: number;
  headers: IncomingHttpHeaders;
  body: Buffer;
}

interface PythonRuntimeMeta {
  installedVersion: string;
  binaryPath: string;
  updatedAt: number;
}

interface PythonRuntimeBinaryInfo {
  binaryPath: string;
  version: string;
}

export class PythonRuntimeError extends Error {
  code: PythonRuntimeErrorCode;

  constructor(code: PythonRuntimeErrorCode, message: string) {
    super(`[${code}] ${message}`);
    this.name = "PythonRuntimeError";
    this.code = code;
  }
}

const isPythonRuntimeError = (error: unknown): error is PythonRuntimeError => {
  return error instanceof PythonRuntimeError;
};

const toError = (error: unknown): Error => {
  if (error instanceof Error) {
    return error;
  }
  return new Error(String(error));
};

const normalizeSemver = (version: string): [number, number, number] => {
  const match = version.trim().match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  if (!match) {
    throw new Error(`Invalid semver version: ${version}`);
  }

  return [Number(match[1]), Number(match[2]), Number(match[3])];
};

const compareSemver = (left: string, right: string): number => {
  const leftParts = normalizeSemver(left);
  const rightParts = normalizeSemver(right);

  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] > rightParts[index]) {
      return 1;
    }
    if (leftParts[index] < rightParts[index]) {
      return -1;
    }
  }

  return 0;
};

class PythonRuntimeManager {
  private initialized = false;
  private bootstrapped = false;
  private status: PythonRuntimeStatus = {
    state: "idle",
    message: "Python 运行时未检查",
    progress: 0,
    installedVersion: null,
    latestVersion: null,
    isDownloading: false,
  };
  private inFlightTask: Promise<PythonRuntimeBinaryInfo> | null = null;

  private getRuntimeDir() {
    return path.join(app.getPath("userData"), "runtime", "python-server");
  }

  private getMetaPath() {
    return path.join(this.getRuntimeDir(), "meta.json");
  }

  private getPendingMetaPath() {
    return path.join(this.getRuntimeDir(), "pending-meta.json");
  }

  private getRuntimeBinaryPath(version: string) {
    const ext = process.platform === "win32" ? ".exe" : "";
    return path.join(this.getRuntimeDir(), `python-server-${version}${ext}`);
  }

  init() {
    if (this.initialized) {
      return;
    }

    this.initialized = true;

    ipcMain.handle("python-runtime-status", async () => {
      await this.ensureBootstrapped();
      return this.getStatus();
    });

    ipcMain.handle("python-runtime-retry", async () => {
      try {
        await this.ensureReady({ trigger: "foreground", forceCheck: true });
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });
  }

  getStatus(): PythonRuntimeStatus {
    return { ...this.status };
  }

  checkForUpdateInBackground(): void {
    void this.ensureReady({ trigger: "background" }).catch((error) => {
      console.warn("[PythonRuntimeManager] Background check failed:", error);
    });
  }

  async retryDownload(): Promise<PythonRuntimeBinaryInfo> {
    return this.ensureReady({ trigger: "foreground", forceCheck: true });
  }

  async ensureReady(options?: {
    trigger?: "foreground" | "background";
    forceCheck?: boolean;
  }): Promise<PythonRuntimeBinaryInfo> {
    const trigger = options?.trigger || "foreground";

    if (this.inFlightTask) {
      return this.inFlightTask;
    }

    this.inFlightTask = this.prepareRuntime({
      trigger,
      forceCheck: options?.forceCheck || false,
    }).finally(() => {
      this.inFlightTask = null;
    });

    return this.inFlightTask;
  }

  private async prepareRuntime(options: {
    trigger: "foreground" | "background";
    forceCheck: boolean;
  }): Promise<PythonRuntimeBinaryInfo> {
    if (process.platform !== "win32" && process.platform !== "darwin") {
      const error = new PythonRuntimeError(
        "PY_RUNTIME_PLATFORM_UNSUPPORTED",
        `当前平台不支持 python-server 下载: ${process.platform}`,
      );
      this.updateStatus(
        {
          state: "error",
          message: error.message,
          progress: 0,
          isDownloading: false,
        },
        options.trigger,
      );
      throw error;
    }

    await this.ensureBootstrapped();
    await fs.ensureDir(this.getRuntimeDir());

    const installedMeta = await this.loadInstalledMeta();
    const installedBinaryExists = installedMeta
      ? await fs.pathExists(installedMeta.binaryPath)
      : false;

    if (installedMeta && !installedBinaryExists) {
      await this.removeInstalledMeta();
      this.updateStatus(
        {
          installedVersion: null,
        },
        options.trigger,
      );
    }

    this.updateStatus(
      {
        state: "checking",
        message: "正在检查 Python 运行时版本...",
        progress: 0,
        isDownloading: false,
      },
      options.trigger,
    );

    let latestJson: PythonRuntimeLatestJson;
    try {
      latestJson = await this.fetchLatestJson(PYTHON_RUNTIME_LATEST_JSON_URL);
    } catch (error) {
      if (installedMeta && installedBinaryExists) {
        this.updateStatus(
          {
            state: "degraded",
            message: "检查更新失败，继续使用本地 Python 运行时",
            progress: 100,
            isDownloading: false,
          },
          options.trigger,
        );
        return {
          binaryPath: installedMeta.binaryPath,
          version: installedMeta.installedVersion,
        };
      }

      const runtimeError = new PythonRuntimeError(
        "PY_RUNTIME_NOT_READY",
        `获取 Python 运行时版本信息失败: ${error instanceof Error ? error.message : String(error)}`,
      );
      this.updateStatus(
        {
          state: "error",
          message: runtimeError.message,
          progress: 0,
          isDownloading: false,
        },
        options.trigger,
      );
      throw runtimeError;
    }

    this.updateStatus(
      {
        latestVersion: latestJson.version,
      },
      options.trigger,
    );

    const asset = latestJson.assets[process.platform as "win32" | "darwin"];
    if (!asset?.url) {
      const runtimeError = new PythonRuntimeError(
        "PY_RUNTIME_PLATFORM_UNSUPPORTED",
        `latest.json 缺少平台 ${process.platform} 的下载地址`,
      );
      this.updateStatus(
        {
          state: "error",
          message: runtimeError.message,
          progress: 0,
          isDownloading: false,
        },
        options.trigger,
      );
      throw runtimeError;
    }

    let hasInstalledVersion =
      !!installedMeta?.installedVersion && installedBinaryExists;

    if (hasInstalledVersion && installedMeta) {
      try {
        normalizeSemver(installedMeta.installedVersion);
      } catch {
        hasInstalledVersion = false;
      }
    }

    const needsInstall = !hasInstalledVersion;
    const hasNewerVersion =
      hasInstalledVersion &&
      installedMeta &&
      compareSemver(latestJson.version, installedMeta.installedVersion) > 0;

    if (!needsInstall && !hasNewerVersion && !options.forceCheck) {
      if (!installedMeta) {
        throw new Error("installedMeta 不应为 null");
      }
      this.updateStatus(
        {
          state: "ready",
          message: "Python 运行时已就绪",
          progress: 100,
          isDownloading: false,
        },
        options.trigger,
      );
      return {
        binaryPath: installedMeta.binaryPath,
        version: installedMeta.installedVersion,
      };
    }

    if (!needsInstall && !hasNewerVersion && options.forceCheck) {
      if (!installedMeta) {
        throw new Error("installedMeta 不应为 null");
      }
      this.updateStatus(
        {
          state: "ready",
          message: "Python 运行时已是最新版本",
          progress: 100,
          isDownloading: false,
        },
        options.trigger,
      );
      return {
        binaryPath: installedMeta.binaryPath,
        version: installedMeta.installedVersion,
      };
    }

    const targetBinaryPath = this.getRuntimeBinaryPath(latestJson.version);
    const alreadyDownloaded = await fs.pathExists(targetBinaryPath);

    try {
      if (!alreadyDownloaded) {
        this.updateStatus(
          {
            state: "downloading",
            message: "正在下载 Python 运行时...",
            progress: 0,
            isDownloading: true,
          },
          options.trigger,
        );

        await this.downloadBinary(asset.url, targetBinaryPath, (progress) => {
          this.updateStatus(
            {
              state: "downloading",
              message: `正在下载 Python 运行时... ${progress}%`,
              progress,
              isDownloading: true,
            },
            options.trigger,
          );
        });

        await this.markExecutable(targetBinaryPath);
      }

      if (needsInstall) {
        const meta: PythonRuntimeMeta = {
          installedVersion: latestJson.version,
          binaryPath: targetBinaryPath,
          updatedAt: Date.now(),
        };
        await this.writeInstalledMeta(meta);
        this.updateStatus(
          {
            state: "ready",
            message: "Python 运行时下载完成并已就绪",
            progress: 100,
            isDownloading: false,
            installedVersion: latestJson.version,
          },
          options.trigger,
        );
        return {
          binaryPath: targetBinaryPath,
          version: latestJson.version,
        };
      }

      const pendingMeta: PythonRuntimeMeta = {
        installedVersion: latestJson.version,
        binaryPath: targetBinaryPath,
        updatedAt: Date.now(),
      };
      await this.writePendingMeta(pendingMeta);

      if (!installedMeta) {
        throw new Error("installedMeta 不应为 null");
      }

      this.updateStatus(
        {
          state: "ready",
          message: `已下载 Python 运行时 ${latestJson.version}，重启应用后生效`,
          progress: 100,
          isDownloading: false,
        },
        options.trigger,
      );

      return {
        binaryPath: installedMeta.binaryPath,
        version: installedMeta.installedVersion,
      };
    } catch (error) {
      if (installedMeta && installedBinaryExists) {
        this.updateStatus(
          {
            state: "degraded",
            message: "Python 运行时更新失败，继续使用本地版本",
            progress: 100,
            isDownloading: false,
          },
          options.trigger,
        );
        return {
          binaryPath: installedMeta.binaryPath,
          version: installedMeta.installedVersion,
        };
      }

      const runtimeError = isPythonRuntimeError(error)
        ? error
        : new PythonRuntimeError(
            "PY_RUNTIME_DOWNLOAD_FAILED",
            `Python 运行时下载失败: ${toError(error).message}`,
          );

      this.updateStatus(
        {
          state: "error",
          message: runtimeError.message,
          progress: 0,
          isDownloading: false,
        },
        options.trigger,
      );
      throw runtimeError;
    }
  }

  private updateStatus(
    patch: Partial<PythonRuntimeStatus>,
    trigger: "foreground" | "background",
  ) {
    this.status = {
      ...this.status,
      ...patch,
    };
    this.emitProgress(trigger);
  }

  private emitProgress(trigger: "foreground" | "background") {
    const payload: PythonRuntimeProgress = {
      ...this.status,
      trigger,
    };

    BrowserWindow.getAllWindows().forEach((window) => {
      if (!window.isDestroyed()) {
        window.webContents.send("python-runtime-progress", payload);
      }
    });
  }

  private async ensureBootstrapped() {
    if (this.bootstrapped) {
      return;
    }
    this.bootstrapped = true;

    await fs.ensureDir(this.getRuntimeDir());
    await this.applyPendingMetaIfNeeded();

    const meta = await this.loadInstalledMeta();
    this.status = {
      ...this.status,
      installedVersion: meta?.installedVersion || null,
      state: meta ? "ready" : "idle",
      message: meta ? "Python 运行时已安装" : "Python 运行时未安装",
      progress: meta ? 100 : 0,
      isDownloading: false,
    };
  }

  private async applyPendingMetaIfNeeded() {
    const pendingMeta = await this.loadPendingMeta();
    if (!pendingMeta) {
      return;
    }

    const pendingExists = await fs.pathExists(pendingMeta.binaryPath);
    if (!pendingExists) {
      await fs.remove(this.getPendingMetaPath()).catch((error) => {
        console.warn(
          "[PythonRuntimeManager] 删除 pending meta 文件失败:",
          error,
        );
      });
      return;
    }

    await this.writeInstalledMeta({
      ...pendingMeta,
      updatedAt: Date.now(),
    });
    await fs.remove(this.getPendingMetaPath()).catch((error) => {
      console.warn("[PythonRuntimeManager] 删除 pending meta 文件失败:", error);
    });
  }

  private async loadInstalledMeta(): Promise<PythonRuntimeMeta | null> {
    const metaPath = this.getMetaPath();
    if (!(await fs.pathExists(metaPath))) {
      return null;
    }

    try {
      const meta = await fs.readJSON(metaPath);
      if (
        typeof meta.installedVersion !== "string" ||
        typeof meta.binaryPath !== "string"
      ) {
        return null;
      }

      return {
        installedVersion: meta.installedVersion,
        binaryPath: meta.binaryPath,
        updatedAt:
          typeof meta.updatedAt === "number" ? meta.updatedAt : Date.now(),
      };
    } catch {
      return null;
    }
  }

  private async loadPendingMeta(): Promise<PythonRuntimeMeta | null> {
    const pendingMetaPath = this.getPendingMetaPath();
    if (!(await fs.pathExists(pendingMetaPath))) {
      return null;
    }

    try {
      const meta = await fs.readJSON(pendingMetaPath);
      if (
        typeof meta.installedVersion !== "string" ||
        typeof meta.binaryPath !== "string"
      ) {
        return null;
      }

      return {
        installedVersion: meta.installedVersion,
        binaryPath: meta.binaryPath,
        updatedAt:
          typeof meta.updatedAt === "number" ? meta.updatedAt : Date.now(),
      };
    } catch {
      return null;
    }
  }

  private async writeInstalledMeta(meta: PythonRuntimeMeta) {
    await fs.writeJSON(this.getMetaPath(), meta, { spaces: 2 });
  }

  private async writePendingMeta(meta: PythonRuntimeMeta) {
    await fs.writeJSON(this.getPendingMetaPath(), meta, { spaces: 2 });
  }

  private async removeInstalledMeta() {
    await fs.remove(this.getMetaPath()).catch((error) => {
      console.warn(
        "[PythonRuntimeManager] 删除 installed meta 文件失败:",
        error,
      );
    });
  }

  private async fetchLatestJson(
    url: string,
    redirectCount = 0,
  ): Promise<PythonRuntimeLatestJson> {
    if (redirectCount > MAX_REDIRECTS) {
      throw new Error("获取 latest.json 重定向次数过多");
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
      throw new Error(`latest.json 请求失败，状态码 ${response.statusCode}`);
    }

    const body = response.body.toString("utf-8");
    const parsed = JSON.parse(body) as PythonRuntimeLatestJson;

    if (!parsed?.version || !parsed?.assets) {
      throw new Error("latest.json 格式无效");
    }

    normalizeSemver(parsed.version);
    return parsed;
  }

  private async downloadBinary(
    url: string,
    destPath: string,
    onProgress?: (progress: number) => void,
    redirectCount = 0,
  ): Promise<void> {
    if (redirectCount > MAX_REDIRECTS) {
      throw new Error("下载 python-server 重定向次数过多");
    }

    const tempPath = `${destPath}.tmp`;
    await fs.ensureDir(path.dirname(destPath));

    await new Promise<void>((resolve, reject) => {
      let settled = false;

      const fail = (error: Error) => {
        if (settled) {
          return;
        }
        settled = true;
        void fs
          .remove(tempPath)
          .catch((removeError) => {
            console.warn(
              "[PythonRuntimeManager] 删除临时文件失败:",
              removeError,
            );
          })
          .finally(() => {
            reject(error);
          });
      };

      const succeed = () => {
        if (settled) {
          return;
        }
        settled = true;
        resolve();
      };

      this.requestStream(url, (response, finalUrl) => {
        try {
          const statusCode = response.statusCode || 0;

          if (
            statusCode >= 300 &&
            statusCode < 400 &&
            response.headers.location
          ) {
            response.resume();
            const redirectUrl = new URL(
              response.headers.location,
              finalUrl,
            ).toString();
            void this.downloadBinary(
              redirectUrl,
              destPath,
              onProgress,
              redirectCount + 1,
            )
              .then(succeed)
              .catch((error) => {
                fail(toError(error));
              });
            return;
          }

          if (statusCode >= 400) {
            response.resume();
            fail(new Error(`下载 python-server 失败，状态码 ${statusCode}`));
            return;
          }

          const total = Number(response.headers["content-length"] || 0);
          let downloaded = 0;
          const writeStream = fs.createWriteStream(tempPath);

          response.on("data", (chunk: Buffer) => {
            downloaded += chunk.length;
            if (onProgress && total > 0) {
              const percentage = Math.min(
                99,
                Math.max(0, Math.round((downloaded / total) * 100)),
              );
              onProgress(percentage);
            }
          });

          response.on("error", (error) => {
            fail(toError(error));
          });

          writeStream.on("error", (error) => {
            fail(toError(error));
          });

          writeStream.on("finish", () => {
            void fs
              .move(tempPath, destPath, { overwrite: true })
              .then(() => {
                if (onProgress) {
                  onProgress(100);
                }
                succeed();
              })
              .catch((error) => {
                fail(toError(error));
              });
          });

          response.pipe(writeStream);
        } catch (error) {
          fail(toError(error));
        }
      }).catch((error) => {
        fail(toError(error));
      });
    });
  }

  private async markExecutable(binaryPath: string) {
    if (process.platform !== "win32") {
      await fs.chmod(binaryPath, 0o755);
    }
  }

  private async requestBuffer(url: string): Promise<HttpBufferedResponse> {
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
            "User-Agent": "Tau-PythonRuntimeManager",
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

  private async requestStream(
    url: string,
    onResponse: (response: IncomingMessage, finalUrl: string) => void,
  ): Promise<void> {
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
            "User-Agent": "Tau-PythonRuntimeManager",
            Accept: "application/octet-stream,*/*",
          },
          timeout: DOWNLOAD_TIMEOUT_MS,
        },
        (response) => {
          try {
            onResponse(response, url);
            resolve();
          } catch (error) {
            reject(toError(error));
          }
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

const pythonRuntimeManager = new PythonRuntimeManager();

export default pythonRuntimeManager;
