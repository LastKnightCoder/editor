import { createWriteStream } from "node:fs";
import * as fs from "node:fs/promises";
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
const FFMPEG_RELEASE_TAG = "b6.1.1";
const FFMPEG_RELEASE_BASE_URL =
  "https://github.com/eugeneware/ffmpeg-static/releases/download";

interface BinaryDescriptor {
  platform: NodeJS.Platform;
  arch: string;
  fileName: string;
  downloadFileName: string;
}

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
    const binaryPath = path.join(binDir, descriptor.fileName);
    const tempPath = `${binaryPath}.tmp`;

    await fs.mkdir(binDir, { recursive: true });

    try {
      await fs.access(binaryPath);
      await this.markExecutable(binaryPath);
      this.binaryPath = binaryPath;
      return binaryPath;
    } catch {
      // binary 不存在，继续下载
    }

    const downloadUrl = this.getDownloadUrl(descriptor);
    log.info(`[Ffmpeg] downloading binary from ${downloadUrl}`);

    await fs.rm(tempPath, { force: true }).catch(() => {});

    try {
      await this.downloadBinary(downloadUrl, tempPath, 0, proxy);
      await fs.rename(tempPath, binaryPath);
      await this.markExecutable(binaryPath);
    } catch (error) {
      await fs.rm(tempPath, { force: true }).catch(() => {});
      throw error;
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
      fileName: `ffmpeg-${FFMPEG_RELEASE_TAG}-${platform}-${arch}${executableExtension}`,
      downloadFileName: `ffmpeg-${platform}-${arch}.gz`,
    };
  }

  private static getDownloadUrl(descriptor: BinaryDescriptor): string {
    return `${FFMPEG_RELEASE_BASE_URL}/${FFMPEG_RELEASE_TAG}/${descriptor.downloadFileName}`;
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
    proxy?: string,
  ): Promise<void> {
    if (redirectCount > MAX_REDIRECTS) {
      throw new Error("Too many redirects while downloading ffmpeg binary");
    }

    await new Promise<void>((resolve, reject) => {
      const requestOptions: https.RequestOptions = {
        headers: {
          "User-Agent": "Tau-FfmpegFetcher",
          Accept: "application/octet-stream,*/*",
        },
        agent: this.createProxyAgent(proxy),
      };

      https
        .get(url, requestOptions, (response) => {
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
            this.downloadBinary(redirectUrl, destPath, redirectCount + 1, proxy)
              .then(resolve)
              .catch(reject);
            return;
          }

          if (statusCode < 200 || statusCode >= 400) {
            response.resume();
            reject(
              new Error(
                `Failed to download ffmpeg binary (${statusCode}) from ${url}`,
              ),
            );
            return;
          }

          const writeStream = createWriteStream(destPath);
          const urlPath = new URL(url).pathname.toLowerCase();
          const streamPipeline = urlPath.endsWith(".gz")
            ? pipeline(response, createGunzip(), writeStream)
            : pipeline(response, writeStream);

          streamPipeline.then(resolve).catch((error) => {
            reject(error instanceof Error ? error : new Error(String(error)));
          });
        })
        .on("error", reject);
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
        `[Ffmpeg] invalid proxy ${proxy}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return undefined;
    }
  }
}
