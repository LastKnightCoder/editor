import { app, ipcMain, Menu } from "electron";
import path from "node:path";
import fs from "node:fs";
import log from "electron-log";

interface RecentProject {
  path: string;
  name: string;
  lastOpened: number;
}

class RecentProjectsModule {
  private recentProjectsFile: string;
  private maxRecentProjects = 3;
  private onProjectOpen?: (projectPath: string) => void;

  constructor() {
    this.recentProjectsFile = path.join(
      app.getPath("userData"),
      "recent-projects.json",
    );
  }

  // 设置项目打开回调
  setOnProjectOpen(callback: (projectPath: string) => void): void {
    this.onProjectOpen = callback;
  }

  // 获取最近项目列表
  getRecentProjects(): RecentProject[] {
    try {
      if (fs.existsSync(this.recentProjectsFile)) {
        const data = fs.readFileSync(this.recentProjectsFile, "utf-8");
        const projects = JSON.parse(data) as RecentProject[];
        return projects.slice(0, this.maxRecentProjects);
      }
    } catch (error) {
      log.error("读取最近项目列表失败:", error);
    }
    return [];
  }

  // 添加项目到最近列表
  addRecentProject(projectPath: string): void {
    try {
      // 验证路径是否存在
      if (!fs.existsSync(projectPath)) {
        log.warn(`项目路径不存在: ${projectPath}`);
        return;
      }

      const projectName = path.basename(projectPath);
      const projects = this.getRecentProjects();

      // 检查是否已存在，如果存在则移除旧的
      const existingIndex = projects.findIndex((p) => p.path === projectPath);
      if (existingIndex !== -1) {
        projects.splice(existingIndex, 1);
      }

      // 添加到列表开头
      projects.unshift({
        path: projectPath,
        name: projectName,
        lastOpened: Date.now(),
      });

      // 只保留最近的 N 个
      const trimmedProjects = projects.slice(0, this.maxRecentProjects);

      // 保存到文件
      fs.writeFileSync(
        this.recentProjectsFile,
        JSON.stringify(trimmedProjects, null, 2),
        "utf-8",
      );

      log.info(`已添加最近项目: ${projectPath}`);

      // 更新任务栏/Dock菜单
      this.updateJumpList();
    } catch (error) {
      log.error("添加最近项目失败:", error);
    }
  }

  // 更新任务栏跳转列表（Windows）或 Dock 菜单（macOS）
  updateJumpList(): void {
    const projects = this.getRecentProjects();

    if (process.platform === "win32") {
      // Windows: 使用 Jump List
      app.setUserTasks(
        projects.map((project) => ({
          program: process.execPath,
          arguments: `"${project.path}"`,
          iconPath: process.execPath,
          iconIndex: 0,
          title: project.name,
          description: `打开项目: ${project.path}`,
        })),
      );
      log.info("已更新 Windows Jump List");
    } else if (process.platform === "darwin") {
      // macOS: 使用 Dock 菜单
      if (app.dock) {
        const dockMenu = Menu.buildFromTemplate(
          projects.map((project) => ({
            label: project.name,
            click: () => {
              if (this.onProjectOpen) {
                this.onProjectOpen(project.path);
              }
            },
          })),
        );
        app.dock.setMenu(dockMenu);
        log.info("已更新 macOS Dock 菜单");
      }
    }
  }

  // 清空最近项目列表
  clearRecentProjects(): void {
    try {
      if (fs.existsSync(this.recentProjectsFile)) {
        fs.unlinkSync(this.recentProjectsFile);
        log.info("已清空最近项目列表");
      }
    } catch (error) {
      log.error("清空最近项目列表失败:", error);
    }
  }

  // 注册 IPC 监听器
  registerListeners(): void {
    ipcMain.handle("get-recent-projects", () => {
      return this.getRecentProjects();
    });

    ipcMain.handle("add-recent-project", (_event, projectPath: string) => {
      this.addRecentProject(projectPath);
    });

    ipcMain.handle("clear-recent-projects", () => {
      this.clearRecentProjects();
    });
  }
}

const recentProjectsModule = new RecentProjectsModule();

export default recentProjectsModule;
