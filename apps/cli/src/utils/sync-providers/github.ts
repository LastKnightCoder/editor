import type { ISyncProvider } from "./types.js";

export class GithubSyncProvider implements ISyncProvider {
  private token: string;
  private repo: string;
  private branch: string;
  private pathPrefix: string;
  private owner: string;

  constructor(config: {
    token: string;
    repo: string;
    branch: string;
    path?: string;
    user: { name: string };
  }) {
    this.token = config.token;
    this.repo = config.repo;
    this.branch = config.branch;
    this.pathPrefix = (config.path || "").replace(/^\/+|\/+$/g, "");
    this.owner = config.user.name;
  }

  private getPath(objectName: string): string {
    return this.pathPrefix ? `${this.pathPrefix}/${objectName}` : objectName;
  }

  private get headers(): HeadersInit {
    return {
      Authorization: `token ${this.token}`,
      Accept: "application/vnd.github.v3+json",
    };
  }

  private async getFileSha(path: string): Promise<string | null> {
    const url = `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${path}?ref=${this.branch}`;
    const res = await fetch(url, { headers: this.headers });
    if (!res.ok) return null;
    const data = await res.json();
    return data.sha || null;
  }

  async uploadFile(objectName: string, content: Uint8Array): Promise<boolean> {
    const path = this.getPath(objectName);
    const sha = await this.getFileSha(path);
    const base64Content = Buffer.from(content).toString("base64");

    const url = `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${path}`;
    const body: Record<string, unknown> = {
      message: `sync: update ${objectName}`,
      content: base64Content,
      branch: this.branch,
    };
    if (sha) body.sha = sha;

    const res = await fetch(url, {
      method: "PUT",
      headers: { ...this.headers, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.ok;
  }

  async downloadFile(objectName: string): Promise<Uint8Array> {
    const path = this.getPath(objectName);
    const url = `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${path}?ref=${this.branch}`;
    const res = await fetch(url, { headers: this.headers });
    if (!res.ok)
      throw new Error(`Failed to download ${objectName}: ${res.status}`);
    const data = await res.json();
    return Uint8Array.from(Buffer.from(data.content, "base64"));
  }

  async fileExists(objectName: string): Promise<boolean> {
    const path = this.getPath(objectName);
    const url = `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${path}?ref=${this.branch}`;
    const res = await fetch(url, { headers: this.headers });
    return res.ok;
  }

  getProviderName(): string {
    return "GitHub";
  }
}
