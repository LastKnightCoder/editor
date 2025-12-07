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
    const decodedFilePath = decodeURI(filePath);
    return existsSync(filePath) ? filePath : decodedFilePath;
  }
}

export default PathUtil;
