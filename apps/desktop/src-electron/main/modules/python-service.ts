/**
 * Python 服务模块
 *
 * 功能:
 * - 管理 Python 进程生命周期
 * - 提供 WebSocket 客户端访问
 * - 支持开发环境和生产环境
 */

import { app, ipcMain } from "electron";
import { spawn, ChildProcess } from "child_process";
import path from "path";
import { Module } from "../types/module";
import PythonWebSocketClient from "../utils/PythonWebSocketClient";
import pythonRuntimeManager from "./python-runtime-manager";

const WS_PORT = 24678;

class PythonService implements Module {
  name: string;
  private process: ChildProcess | null = null;
  private client: PythonWebSocketClient | null = null;
  private starting = false;
  private startPromise: Promise<void> | null = null;
  private initialized = false;
  private serverReadyListeners = new Set<() => void>();

  constructor() {
    this.name = "python-service";
  }

  async init() {
    if (this.initialized) {
      return;
    }
    this.initialized = true;

    pythonRuntimeManager.init();

    // 注册 IPC 处理器
    ipcMain.handle("python-service-status", () => {
      const runtimeStatus = pythonRuntimeManager.getStatus();

      return {
        running: this.isRunning(),
        serverReady: this.client?.isServerReady() ?? false,
        runtimeStatus: runtimeStatus.state,
        installedVersion: runtimeStatus.installedVersion,
        latestVersion: runtimeStatus.latestVersion,
        isDownloading: runtimeStatus.isDownloading,
      };
    });

    ipcMain.handle("python-service-restart", async () => {
      await this.restart();
      return { success: true };
    });

    // 注册应用退出处理器，确保 Python 进程被正确关闭
    app.on("before-quit", async () => {
      console.log("[PythonService] App is quitting, stopping Python server...");
      await this.stop();
    });

    // 处理窗口全部关闭的情况（macOS 除外）
    app.on("window-all-closed", () => {
      if (process.platform !== "darwin") {
        console.log(
          "[PythonService] All windows closed, stopping Python server...",
        );
        this.stop();
      }
    });

    if (app.isPackaged) {
      pythonRuntimeManager.checkForUpdateInBackground();
    }
  }

  /**
   * 获取 Python 可执行文件路径
   */
  private async getPythonServerPath(): Promise<string> {
    const isDev = !app.isPackaged;

    if (isDev) {
      return "uv";
    }

    const runtime = await pythonRuntimeManager.ensureReady({
      trigger: "foreground",
    });

    return runtime.binaryPath;
  }

  /**
   * 获取脚本目录（开发环境使用）
   */
  private getScriptsDir(): string {
    return path.join(__dirname, "..", "..", "src-python");
  }

  /**
   * 构建启动参数
   */
  private buildArgs(): string[] {
    const isDev = !app.isPackaged;

    if (isDev) {
      return [
        "run",
        "--directory",
        this.getScriptsDir(),
        "python",
        "main.py",
        "--port",
        String(WS_PORT),
      ];
    }

    return ["--port", String(WS_PORT)];
  }

  /**
   * 启动 Python 进程
   */
  async start(): Promise<void> {
    if (this.starting && this.startPromise) {
      return this.startPromise;
    }

    if (this.isRunning()) {
      console.log("[PythonService] Already running");
      return;
    }

    this.starting = true;

    this.startPromise = this.doStart();
    return this.startPromise;
  }

  /**
   * 实际执行启动逻辑
   */
  private async doStart(): Promise<void> {
    try {
      // 先创建 WebSocket 客户端并连接
      this.client = new PythonWebSocketClient(WS_PORT, {
        onServerReady: () => {
          console.log("[PythonService] Python server is ready");
          this.serverReadyListeners.forEach((listener) => {
            try {
              listener();
            } catch (error) {
              console.error(
                "[PythonService] serverReady listener failed:",
                error,
              );
            }
          });
        },
        onServerGone: () => {
          console.log("[PythonService] Python server is gone");
        },
        onError: (error) => {
          console.error("[PythonService] WebSocket error:", error);
        },
      });

      await this.client.connect();
      console.log("[PythonService] WebSocket client connected");

      // 启动 Python 进程
      const execPath = await this.getPythonServerPath();
      const args = this.buildArgs();
      const isDev = !app.isPackaged;

      console.log(
        "[PythonService] Starting Python process:",
        execPath,
        args.join(" "),
      );

      this.process = spawn(execPath, args, {
        windowsHide: true,
        ...(isDev ? { cwd: this.getScriptsDir() } : {}),
        env: {
          ...process.env,
          PYTHONIOENCODING: "utf-8",
          PYTHONUNBUFFERED: "1",
          // 设置 NO_PROXY 确保本地 WebSocket 连接不走代理
          NO_PROXY: "localhost,127.0.0.1,::1",
          no_proxy: "localhost,127.0.0.1,::1",
        },
      });

      this.process.stdout?.on("data", (data: Buffer) => {
        console.log("[PythonServer stdout]:", data.toString().trim());
      });

      this.process.stderr?.on("data", (data: Buffer) => {
        console.log("[PythonServer stderr]:", data.toString().trim());
      });

      this.process.on("close", (code) => {
        console.log(`[PythonService] Process exited with code ${code}`);
        this.process = null;
      });

      this.process.on("error", (error) => {
        console.error("[PythonService] Process error:", error);
        this.process = null;
      });

      // 等待服务器就绪
      console.log("[PythonService] Waiting for Python server to be ready...");
      await this.client.waitForServerReady(60000);
      console.log("[PythonService] Python server is ready");

      this.starting = false;
    } catch (error) {
      this.starting = false;
      console.error("[PythonService] Failed to start:", error);
      await this.stop();
      throw error;
    }
  }

  /**
   * 停止 Python 进程
   */
  async stop(): Promise<void> {
    if (this.client) {
      this.client.close();
      this.client = null;
    }

    const proc = this.process;
    if (proc) {
      console.log("[PythonService] Stopping Python process...");

      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          console.log("[PythonService] Force killing process...");
          proc.kill("SIGKILL");
          this.process = null;
          resolve();
        }, 5000);

        proc.once("close", () => {
          clearTimeout(timeout);
          this.process = null;
          console.log("[PythonService] Process stopped");
          resolve();
        });

        proc.kill("SIGTERM");
      });
    }
  }

  /**
   * 重启 Python 进程
   */
  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  /**
   * 检查进程是否运行中
   */
  isRunning(): boolean {
    return this.process !== null && !this.process.killed;
  }

  /**
   * 获取 WebSocket 客户端
   */
  getClient(): PythonWebSocketClient | null {
    return this.client;
  }

  /**
   * 确保服务已启动并返回客户端
   */
  async ensureStarted(): Promise<PythonWebSocketClient> {
    if (!this.isRunning() || !this.client) {
      await this.start();
    }

    if (!this.client) {
      throw new Error("Python service client is not available");
    }

    if (!this.client.isServerReady()) {
      await this.client.waitForServerReady();
    }

    return this.client;
  }

  onServerReady(listener: () => void): () => void {
    this.serverReadyListeners.add(listener);
    return () => {
      this.serverReadyListeners.delete(listener);
    };
  }
}

// 导出单例
const pythonService = new PythonService();
export default pythonService;
