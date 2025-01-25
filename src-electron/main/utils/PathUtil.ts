import { homedir } from 'node:os';
import { join } from 'node:path';

const APP_DIR = '.editor';

class PathUtil {
  static getHomeDir(): string {
    return process.env.HOME || homedir();
  }

  static getAppDir() {
    return join(this.getHomeDir(), APP_DIR);
  }
}

export default PathUtil;