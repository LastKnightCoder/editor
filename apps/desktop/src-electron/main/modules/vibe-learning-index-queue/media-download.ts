import { promises as fs } from "fs";
import { join } from "node:path";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import crypto from "node:crypto";
import fetch from "node-fetch";
import PathUtil from "../../utils/PathUtil";
import { isRemoteUrl, getExtFromUrl } from "./utils";

export async function buildSourceStableId(
  originalPath: string,
  localFilePath: string
): Promise<string> {
  if (isRemoteUrl(originalPath)) {
    return `remote:${originalPath}`;
  }

  try {
    const realPath = await fs.realpath(localFilePath);
    return `local:${realPath}`;
  } catch {
    return `local:${localFilePath}`;
  }
}

export async function downloadRemoteFile(url: string): Promise<string> {
  const hash = crypto.createHash("md5").update(url).digest("hex").slice(0, 8);
  const ext = getExtFromUrl(url) || ".tmp";
  const tempDir = join(PathUtil.getAppDir(), "vibe-learning-temp");
  const tempPath = join(tempDir, `${hash}-${Date.now()}${ext}`);

  // 确保目录存在
  await fs.mkdir(tempDir, { recursive: true });

  // 下载文件
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  });

  if (!response.ok) {
    throw new Error(`Download failed: HTTP ${response.status}`);
  }

  if (!response.body) {
    throw new Error("Download failed: No response body");
  }

  // 写入文件
  const fileStream = createWriteStream(tempPath);
  await pipeline(response.body, fileStream);

  return tempPath;
}
