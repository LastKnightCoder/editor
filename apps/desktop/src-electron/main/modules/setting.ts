import { app } from "electron";
import fs from "node:fs/promises";
import fsExtra from "fs-extra/esm";
import { join } from "node:path";
import { existsSync, readlinkSync } from "node:fs";
import { execSync } from "node:child_process";
import { settingCommands } from "@tau/contracts";
import { cliCommands } from "@/commands/contracts/cli";
import PathUtil from "../utils/PathUtil";
import { Module } from "../types/module";
import log from "electron-log";

function getCliDir(): string {
  const resourcesDir = join(app.getAppPath(), "..");
  return join(resourcesDir, "cli");
}

class SettingModule implements Module {
  name: string;
  constructor() {
    this.name = "setting";
  }

  async init() {
    settingCommands.read.register(async () => {
      return this.readSetting();
    });
    settingCommands.write.register(async (_event, setting) => {
      return this.writeSetting(setting);
    });

    cliCommands.getStatus.register(async () => {
      return this.getCliStatus();
    });
    cliCommands.install.register(async () => {
      return this.installCli();
    });
    cliCommands.uninstall.register(async () => {
      return this.uninstallCli();
    });
  }

  getCliStatus(): { installed: boolean; path: string } {
    if (process.platform === "darwin") {
      const symlinkPath = "/usr/local/bin/tau";
      if (!existsSync(symlinkPath)) return { installed: false, path: symlinkPath };
      try {
        const target = readlinkSync(symlinkPath);
        const expected = join(getCliDir(), "tau.sh");
        return { installed: target === expected, path: symlinkPath };
      } catch {
        return { installed: false, path: symlinkPath };
      }
    }

    if (process.platform === "win32") {
      const cliDir = getCliDir();
      const userPath = this.getWindowsUserPath();
      const installed = userPath
        .split(";")
        .some(
          p => p.replace(/\\/g, "/").toLowerCase() === cliDir.replace(/\\/g, "/").toLowerCase()
        );
      return { installed, path: cliDir };
    }

    return { installed: false, path: "" };
  }

  async installCli(): Promise<{ success: boolean; error?: string }> {
    const cliDir = getCliDir();

    if (process.platform === "darwin") {
      const scriptPath = join(cliDir, "tau.sh");
      if (!existsSync(scriptPath)) {
        return { success: false, error: `CLI script not found: ${scriptPath}` };
      }
      try {
        await fs.chmod(scriptPath, 0o755);
        const symlinkPath = "/usr/local/bin/tau";
        const cmd = `mkdir -p /usr/local/bin && ln -sf "${scriptPath}" "${symlinkPath}"`;
        execSync(
          `osascript -e 'do shell script "${cmd.replace(/"/g, '\\"')}" with administrator privileges'`
        );
        return { success: true };
      } catch (e: any) {
        log.error("[cli:install] macOS install failed:", e.message);
        return { success: false, error: e.message };
      }
    }

    if (process.platform === "win32") {
      if (!existsSync(join(cliDir, "tau.cmd"))) {
        return { success: false, error: `CLI script not found in: ${cliDir}` };
      }
      try {
        const userPath = this.getWindowsUserPath();
        if (
          !userPath
            .split(";")
            .some(
              p => p.replace(/\\/g, "/").toLowerCase() === cliDir.replace(/\\/g, "/").toLowerCase()
            )
        ) {
          const newPath = userPath ? `${userPath};${cliDir}` : cliDir;
          execSync(`setx PATH "${newPath}"`, { encoding: "utf-8" });
        }
        return { success: true };
      } catch (e: any) {
        log.error("[cli:install] Windows install failed:", e.message);
        return { success: false, error: e.message };
      }
    }

    return { success: false, error: "Unsupported platform" };
  }

  async uninstallCli(): Promise<{ success: boolean; error?: string }> {
    if (process.platform === "darwin") {
      try {
        const symlinkPath = "/usr/local/bin/tau";
        const cmd = `rm -f "${symlinkPath}"`;
        execSync(
          `osascript -e 'do shell script "${cmd.replace(/"/g, '\\"')}" with administrator privileges'`
        );
        return { success: true };
      } catch (e: any) {
        return { success: false, error: e.message };
      }
    }

    if (process.platform === "win32") {
      try {
        const cliDir = getCliDir();
        const userPath = this.getWindowsUserPath();
        const parts = userPath
          .split(";")
          .filter(
            p => p.replace(/\\/g, "/").toLowerCase() !== cliDir.replace(/\\/g, "/").toLowerCase()
          );
        execSync(`setx PATH "${parts.join(";")}"`, { encoding: "utf-8" });
        return { success: true };
      } catch (e: any) {
        return { success: false, error: e.message };
      }
    }

    return { success: false, error: "Unsupported platform" };
  }

  private getWindowsUserPath(): string {
    try {
      const output = execSync('reg query "HKCU\\Environment" /v Path', {
        encoding: "utf-8",
      });
      const match = output.match(/Path\s+REG_(?:EXPAND_)?SZ\s+(.*)/i);
      return match ? match[1].trim() : "";
    } catch {
      return "";
    }
  }

  async readSetting() {
    const appDir = PathUtil.getAppDir();
    const settingPath = join(appDir, "setting.json");
    if (!(await fsExtra.pathExists(settingPath))) {
      await this.writeSetting("{}");
    }
    return await fs.readFile(settingPath, "utf-8");
  }

  writeSetting(setting: string) {
    const appDir = PathUtil.getAppDir();
    const settingPath = join(appDir, "setting.json");
    const tempPath = join(appDir, "setting.json.tmp");
    return fs
      .writeFile(tempPath, setting, "utf-8")
      .then(() => fsExtra.move(tempPath, settingPath, { overwrite: true }));
  }
}

export default new SettingModule();
