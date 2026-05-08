import { createClient, type WebDAVClient } from "webdav";
import type { ISyncProvider } from "./types.js";

export class WebDavSyncProvider implements ISyncProvider {
  private client: WebDAVClient;
  private pathPrefix: string;

  constructor(config: {
    url: string;
    username: string;
    password: string;
    pathPrefix?: string;
  }) {
    this.pathPrefix = (config.pathPrefix || "").replace(/\/+$/, "");
    this.client = createClient(config.url, {
      username: config.username,
      password: config.password,
    });
  }

  private getPath(objectName: string): string {
    return `${this.pathPrefix}/${objectName}`;
  }

  async uploadFile(objectName: string, content: Uint8Array): Promise<boolean> {
    await this.client.putFileContents(
      this.getPath(objectName),
      Buffer.from(content),
    );
    return true;
  }

  async downloadFile(objectName: string): Promise<Uint8Array> {
    const content = await this.client.getFileContents(this.getPath(objectName));
    if (content instanceof Buffer) {
      return new Uint8Array(content);
    }
    if (content instanceof ArrayBuffer) {
      return new Uint8Array(content);
    }
    return new Uint8Array(Buffer.from(content as string));
  }

  async fileExists(objectName: string): Promise<boolean> {
    try {
      return await this.client.exists(this.getPath(objectName));
    } catch {
      return false;
    }
  }

  getProviderName(): string {
    return "WebDAV";
  }
}
