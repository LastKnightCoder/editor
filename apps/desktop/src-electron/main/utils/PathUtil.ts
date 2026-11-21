import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";

const APP_DIR = ".editor";

class PathUtil {
  static getHomeDir(): string {
    return process.env.HOME || homedir();
  }

  static getAppDir() {
    return join(this.getHomeDir(), APP_DIR);
  }

  static getFilePath(filePath: string) {
    try {
      const decoded = decodeURIComponent(filePath);
      if (existsSync(decoded)) return decoded;
    } catch {
      // 已保存的旧预览地址可能直接含有文件名中的百分号。
    }
    return filePath;
  }
}

export default PathUtil;
