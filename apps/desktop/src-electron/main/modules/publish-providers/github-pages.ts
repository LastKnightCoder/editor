import { IPublishProvider, IGithubPagesConfig } from "./types";
import log from "electron-log";

/**
 * GitHub Pages 发布提供者
 * 使用 GitHub API 直接操作仓库文件
 */
export class GithubPagesProvider implements IPublishProvider {
  readonly name = "GitHub Pages";
  private config: IGithubPagesConfig;
  private baseUrl = "https://api.github.com";

  constructor(config: IGithubPagesConfig) {
    this.config = config;
  }

  private get headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.config.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    };
  }

  private getOwnerRepo(): [string, string] {
    const parts = this.config.repo.split("/");
    return [parts[0], parts[1]];
  }

  /**
   * 获取文件的 SHA（用于更新或删除）
   */
  private async getFileSha(path: string): Promise<string | null> {
    try {
      const [owner, repo] = this.getOwnerRepo();
      const url = `${this.baseUrl}/repos/${owner}/${repo}/contents/${path}?ref=${this.config.branch}`;

      const response = await fetch(url, {
        method: "GET",
        headers: this.headers,
      });

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        throw new Error(`Failed to get file SHA: ${response.statusText}`);
      }

      const data = await response.json();
      return data.sha;
    } catch (error) {
      log.error(`Failed to get file SHA for ${path}:`, error);
      return null;
    }
  }

  /**
   * 确保分支存在
   */
  private async ensureBranch(): Promise<void> {
    const [owner, repo] = this.getOwnerRepo();
    const url = `${this.baseUrl}/repos/${owner}/${repo}/git/ref/heads/${this.config.branch}`;

    const response = await fetch(url, {
      method: "GET",
      headers: this.headers,
    });

    if (response.status === 404) {
      // 分支不存在，需要创建
      await this.createBranch();
    } else if (!response.ok) {
      throw new Error(`Failed to check branch: ${response.statusText}`);
    }
  }

  /**
   * 创建分支（基于默认分支）
   */
  private async createBranch(): Promise<void> {
    const [owner, repo] = this.getOwnerRepo();

    // 获取默认分支的 SHA
    const repoUrl = `${this.baseUrl}/repos/${owner}/${repo}`;
    const repoResponse = await fetch(repoUrl, {
      method: "GET",
      headers: this.headers,
    });

    if (!repoResponse.ok) {
      throw new Error(`Failed to get repo info: ${repoResponse.statusText}`);
    }

    const repoData = await repoResponse.json();
    const defaultBranch = repoData.default_branch;

    // 获取默认分支的最新 commit SHA
    const refUrl = `${this.baseUrl}/repos/${owner}/${repo}/git/ref/heads/${defaultBranch}`;
    const refResponse = await fetch(refUrl, {
      method: "GET",
      headers: this.headers,
    });

    if (!refResponse.ok) {
      throw new Error(
        `Failed to get default branch ref: ${refResponse.statusText}`,
      );
    }

    const refData = await refResponse.json();
    const sha = refData.object.sha;

    // 创建新分支
    const createRefUrl = `${this.baseUrl}/repos/${owner}/${repo}/git/refs`;
    const createResponse = await fetch(createRefUrl, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        ref: `refs/heads/${this.config.branch}`,
        sha,
      }),
    });

    if (!createResponse.ok) {
      throw new Error(`Failed to create branch: ${createResponse.statusText}`);
    }

    log.info(`Created branch ${this.config.branch}`);
  }

  async uploadFile(path: string, content: Buffer): Promise<void> {
    await this.ensureBranch();

    const [owner, repo] = this.getOwnerRepo();
    const url = `${this.baseUrl}/repos/${owner}/${repo}/contents/${path}`;

    // 检查文件是否已存在
    const sha = await this.getFileSha(path);

    const body: Record<string, string> = {
      message: `Update ${path}`,
      content: content.toString("base64"),
      branch: this.config.branch,
    };

    if (sha) {
      body.sha = sha;
    }

    if (this.config.committerName && this.config.committerEmail) {
      (body as Record<string, unknown>).committer = {
        name: this.config.committerName,
        email: this.config.committerEmail,
      };
    }

    const response = await fetch(url, {
      method: "PUT",
      headers: this.headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to upload file ${path}: ${error}`);
    }

    log.info(`Uploaded ${path} to GitHub Pages`);
  }

  async deleteFile(path: string): Promise<void> {
    const [owner, repo] = this.getOwnerRepo();
    const url = `${this.baseUrl}/repos/${owner}/${repo}/contents/${path}`;

    const sha = await this.getFileSha(path);
    if (!sha) {
      log.warn(`File ${path} does not exist, skipping delete`);
      return;
    }

    const body: Record<string, string> = {
      message: `Delete ${path}`,
      sha,
      branch: this.config.branch,
    };

    if (this.config.committerName && this.config.committerEmail) {
      (body as Record<string, unknown>).committer = {
        name: this.config.committerName,
        email: this.config.committerEmail,
      };
    }

    const response = await fetch(url, {
      method: "DELETE",
      headers: this.headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to delete file ${path}: ${error}`);
    }

    log.info(`Deleted ${path} from GitHub Pages`);
  }

  async listFiles(prefix = ""): Promise<string[]> {
    const [owner, repo] = this.getOwnerRepo();
    const files: string[] = [];

    const listRecursive = async (path: string) => {
      const url = `${this.baseUrl}/repos/${owner}/${repo}/contents/${path}?ref=${this.config.branch}`;

      const response = await fetch(url, {
        method: "GET",
        headers: this.headers,
      });

      if (response.status === 404) {
        return;
      }

      if (!response.ok) {
        throw new Error(`Failed to list files: ${response.statusText}`);
      }

      const items = await response.json();

      if (!Array.isArray(items)) {
        // 单个文件
        if (items.type === "file") {
          files.push(items.path);
        }
        return;
      }

      for (const item of items) {
        if (item.type === "file") {
          files.push(item.path);
        } else if (item.type === "dir") {
          await listRecursive(item.path);
        }
      }
    };

    await listRecursive(prefix);
    return files;
  }

  async checkConnection(): Promise<boolean> {
    try {
      const [owner, repo] = this.getOwnerRepo();
      const url = `${this.baseUrl}/repos/${owner}/${repo}`;

      const response = await fetch(url, {
        method: "GET",
        headers: this.headers,
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * 计算 basePath
   */
  static computeBasePath(repo: string): string {
    const parts = repo.split("/");
    if (parts.length !== 2) {
      return "/";
    }

    const [owner, repoName] = parts;
    const ownerLower = owner.toLowerCase();
    const repoLower = repoName.toLowerCase();
    // 如果是 username.github.io 仓库，basePath 为 /
    if (repoLower === `${ownerLower}.github.io`) {
      return "/";
    }

    return `/${repoName}/`;
  }
}
