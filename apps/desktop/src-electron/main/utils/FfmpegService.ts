import { createWriteStream } from "node:fs";
import * as fs from "node:fs/promises";
import * as http from "node:http";
import * as https from "node:https";
import * as os from "node:os";
import * as path from "node:path";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import ffmpeg from "fluent-ffmpeg";
import { HttpsProxyAgent } from "https-proxy-agent";
import log from "electron-log";
import PathUtil from "./PathUtil";

const MAX_REDIRECTS = 5;
const REQUEST_TIMEOUT_MS = 60_000;
const FFMPEG_DEFAULT_LATEST_JSON_URL = "https://dl.taunote.app/ffmpeg-services-latest.json";

interface FfmpegAsset {
  url: string;
}

interface FfmpegLatestJson {
  version: string;
  assets?: Record<string, FfmpegAsset | Record<string, FfmpegAsset>>;
}

interface HttpBufferedResponse {
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
}

interface BinaryDescriptor {
  platform: NodeJS.Platform;
  arch: string;
  executableExtension: string;
}

interface FfmpegMeta {
  installedVersion: string;
  binaryPath: string;
  updatedAt: number;
}

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

const toError = (error: unknown): Error => {
  if (error instanceof Error) {
    return error;
  }
  return new Error(String(error));
};

export default class FfmpegService {
  private static binaryPath: string | null = null;
  private static inFlight: Promise<string> | null = null;
  private static configuredForFluent = false;

  static async ensureBinary(proxy?: string): Promise<string> {
    if (this.binaryPath) {
      return this.binaryPath;
    }

    if (this.inFlight) {
      return this.inFlight;
    }

    this.inFlight = this.prepareBinary(proxy).finally(() => {
      this.inFlight = null;
    });

    return this.inFlight;
  }

  static async ensureFluentFfmpegPath(proxy?: string): Promise<string> {
    const binaryPath = await this.ensureBinary(proxy);

    if (!this.configuredForFluent) {
      ffmpeg.setFfmpegPath(binaryPath);
      this.configuredForFluent = true;
      log.info(`[Ffmpeg] binary ready: ${binaryPath}`);
    }

    return binaryPath;
  }

  private static async prepareBinary(proxy?: string): Promise<string> {
    const descriptor = this.getBinaryDescriptor();
    const binDir = path.join(PathUtil.getAppDir(), "bin");
    const binaryPath = this.getBinaryPath(descriptor);
    const tempPath = `${binaryPath}.tmp`;
    const latestJsonUrl = FFMPEG_DEFAULT_LATEST_JSON_URL;

    await fs.mkdir(binDir, { recursive: true });

    const installedMeta = await this.loadInstalledMeta();
    const installedBinaryExists = installedMeta
      ? await this.pathExists(installedMeta.binaryPath)
      : false;

    let latestJson: FfmpegLatestJson;
    try {
      latestJson = await this.fetchLatestJson(latestJsonUrl, proxy);
    } catch (error) {
      if (installedMeta && installedBinaryExists) {
        this.binaryPath = installedMeta.binaryPath;
        await this.markExecutable(installedMeta.binaryPath);
        return installedMeta.binaryPath;
      }

      throw new Error(`获取 ffmpeg latest.json 失败: ${toError(error).message}`);
    }

    normalizeSemver(latestJson.version);

    const asset = this.resolveAssetByPlatformAndArch(latestJson, descriptor);
    if (!asset?.url) {
      throw new Error(
        `latest.json 缺少 ${descriptor.platform}/${descriptor.arch} 的 ffmpeg 下载地址`
      );
    }

    let hasInstalledVersion = !!installedMeta?.installedVersion && installedBinaryExists;

    if (hasInstalledVersion && installedMeta) {
      try {
        normalizeSemver(installedMeta.installedVersion);
      } catch {
        hasInstalledVersion = false;
      }
    }

    if (
      hasInstalledVersion &&
      installedMeta &&
      compareSemver(latestJson.version, installedMeta.installedVersion) <= 0
    ) {
      this.binaryPath = installedMeta.binaryPath;
      await this.markExecutable(installedMeta.binaryPath);
      return installedMeta.binaryPath;
    }

    log.info(`[Ffmpeg] downloading binary from ${asset.url}`);
    log.info(`[Ffmpeg] binary cache path: ${binaryPath}`);

    await fs.rm(tempPath, { force: true }).catch(() => {});

    try {
      await this.downloadBinary(asset.url, tempPath, 0, proxy);
      await fs.rename(tempPath, binaryPath);
      await this.markExecutable(binaryPath);
      await this.writeInstalledMeta({
        installedVersion: latestJson.version,
        binaryPath,
        updatedAt: Date.now(),
      });
    } catch (error) {
      await fs.rm(tempPath, { force: true }).catch(() => {});

      if (installedMeta && installedBinaryExists) {
        this.binaryPath = installedMeta.binaryPath;
        await this.markExecutable(installedMeta.binaryPath);
        return installedMeta.binaryPath;
      }

      throw new Error(`ffmpeg 下载失败: ${toError(error).message}`);
    }

    this.binaryPath = binaryPath;
    return binaryPath;
  }

  private static getBinaryDescriptor(): BinaryDescriptor {
    const platform = process.platform;
    const arch = os.arch();

    const supportedArchitectures: Partial<Record<NodeJS.Platform, string[]>> = {
      win32: ["x64", "ia32"],
      darwin: ["x64", "arm64"],
      linux: ["x64", "ia32", "arm64", "arm"],
    };

    const platformArchitectures = supportedArchitectures[platform] || [];
    if (!platformArchitectures.includes(arch)) {
      throw new Error(`Unsupported ffmpeg platform/arch: ${platform}/${arch}`);
    }

    const executableExtension = platform === "win32" ? ".exe" : "";
    return {
      platform,
      arch,
      executableExtension,
    };
  }

  private static getBinaryPath(descriptor: BinaryDescriptor): string {
    return path.join(PathUtil.getAppDir(), "bin", `ffmpeg${descriptor.executableExtension}`);
  }

  private static resolveAssetByPlatformAndArch(
    latestJson: FfmpegLatestJson,
    descriptor: BinaryDescriptor
  ): FfmpegAsset | null {
    const assets = latestJson.assets;
    if (!assets || typeof assets !== "object") {
      return null;
    }

    const platformAsset = assets[descriptor.platform];
    if (this.isFfmpegAsset(platformAsset)) {
      return platformAsset;
    }

    if (platformAsset && typeof platformAsset === "object") {
      const archAsset = platformAsset[descriptor.arch];
      if (this.isFfmpegAsset(archAsset)) {
        return archAsset;
      }
    }

    const flatKeyAsset = assets[`${descriptor.platform}-${descriptor.arch}`];
    if (this.isFfmpegAsset(flatKeyAsset)) {
      return flatKeyAsset;
    }

    return null;
  }

  private static isFfmpegAsset(value: unknown): value is FfmpegAsset {
    if (!value || typeof value !== "object") {
      return false;
    }

    const candidate = value as { url?: unknown };
    return typeof candidate.url === "string" && candidate.url.length > 0;
  }

  private static async pathExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private static getMetaPath(): string {
    return path.join(PathUtil.getAppDir(), "bin", "ffmpeg-meta.json");
  }

  private static async loadInstalledMeta(): Promise<FfmpegMeta | null> {
    const metaPath = this.getMetaPath();
    if (!(await this.pathExists(metaPath))) {
      return null;
    }

    try {
      const raw = await fs.readFile(metaPath, "utf-8");
      const parsed = JSON.parse(raw) as Partial<FfmpegMeta>;
      if (typeof parsed.installedVersion !== "string" || typeof parsed.binaryPath !== "string") {
        return null;
      }

      return {
        installedVersion: parsed.installedVersion,
        binaryPath: parsed.binaryPath,
        updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
      };
    } catch {
      return null;
    }
  }

  private static async writeInstalledMeta(meta: FfmpegMeta): Promise<void> {
    await fs.writeFile(this.getMetaPath(), JSON.stringify(meta, null, 2), "utf-8");
  }

  private static async fetchLatestJson(
    url: string,
    proxy?: string,
    redirectCount = 0
  ): Promise<FfmpegLatestJson> {
    if (redirectCount > MAX_REDIRECTS) {
      throw new Error("获取 ffmpeg latest.json 重定向次数过多");
    }

    const response = await this.requestBuffer(url, proxy);

    if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
      const redirectUrl = new URL(response.headers.location, url).toString();
      return this.fetchLatestJson(redirectUrl, proxy, redirectCount + 1);
    }

    if (response.statusCode >= 400) {
      throw new Error(`ffmpeg latest.json 请求失败，状态码 ${response.statusCode}`);
    }

    const rawBody = response.body.toString("utf-8");
    const parsed = JSON.parse(rawBody) as FfmpegLatestJson;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !parsed.assets ||
      typeof parsed.version !== "string"
    ) {
      throw new Error("ffmpeg latest.json 格式无效");
    }

    return parsed;
  }

  private static async requestBuffer(url: string, proxy?: string): Promise<HttpBufferedResponse> {
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
            "User-Agent": "Tau-FfmpegFetcher",
            Accept: "application/json,application/octet-stream,*/*",
          },
          timeout: REQUEST_TIMEOUT_MS,
          agent: urlObject.protocol === "https:" ? this.createProxyAgent(proxy) : undefined,
        },
        response => {
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
        }
      );

      request.on("timeout", () => {
        request.destroy(new Error("请求超时"));
      });
      request.on("error", reject);
      request.end();
    });
  }

  private static async markExecutable(filePath: string): Promise<void> {
    if (process.platform === "win32") {
      return;
    }
    await fs.chmod(filePath, 0o755).catch(() => {});
  }

  private static async downloadBinary(
    url: string,
    destPath: string,
    redirectCount: number,
    proxy?: string
  ): Promise<void> {
    if (redirectCount > MAX_REDIRECTS) {
      throw new Error("下载 ffmpeg 重定向次数过多");
    }

    await new Promise<void>((resolve, reject) => {
      const requestUrl = new URL(url);
      const requestImpl = requestUrl.protocol === "https:" ? https : http;
      const requestOptions: https.RequestOptions = {
        headers: {
          "User-Agent": "Tau-FfmpegFetcher",
          Accept: "application/octet-stream,*/*",
        },
        timeout: REQUEST_TIMEOUT_MS,
        agent: requestUrl.protocol === "https:" ? this.createProxyAgent(proxy) : undefined,
      };

      const request = requestImpl.get(url, requestOptions, response => {
        const statusCode = response.statusCode || 0;

        if (statusCode >= 300 && statusCode < 400 && response.headers.location) {
          response.resume();
          const redirectUrl = new URL(response.headers.location, url).toString();
          this.downloadBinary(redirectUrl, destPath, redirectCount + 1, proxy)
            .then(resolve)
            .catch(reject);
          return;
        }

        if (statusCode < 200 || statusCode >= 400) {
          response.resume();
          reject(new Error(`下载 ffmpeg 失败（${statusCode}）: ${url}`));
          return;
        }

        const writeStream = createWriteStream(destPath);
        const urlPath = new URL(url).pathname.toLowerCase();
        const streamPipeline = urlPath.endsWith(".gz")
          ? pipeline(response, createGunzip(), writeStream)
          : pipeline(response, writeStream);

        streamPipeline.then(resolve).catch(error => {
          reject(error instanceof Error ? error : new Error(String(error)));
        });
      });

      request.on("timeout", () => {
        request.destroy(new Error("请求超时"));
      });
      request.on("error", reject);
    });
  }

  private static createProxyAgent(proxy?: string) {
    if (!proxy) {
      return undefined;
    }

    try {
      return new HttpsProxyAgent(proxy);
    } catch (error) {
      log.warn(
        `[Ffmpeg] invalid proxy ${proxy}: ${error instanceof Error ? error.message : String(error)}`
      );
      return undefined;
    }
  }
}
