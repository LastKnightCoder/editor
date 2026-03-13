import { BrowserWindow, ipcMain } from "electron";
import fetch, { RequestInit } from "node-fetch";
import log from "electron-log";
import type {
  WeReadCookie,
  WeReadHttpRequestPayload,
  WeReadHttpResponse,
  WeReadLoginResult,
  Notebook,
} from "@/types/weread";
import type { DataTableView } from "@/types";
import databaseModule from "./database";
import WeReadNotebookTable from "./tables/weread-notebook";
import WeReadViewTable from "./tables/weread-view";
import WeReadConfigTable from "./tables/weread-config";
import {
  buildLoginResultFromCookies,
  getLoginResultFromSession,
} from "./weread-login";

const WEREAD_BASE_URL = "https://weread.qq.com";

const DEFAULT_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
  "Accept-Encoding": "gzip, deflate, br",
  "Content-Type": "application/json",
};

class WeReadModule {
  async init() {
    ipcMain.handle(
      "weread:http-request",
      async (_event, payload: WeReadHttpRequestPayload) => {
        return this.handleHttpRequest(payload);
      },
    );

    ipcMain.handle("weread:login-with-qr", async () => {
      return this.launchLoginWindow();
    });

    // Notebook operations
    ipcMain.handle(
      "weread:save-notebook",
      async (_event, notebook: Notebook) => {
        const db = databaseModule.getCurrentDatabase();
        if (!db) throw new Error("Database not initialized");
        WeReadNotebookTable.save(db, notebook);
      },
    );

    ipcMain.handle(
      "weread:save-notebooks",
      async (_event, notebooks: Notebook[]) => {
        const db = databaseModule.getCurrentDatabase();
        if (!db) throw new Error("Database not initialized");
        WeReadNotebookTable.saveMany(db, notebooks);
      },
    );

    ipcMain.handle("weread:get-all-notebooks", async () => {
      const db = databaseModule.getCurrentDatabase();
      if (!db) throw new Error("Database not initialized");
      return WeReadNotebookTable.getAll(db);
    });

    ipcMain.handle(
      "weread:get-notebook-by-id",
      async (_event, bookId: string) => {
        const db = databaseModule.getCurrentDatabase();
        if (!db) throw new Error("Database not initialized");
        return WeReadNotebookTable.getById(db, bookId);
      },
    );

    ipcMain.handle("weread:delete-notebook", async (_event, bookId: string) => {
      const db = databaseModule.getCurrentDatabase();
      if (!db) throw new Error("Database not initialized");
      WeReadNotebookTable.delete(db, bookId);
    });

    ipcMain.handle(
      "weread:update-notebook",
      async (_event, notebook: Notebook) => {
        const db = databaseModule.getCurrentDatabase();
        if (!db) throw new Error("Database not initialized");
        WeReadNotebookTable.save(db, notebook);
      },
    );

    ipcMain.handle("weread:get-last-sync-time", async () => {
      const db = databaseModule.getCurrentDatabase();
      if (!db) throw new Error("Database not initialized");
      return WeReadConfigTable.getNumber(db, "last_sync_time");
    });

    ipcMain.handle(
      "weread:update-sync-time",
      async (_event, timestamp: number) => {
        const db = databaseModule.getCurrentDatabase();
        if (!db) throw new Error("Database not initialized");
        WeReadConfigTable.set(db, "last_sync_time", timestamp);
      },
    );

    // View operations
    ipcMain.handle("weread:save-view", async (_event, view: DataTableView) => {
      const db = databaseModule.getCurrentDatabase();
      if (!db) throw new Error("Database not initialized");
      return WeReadViewTable.save(db, view);
    });

    ipcMain.handle("weread:get-all-views", async () => {
      const db = databaseModule.getCurrentDatabase();
      if (!db) throw new Error("Database not initialized");
      return WeReadViewTable.getAll(db);
    });

    ipcMain.handle(
      "weread:update-view",
      async (_event, view: DataTableView) => {
        const db = databaseModule.getCurrentDatabase();
        if (!db) throw new Error("Database not initialized");
        WeReadViewTable.save(db, view);
      },
    );

    ipcMain.handle("weread:delete-view", async (_event, viewId: number) => {
      const db = databaseModule.getCurrentDatabase();
      if (!db) throw new Error("Database not initialized");
      WeReadViewTable.delete(db, viewId);
    });

    ipcMain.handle("weread:get-active-view-id", async () => {
      const db = databaseModule.getCurrentDatabase();
      if (!db) throw new Error("Database not initialized");
      return WeReadConfigTable.getNumber(db, "active_view_id");
    });

    ipcMain.handle(
      "weread:save-active-view-id",
      async (_event, viewId: number) => {
        const db = databaseModule.getCurrentDatabase();
        if (!db) throw new Error("Database not initialized");
        WeReadConfigTable.set(db, "active_view_id", viewId);
      },
    );
  }

  private async handleHttpRequest(
    payload: WeReadHttpRequestPayload,
  ): Promise<WeReadHttpResponse> {
    const {
      path,
      method = "GET",
      body,
      headers = {},
      cookies = [],
      responseType,
    } = payload;

    const url = path.startsWith("http") ? path : `${WEREAD_BASE_URL}${path}`;
    const cookieHeader = buildCookieHeader(cookies);

    const requestHeaders: Record<string, string> = {
      ...DEFAULT_HEADERS,
      ...headers,
    };
    if (cookieHeader) {
      requestHeaders.Cookie = cookieHeader;
    }

    const requestInit: RequestInit = {
      method,
      headers: requestHeaders,
    };

    if (body && method !== "GET" && method !== "HEAD") {
      requestInit.body = typeof body === "string" ? body : JSON.stringify(body);
    }

    try {
      const response = await fetch(url, requestInit);
      const rawSetCookie = response.headers.raw()["set-cookie"] ?? undefined;
      const updatedCookies = mergeCookiesFromResponse(cookies, rawSetCookie);

      let data: unknown = null;
      if (responseType === "text") {
        data = await response.text();
      } else if (responseType === "none" || method === "HEAD") {
        data = null;
      } else {
        try {
          data = await response.json();
        } catch (e) {
          log.warn("WeRead response JSON parse failed:", e);
          data = null;
        }
      }

      const result: WeReadHttpResponse = {
        status: response.status,
        ok: response.ok,
        data,
        cookies: updatedCookies,
      };

      return result;
    } catch (error) {
      log.error("WeRead HTTP request failed:", error);
      throw error;
    }
  }

  private async launchLoginWindow(): Promise<WeReadLoginResult> {
    return new Promise((resolve, reject) => {
      const loginWindow = new BrowserWindow({
        width: 960,
        height: 540,
        resizable: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: false,
        },
        title: "登录微信读书",
      });

      let resolved = false;

      const session = loginWindow.webContents.session;
      const cleanupListeners = () => {
        session.webRequest.onCompleted(loginFilter, null);
        session.webRequest.onSendHeaders(cookieFilter, null);
        loginWindow.webContents.removeListener(
          "did-finish-load",
          pageLoadedListener,
        );
      };
      const resolveLogin = (result: WeReadLoginResult) => {
        if (resolved) {
          return;
        }
        resolved = true;
        cleanupListeners();
        if (!loginWindow.isDestroyed()) {
          loginWindow.close();
        }
        resolve(result);
      };
      const tryResolveFromSession = async () => {
        const result = await getLoginResultFromSession(
          session,
          WEREAD_BASE_URL,
        );
        if (!result) {
          return false;
        }
        resolveLogin(result);
        return true;
      };

      const loginFilter = {
        urls: ["https://weread.qq.com/api/auth/getLoginInfo?uid=*"],
      };

      const completedListener = (
        details: Electron.OnCompletedListenerDetails,
      ) => {
        if (details.statusCode === 200) {
          loginWindow.loadURL("https://weread.qq.com/web/shelf");
        }
      };
      session.webRequest.onCompleted(loginFilter, completedListener);

      const cookieFilter = {
        urls: ["https://weread.qq.com/web/user?userVid=*"],
      };

      const sendHeadersListener = (
        details: Electron.OnSendHeadersListenerDetails,
      ) => {
        const cookieHeader =
          details.requestHeaders?.Cookie || details.requestHeaders?.cookie;
        if (!cookieHeader) {
          return;
        }

        const cookies = parseCookieHeader(cookieHeader);
        const result = buildLoginResultFromCookies(cookies);
        if (result) {
          resolveLogin(result);
        } else {
          loginWindow.webContents.reload();
        }
      };
      session.webRequest.onSendHeaders(cookieFilter, sendHeadersListener);

      const pageLoadedListener = () => {
        void tryResolveFromSession();
      };
      loginWindow.webContents.on("did-finish-load", pageLoadedListener);

      loginWindow.on("closed", () => {
        cleanupListeners();
        if (!resolved) {
          void getLoginResultFromSession(session, WEREAD_BASE_URL).then(
            (result) => {
              if (result) {
                resolved = true;
                resolve(result);
                return;
              }
              reject(new Error("微信读书登录窗口已关闭"));
            },
          );
        }
      });

      loginWindow.loadURL("https://weread.qq.com/#login").catch((error) => {
        cleanupListeners();
        loginWindow.close();
        reject(error);
      });
    });
  }
}

const buildCookieHeader = (cookies: WeReadCookie[]): string => {
  return cookies
    .map(({ name, value }) => {
      let outputValue = value;
      if (value && value.includes("%")) {
        try {
          outputValue = decodeURIComponent(value);
        } catch {
          outputValue = value;
        }
      }
      return `${name}=${outputValue}`;
    })
    .join("; ");
};

const mergeCookiesFromResponse = (
  current: WeReadCookie[],
  rawSetCookie?: string[],
): WeReadCookie[] => {
  if (!rawSetCookie || rawSetCookie.length === 0) {
    return [...current];
  }

  const updates = rawSetCookie
    .map(parseSetCookieLine)
    .filter((cookie): cookie is WeReadCookie => cookie !== null);

  if (updates.length === 0) {
    return [...current];
  }

  const merged = [...current];
  updates.forEach((update) => {
    const idx = merged.findIndex((c) => c.name === update.name);
    if (idx >= 0) {
      merged[idx] = update;
    } else {
      merged.push(update);
    }
  });
  return merged;
};

const parseSetCookieLine = (line: string): WeReadCookie | null => {
  if (!line) {
    return null;
  }
  const [pair] = line.split(";");
  if (!pair) {
    return null;
  }
  const eqIndex = pair.indexOf("=");
  if (eqIndex === -1) {
    return null;
  }
  const name = pair.slice(0, eqIndex).trim();
  const value = pair.slice(eqIndex + 1).trim();
  if (!name) {
    return null;
  }
  return {
    name,
    value,
  };
};

const parseCookieHeader = (cookieHeader: string): WeReadCookie[] => {
  if (!cookieHeader) {
    return [];
  }
  return cookieHeader.split(";").map((part) => {
    const [name, ...rest] = part.split("=");
    const rawName = name.trim();
    const rawValue = rest.join("=").trim();
    let decodedName = rawName;
    let decodedValue = rawValue;
    try {
      decodedName = decodeURIComponent(rawName);
      decodedValue = decodeURIComponent(rawValue);
    } catch {
      // ignore decode failures
    }
    return {
      name: decodedName,
      value: decodedValue,
    };
  });
};

export default new WeReadModule();
