import { app } from "electron";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

interface Preferences {
  keepBackground: boolean;
  startHidden: boolean;
}
let preferences: Preferences = { keepBackground: false, startHidden: false };
let loaded: Promise<void> | undefined;
let pending: Promise<unknown> = Promise.resolve();
let trayAvailable = false;
let activity = () => false;
export const setBackgroundActivityProbe = (probe: () => boolean) => {
  activity = probe;
};
export const setBackgroundTrayAvailable = (available: boolean) => {
  trayAvailable = available;
};
export const shouldKeepBackgroundAlive = () =>
  preferences.keepBackground && trayAvailable && activity();
const filename = () => path.join(app.getPath("userData"), "background-preferences.json");
const autostartFile = () =>
  path.join(
    process.env.XDG_CONFIG_HOME || path.join(app.getPath("home"), ".config"),
    "autostart/tau-background.desktop"
  );

export function loadBackgroundPreferences() {
  return (loaded ??= readFile(filename(), "utf8")
    .then(raw => {
      const value = JSON.parse(raw);
      if (
        value.version !== 1 ||
        typeof value.keepBackground !== "boolean" ||
        typeof value.startHidden !== "boolean"
      )
        throw new Error("后台运行设置无效");
      preferences = { keepBackground: value.keepBackground, startHidden: value.startHidden };
    })
    .catch(error => {
      if (error.code !== "ENOENT") {
        loaded = undefined;
        throw error;
      }
    }));
}

async function loginState() {
  if (process.platform === "linux") {
    const value = await readFile(autostartFile(), "utf8").catch(error => {
      if (error.code === "ENOENT") return "";
      throw error;
    });
    return {
      openAtLogin: value.includes("X-Tau-Background=true") && !/^Hidden=true$/m.test(value),
      loginStatus: null,
    };
  }
  const state = app.getLoginItemSettings(
    process.platform === "win32" ? { args: ["--tau-login"] } : undefined
  );
  return {
    openAtLogin:
      state.openAtLogin &&
      (process.platform !== "win32" || state.executableWillLaunchAtLogin !== false),
    loginStatus: state.status ?? null,
  };
}

export async function backgroundPreferencesSnapshot() {
  await loadBackgroundPreferences();
  return { ...preferences, ...(await loginState()), trayAvailable };
}

export async function shouldStartInBackground() {
  await loadBackgroundPreferences();
  const login =
    process.argv.includes("--tau-login") ||
    (process.platform === "darwin" && app.getLoginItemSettings().wasOpenedAtLogin);
  return preferences.startHidden && login;
}

export function updateBackgroundPreferences(
  patch: Partial<Preferences> & { openAtLogin?: boolean }
) {
  const operation = pending.then(async () => {
    if (
      !patch ||
      typeof patch !== "object" ||
      Array.isArray(patch) ||
      Object.entries(patch).some(
        ([key, value]) =>
          !["keepBackground", "startHidden", "openAtLogin"].includes(key) ||
          typeof value !== "boolean"
      )
    )
      throw new Error("后台运行设置无效");
    await loadBackgroundPreferences();
    if (patch.openAtLogin !== undefined) {
      if (!app.isPackaged) throw new Error("请在已安装的正式应用中设置登录启动");
      if (process.platform === "linux") {
        if (!patch.openAtLogin) await rm(autostartFile(), { force: true });
        else {
          const executable = process.env.APPIMAGE || app.getPath("exe");
          if (/[\r\n]/.test(executable)) throw new Error("启动路径无效");
          const quoted = executable.replace(/%/g, "%%").replace(/[\\"`$]/g, value => "\\" + value);
          await mkdir(path.dirname(autostartFile()), { recursive: true });
          await writeFile(
            autostartFile(),
            `[Desktop Entry]\nType=Application\nName=Tau\nExec="${quoted}" --tau-login\nX-Tau-Background=true\n`,
            { mode: 0o600 }
          );
        }
      } else
        app.setLoginItemSettings({
          openAtLogin: patch.openAtLogin,
          ...(process.platform === "win32" ? { args: ["--tau-login"] } : {}),
        });
    }
    const next = {
      keepBackground: patch.keepBackground ?? preferences.keepBackground,
      startHidden: patch.startHidden ?? preferences.startHidden,
    };
    const temporary = filename() + "." + randomUUID() + ".tmp";
    await mkdir(path.dirname(filename()), { recursive: true });
    try {
      await writeFile(temporary, JSON.stringify({ version: 1, ...next }), {
        flag: "wx",
        mode: 0o600,
      });
      await rename(temporary, filename());
      preferences = next;
    } finally {
      await rm(temporary, { force: true });
    }
    return backgroundPreferencesSnapshot();
  });
  pending = operation.catch(() => undefined);
  return operation;
}
