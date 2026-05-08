import { spawn } from "node:child_process";
import { join } from "node:path";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import WebSocket from "ws";
import { getAppDir } from "../utils/path.js";
import { readSettings } from "../utils/settings.js";
import { RpcMessageType, isRpcResponseMessage } from "../utils/rpc-protocol.js";

const STARTUP_TIMEOUT = 30000;
const REQUEST_TIMEOUT = 60000;
const CONNECT_TIMEOUT = 3000;

let wsClient: WebSocket | null = null;

export interface EmbeddingConfig {
  modelDir: string;
  modelName: string;
  batchSize: number;
  devicePolicy: string;
  dimensions: number;
  distance: number;
}

export function getEmbeddingConfig(): EmbeddingConfig | null {
  try {
    const settings = readSettings();
    const ep = (settings as any).embeddingProvider;
    if (!ep) return null;

    const configId = ep.currentConfigId;
    const configs = ep.configs as any[] | undefined;
    if (!configs || configs.length === 0) return null;

    const config = configId
      ? configs.find((c: any) => c.id === configId)
      : configs[0];
    if (!config) return null;

    const modelName = config.currentModel || "bge-m3";
    const models = config.models as any[] | undefined;
    const modelInfo = models?.find((m: any) => m.name === modelName);

    const localModelDir =
      config.localModelDir || join(getAppDir(), "embedding-models");

    return {
      modelDir: localModelDir,
      modelName,
      batchSize: config.batchSize || 8,
      devicePolicy: config.devicePolicy || "auto",
      dimensions: modelInfo?.contextLength || 1024,
      distance: modelInfo?.distance || 0.6,
    };
  } catch {
    return null;
  }
}

function getUserDataDir(): string {
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support", "tau");
  }
  if (process.platform === "win32") {
    return join(
      process.env.APPDATA || join(homedir(), "AppData", "Roaming"),
      "tau",
    );
  }
  return join(homedir(), ".config", "tau");
}

function getDaemonInfoPath(): string {
  return join(getAppDir(), "python-daemon.json");
}

interface DaemonInfo {
  pid: number;
  port: number;
  startedAt: number;
}

function readDaemonInfo(): DaemonInfo | null {
  const infoPath = getDaemonInfoPath();
  if (!existsSync(infoPath)) return null;
  try {
    return JSON.parse(readFileSync(infoPath, "utf-8"));
  } catch {
    return null;
  }
}

function writeDaemonInfo(info: DaemonInfo): void {
  writeFileSync(getDaemonInfoPath(), JSON.stringify(info), "utf-8");
}

function clearDaemonInfo(): void {
  try {
    unlinkSync(getDaemonInfoPath());
  } catch {
    // ignore
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function getInstalledBinary(): string | null {
  const runtimeDir = join(getUserDataDir(), "runtime", "python-server");
  const metaPath = join(runtimeDir, "meta.json");

  if (!existsSync(metaPath)) return null;

  try {
    const meta = JSON.parse(readFileSync(metaPath, "utf-8"));
    const binaryPath = meta.binaryPath;
    if (binaryPath && existsSync(binaryPath)) {
      return binaryPath;
    }
  } catch {
    // ignore
  }

  return null;
}

export function isPythonAvailable(): boolean {
  return getInstalledBinary() !== null;
}

function findAvailablePort(): number {
  return 24679 + Math.floor(Math.random() * 100);
}

async function tryConnectExisting(): Promise<WebSocket | null> {
  const info = readDaemonInfo();
  if (!info) return null;

  if (!isProcessAlive(info.pid)) {
    clearDaemonInfo();
    return null;
  }

  try {
    const ws = await connectWebSocket(info.port, CONNECT_TIMEOUT);
    return ws;
  } catch {
    clearDaemonInfo();
    return null;
  }
}

async function spawnDaemon(): Promise<number> {
  const binary = getInstalledBinary();
  if (!binary) {
    throw new Error(
      "Python embedding service unavailable: no pre-built binary found.\n" +
        "Run the desktop app once to download the Python runtime.",
    );
  }

  const port = findAvailablePort();

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Python daemon startup timeout"));
    }, STARTUP_TIMEOUT);

    const proc = spawn(binary, ["--standalone", "--port", String(port)], {
      stdio: ["ignore", "pipe", "ignore"],
      detached: true,
    });

    proc.stdout?.on("data", (data: Buffer) => {
      const text = data.toString();
      if (text.includes(`STANDALONE_READY:${port}`)) {
        clearTimeout(timeout);

        writeDaemonInfo({ pid: proc.pid!, port, startedAt: Date.now() });

        proc.unref();
        proc.stdout?.destroy();

        resolve(port);
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timeout);
      reject(new Error(`Failed to start Python daemon: ${err.message}`));
    });

    proc.on("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Python daemon exited with code ${code}`));
    });
  });
}

async function connectWebSocket(
  port: number,
  timeoutMs = 5000,
): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}`);

    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error("WebSocket connection timeout"));
    }, timeoutMs);

    ws.on("open", () => {
      clearTimeout(timeout);
      resolve(ws);
    });

    ws.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

async function ensureConnection(): Promise<WebSocket> {
  if (wsClient && wsClient.readyState === WebSocket.OPEN) {
    return wsClient;
  }

  // Try connecting to existing daemon
  const existing = await tryConnectExisting();
  if (existing) {
    wsClient = existing;
    return wsClient;
  }

  // Spawn new daemon
  const port = await spawnDaemon();
  wsClient = await connectWebSocket(port);
  return wsClient;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const config = getEmbeddingConfig();
  if (!config) {
    throw new Error("No embedding config found in settings");
  }

  const modelPath = join(config.modelDir, config.modelName);
  if (!existsSync(modelPath)) {
    throw new Error(`Embedding model not found: ${modelPath}`);
  }

  const ws = await ensureConnection();
  const id = randomUUID();

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("embed_texts request timeout"));
    }, REQUEST_TIMEOUT);

    const onMessage = (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());
        if (isRpcResponseMessage(msg) && msg.id === id) {
          clearTimeout(timeout);
          ws.off("message", onMessage);
          if (msg.error) {
            reject(new Error(msg.error.message || "embed_texts failed"));
          } else {
            const result = msg.result as any;
            resolve(result?.embeddings || []);
          }
        }
      } catch {
        // ignore
      }
    };

    ws.on("message", onMessage);

    ws.send(
      JSON.stringify({
        id,
        type: RpcMessageType.Request,
        method: "embed_texts",
        params: {
          texts,
          modelDir: config.modelDir,
          modelName: config.modelName,
          batchSize: config.batchSize,
          devicePolicy: config.devicePolicy,
        },
      }),
    );
  });
}

export function closePythonProcess(): void {
  if (wsClient) {
    wsClient.close();
    wsClient = null;
  }
}
