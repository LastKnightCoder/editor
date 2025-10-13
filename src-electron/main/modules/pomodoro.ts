import {
  PomodoroPreset,
  PomodoroSession,
  RpcMessageType,
  RpcRequestMessage,
  RpcResponseMessage,
} from "@/types";
import BackendWebSocketServer from "../utils/BackendWebSocketServer";
import PomodoroSessionTable from "./tables/pomodoro-session";
import databaseModule from "./database";

class PomodoroModule {
  private backendServer: BackendWebSocketServer | null = null;
  private selectedPreset: PomodoroPreset | null = null;
  private activeSession: PomodoroSession | null = null;
  private tickTimer: NodeJS.Timer | null = null;

  async init(backendServer: BackendWebSocketServer) {
    this.backendServer = backendServer;

    databaseModule.onDatabaseChange((dbName) => {
      console.log(`Database changed to ${dbName}, clearing active session`);
      this.handleDatabaseChange();
    });
    this.startTickTimer();

    this.backendServer.addMessageHandler(
      "pomodoro:get-selected-preset",
      async (message: RpcRequestMessage) => {
        const { id, method } = message;
        const res: RpcResponseMessage = {
          type: RpcMessageType.Response,
          id,
          method,
          result: this.selectedPreset,
          error: null,
        };
        return res;
      },
    );

    this.backendServer.addMessageHandler(
      "pomodoro:set-selected-preset",
      async (message: RpcRequestMessage) => {
        const { id, params, method } = message;
        const preset = params as unknown as PomodoroPreset;
        this.setSelectedPreset(preset);
        const res: RpcResponseMessage = {
          type: RpcMessageType.Response,
          id,
          method,
          result: { Ok: true },
          error: null,
        };
        return res;
      },
    );

    this.backendServer.addMessageHandler(
      "pomodoro:get-active-session",
      async (message: RpcRequestMessage) => {
        const { id, method } = message;
        const res: RpcResponseMessage = {
          type: RpcMessageType.Response,
          id,
          method,
          result: this.activeSession,
          error: null,
        };
        return res;
      },
    );

    this.backendServer.addMessageHandler(
      "pomodoro:start-session",
      async (message: RpcRequestMessage) => {
        const { id, params, method } = message;

        try {
          if (this.activeSession) {
            throw new Error("Session already started");
          }

          const payload = params as unknown as {
            presetId: number;
            expectedMs?: number;
          };

          const now = Date.now();
          this.activeSession = {
            id: now,
            presetId: payload.presetId,
            startTime: now,
            endTime: undefined,
            expectedMs: payload.expectedMs,
            focusMs: 0,
            pauseTotalMs: 0,
            pauseCount: 0,
            pauses: [],
            status: "running",
            createTime: now,
            updateTime: now,
          };

          this.notifyActiveSessionChanged();

          return {
            type: RpcMessageType.Response,
            id,
            method,
            result: this.activeSession,
            error: null,
          };
        } catch (error: any) {
          console.error("Failed to start session", error);
          return {
            type: RpcMessageType.Response,
            id,
            method,
            result: null,
            error: {
              code: 1,
              message: error.message || "Failed to start session",
            },
          };
        }
      },
    );

    this.backendServer.addMessageHandler(
      "pomodoro:pause-session",
      async (message: RpcRequestMessage) => {
        const { id, method } = message;

        console.log("pomodoro:pause-session", this.activeSession);

        try {
          if (!this.activeSession) {
            throw new Error("No active session");
          }

          if (this.activeSession.status !== "running") {
            throw new Error("Session is not running");
          }

          const now = Date.now();
          this.activeSession.pauses.push({ start: now });
          this.activeSession.pauseCount++;
          this.activeSession.status = "paused";
          this.activeSession.updateTime = now;

          this.notifyActiveSessionChanged();

          return {
            type: RpcMessageType.Response,
            id,
            method,
            result: this.activeSession,
            error: null,
          };
        } catch (error: any) {
          return {
            type: RpcMessageType.Response,
            id,
            method,
            result: null,
            error: {
              code: 1,
              message: error.message || "Failed to pause session",
            },
          };
        }
      },
    );

    this.backendServer.addMessageHandler(
      "pomodoro:resume-session",
      async (message: RpcRequestMessage) => {
        const { id, method } = message;

        try {
          if (!this.activeSession) {
            throw new Error("No active session");
          }

          if (this.activeSession.status !== "paused") {
            throw new Error("Session is not paused");
          }

          const now = Date.now();
          const pauses = this.activeSession.pauses;

          if (pauses.length > 0) {
            const last = pauses[pauses.length - 1];
            if (last && last.end === undefined) {
              last.end = now;
              this.activeSession.pauseTotalMs = pauses.reduce(
                (acc, p) => acc + ((p.end ?? now) - p.start),
                0,
              );
            }
          }

          this.activeSession.status = "running";
          this.activeSession.updateTime = now;

          this.notifyActiveSessionChanged();

          return {
            type: RpcMessageType.Response,
            id,
            method,
            result: this.activeSession,
            error: null,
          };
        } catch (error: any) {
          return {
            type: RpcMessageType.Response,
            id,
            method,
            result: null,
            error: {
              code: 1,
              message: error.message || "Failed to resume session",
            },
          };
        }
      },
    );

    this.backendServer.addMessageHandler(
      "pomodoro:stop-session",
      async (message: RpcRequestMessage) => {
        const { id, params, method } = message;

        try {
          if (!this.activeSession) {
            throw new Error("No active session");
          }

          const payload = params as unknown as
            | { asComplete?: boolean }
            | undefined;
          const db = this.getDatabase();
          if (!db) {
            throw new Error("Database not connected");
          }

          const now = Date.now();
          const pauses = this.activeSession.pauses;

          if (this.activeSession.status === "paused" && pauses.length > 0) {
            const last = pauses[pauses.length - 1];
            if (last && last.end === undefined) {
              last.end = now;
            }
          }

          const pauseTotalMs = pauses.reduce(
            (acc, p) => acc + ((p.end ?? now) - p.start),
            0,
          );
          const focusMs = Math.max(
            0,
            now - this.activeSession.startTime - pauseTotalMs,
          );

          // 判断状态：正计时或倒计时完成为 completed，否则为 stopped
          const status: "completed" | "stopped" =
            payload && payload.asComplete === false ? "stopped" : "completed";

          const savedSession = PomodoroSessionTable.insertCompletedSession(db, {
            presetId: this.activeSession.presetId,
            startTime: this.activeSession.startTime,
            endTime: now,
            expectedMs: this.activeSession.expectedMs,
            focusMs,
            pauseTotalMs,
            pauseCount: this.activeSession.pauseCount,
            pauses,
            status,
          });

          this.activeSession = null;
          this.notifyActiveSessionChanged();

          return {
            type: RpcMessageType.Response,
            id,
            method,
            result: savedSession,
            error: null,
          };
        } catch (error: any) {
          return {
            type: RpcMessageType.Response,
            id,
            method,
            result: null,
            error: {
              code: 1,
              message: error.message || "Failed to stop session",
            },
          };
        }
      },
    );
  }

  private getDatabase() {
    return databaseModule.getCurrentDatabase();
  }

  private handleDatabaseChange(): void {
    if (this.activeSession) {
      this.activeSession = null;
      this.notifyActiveSessionChanged();
    }
  }

  private setSelectedPreset(preset: PomodoroPreset | null) {
    this.selectedPreset = preset;
    if (this.backendServer) {
      this.backendServer.sendNotification(
        "pomodoro:selected-preset-changed",
        preset,
      );
    }
  }

  private notifyActiveSessionChanged() {
    if (this.backendServer) {
      this.backendServer.sendNotification(
        "pomodoro:active-session-changed",
        this.activeSession,
      );
    }
  }

  private startTickTimer() {
    if (this.tickTimer) return;

    this.tickTimer = setInterval(() => {
      if (this.activeSession && this.backendServer) {
        const now = Date.now();

        let pauseTotalMs = this.activeSession.pauseTotalMs;
        if (this.activeSession.status === "paused") {
          const last =
            this.activeSession.pauses[this.activeSession.pauses.length - 1];
          if (last && last.end === undefined) {
            pauseTotalMs += now - last.start;
          }
        }

        const elapsedMs = Math.max(
          0,
          now - this.activeSession.startTime - pauseTotalMs,
        );

        let remainMs: number | undefined;
        if (this.activeSession.expectedMs) {
          remainMs = Math.max(0, this.activeSession.expectedMs - elapsedMs);
        }

        this.backendServer.sendNotification("pomodoro:tick", {
          session: this.activeSession,
          elapsedMs,
          remainMs,
        });
      }
    }, 1000);
  }
}

export default new PomodoroModule();
