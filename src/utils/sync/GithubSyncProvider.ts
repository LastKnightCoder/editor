import { ISyncProvider } from "@/types/sync";
import { uploadFileToGithub, downloadFileFromGithub } from "@/utils/github";

export interface IGithubConfig {
  token: string;
  repo: string;
  branch: string;
  path: string;
  user: {
    name: string;
    email: string;
  };
}

export class GithubSyncProvider implements ISyncProvider {
  private config: IGithubConfig;

  constructor(config: IGithubConfig) {
    this.config = config;
  }

  getProviderName(): string {
    return "Github";
  }

  async uploadFile(objectName: string, content: Uint8Array): Promise<boolean> {
    try {
      const filePath = `${this.config.path}/${objectName}`;

      // 将 Uint8Array 转换为 Base64
      const base64Content = btoa(
        String.fromCharCode.apply(null, Array.from(content)),
      );

      await uploadFileToGithub({
        token: this.config.token,
        owner: this.config.user.name,
        repo: this.config.repo,
        path: filePath,
        content: base64Content,
        message: `Update ${objectName}`,
        branch: this.config.branch,
      });

      return true;
    } catch (e) {
      console.error("Github 上传失败:", e);
      return false;
    }
  }

  async downloadFile(objectName: string): Promise<Uint8Array> {
    try {
      const filePath = `${this.config.path}/${objectName}`;

      const base64Content = await downloadFileFromGithub({
        token: this.config.token,
        owner: this.config.user.name,
        repo: this.config.repo,
        path: filePath,
        branch: this.config.branch,
      });

      // 将 Base64 转换回 Uint8Array
      const binaryString = atob(base64Content);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      return bytes;
    } catch (e) {
      console.error("Github 下载失败:", e);
      throw e;
    }
  }

  async fileExists(objectName: string): Promise<boolean> {
    try {
      await this.downloadFile(objectName);
      return true;
    } catch (e) {
      return false;
    }
  }

  async deleteFile(_objectName: string): Promise<boolean> {
    // Github 删除文件需要 SHA，暂不支持
    console.warn("Github 删除文件暂不支持");
    return false;
  }
}
