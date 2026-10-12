import {
  PomodoroBindTarget,
  PomodoroPreset,
  PomodoroSession,
  RpcMessageType,
  RpcRequestMessage,
  RpcResponseMessage,
} from "@/types";
import BackendWebSocketServer from "../utils/BackendWebSocketServer";
import { routeNotification } from "../windows";
import PomodoroSessionTable from "./tables/pomodoro-session";
import PomodoroPresetTable from "./tables/pomodoro-preset";
import databaseModule from "./database";
import { basename } from "node:path";
import { broadcastScheduleChange } from "./schedule-changes";

export type BackgroundSoundType =
  null | "brook" | "birds" | "autumn" | "tide" | "summer" | "wind-chime" | "bonfire" | "rain";

class PomodoroModule {
  private backendServer: BackendWebSocketServer | null = null;
  private selectedPreset: PomodoroPreset | null = null;
  private activeSession: PomodoroSession | null = null;
  private tickTimer: NodeJS.Timer | null = null;
  private autoStopTriggered = false;
  private backgroundSound: BackgroundSoundType = null;
  private backgroundVolume = 50;

  async init(backendServer: BackendWebSocketServer) {
    this.backendServer = backendServer;

    databaseModule.onDatabaseChange(dbName => {
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
      }
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
      }
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
      }
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
            target?: PomodoroBindTarget | null;
          };
          const db = this.getDatabase();
          if (!db) throw new Error("Database not connected");
          const preset = PomodoroPresetTable.getById(db, payload.presetId);
          if (!preset) throw new Error(`Preset ${payload.presetId} not found`);
          // 跨域入口只传预设：倒计时时长按预设补算
          const expectedMs =
            payload.expectedMs ??
            (preset.mode === "countdown" ? preset.durationMin * 60_000 : undefined);
          const binding = PomodoroSessionTable.resolveBinding(db, payload.target);

          const now = Date.now();
          this.activeSession = {
            id: now,
            presetId: payload.presetId,
            startTime: now,
            endTime: undefined,
            expectedMs,
            focusMs: 0,
            pauseTotalMs: 0,
            pauseCount: 0,
            pauses: [],
            status: "running",
            createTime: now,
            updateTime: now,
            ...binding,
          };

          this.autoStopTriggered = false;
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
      }
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
      }
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
                0
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
      }
    );

    this.backendServer.addMessageHandler(
      "pomodoro:update-binding",
      async (message: RpcRequestMessage) => {
        const { id, params, method } = message;
        try {
          if (!this.activeSession) throw new Error("No active session");
          const db = this.getDatabase();
          if (!db) throw new Error("Database not connected");
          const { target } = params as unknown as { target: PomodoroBindTarget | null };
          const binding = PomodoroSessionTable.resolveBinding(db, target);
          // 三列整体覆盖：清除绑定时也要把旧值置空
          this.activeSession = {
            ...this.activeSession,
            boundEventId: binding.boundEventId,
            boundTodoId: binding.boundTodoId,
            boundTitle: binding.boundTitle,
            updateTime: Date.now(),
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
          return {
            type: RpcMessageType.Response,
            id,
            method,
            result: null,
            error: { code: 1, message: error.message || "Failed to update binding" },
          };
        }
      }
    );

    this.backendServer.addMessageHandler(
      "pomodoro:stop-session",
      async (message: RpcRequestMessage) => {
        const { id, params, method } = message;

        try {
          const payload = params as unknown as { asComplete?: boolean } | undefined;

          const asComplete = payload && payload.asComplete === false ? false : true;
          const savedSession = await this.stopSession(asComplete);

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
      }
    );

    this.backendServer.addMessageHandler(
      "pomodoro:get-background-sound",
      async (message: RpcRequestMessage) => {
        const { id, method } = message;
        return {
          type: RpcMessageType.Response,
          id,
          method,
          result: {
            backgroundSound: this.backgroundSound,
            backgroundVolume: this.backgroundVolume,
          },
          error: null,
        };
      }
    );

    this.backendServer.addMessageHandler(
      "pomodoro:set-background-sound",
      async (message: RpcRequestMessage) => {
        const { id, params, method } = message;
        const payload = params as unknown as {
          backgroundSound?: BackgroundSoundType;
          backgroundVolume?: number;
        };

        if (payload.backgroundSound !== undefined) {
          this.backgroundSound = payload.backgroundSound;
        }
        if (payload.backgroundVolume !== undefined) {
          this.backgroundVolume = payload.backgroundVolume;
        }

        this.notifyBackgroundSoundChanged();

        return {
          type: RpcMessageType.Response,
          id,
          method,
          result: {
            backgroundSound: this.backgroundSound,
            backgroundVolume: this.backgroundVolume,
          },
          error: null,
        };
      }
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
      this.backendServer.sendNotification("pomodoro:selected-preset-changed", preset);
    }
  }

  private notifyActiveSessionChanged() {
    if (this.backendServer) {
      this.backendServer.sendNotification("pomodoro:active-session-changed", this.activeSession);
    }
  }

  private notifyBackgroundSoundChanged() {
    if (this.backendServer) {
      this.backendServer.sendNotification("pomodoro:background-sound-changed", {
        backgroundSound: this.backgroundSound,
        backgroundVolume: this.backgroundVolume,
      });
    }
  }

  private async autoStopSession() {
    console.log("Auto stopping countdown session");
    try {
      const result = await this.stopSession(true);
      if (result) {
        console.log("Auto stop completed, session saved:", result.id);
      }
    } catch (error) {
      console.error("Failed to auto stop session:", error);
    }
  }

  private async stopSession(asComplete: boolean): Promise<PomodoroSession | null> {
    if (!this.activeSession) {
      throw new Error("No active session");
    }

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

    const pauseTotalMs = pauses.reduce((acc, p) => acc + ((p.end ?? now) - p.start), 0);
    const focusMs = Math.max(0, now - this.activeSession.startTime - pauseTotalMs);

    // 如果专注时长小于 5 分钟，不保存记录，直接清除
    const FIVE_MINUTES_MS = 5 * 60 * 1000;
    if (focusMs < FIVE_MINUTES_MS) {
      this.activeSession = null;
      this.notifyActiveSessionChanged();
      return null;
    }

    // 判断状态：正计时或倒计时完成为 completed，否则为 stopped
    const status: "completed" | "stopped" = asComplete ? "completed" : "stopped";

    const { boundEventId, boundTodoId, boundTitle } = this.activeSession;
    const savedSession = PomodoroSessionTable.insertCompletedSession(db, {
      ...PomodoroSessionTable.refreshBinding(db, { boundEventId, boundTodoId, boundTitle }),
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

    // 创建日历事件
    try {
      if (PomodoroSessionTable.writeCalendarEvents(db, savedSession.id).length > 0) {
        broadcastScheduleChange(basename(db.name));
      }
    } catch (e) {
      console.error("Failed to create calendar event:", e);
    }

    // 会话结束回报经通知分流；发在模块层而非 tables 层（tables 拉进窗口模块图会成环）
    try {
      routeNotification(
        {
          id: "pomodoro-session-end",
          title: status === "completed" ? "番茄完成" : "专注结束",
          body: `专注 ${Math.round(focusMs / 60000)} 分钟`,
          icon: "timer",
          sticky: true,
        },
        { kind: "main" }
      );
    } catch (_e) {
      // 通知失败不影响会话落库
    }

    this.activeSession = null;
    this.notifyActiveSessionChanged();

    return savedSession;
  }

  private startTickTimer() {
    if (this.tickTimer) return;

    this.tickTimer = setInterval(() => {
      if (this.activeSession && this.backendServer) {
        const now = Date.now();

        let pauseTotalMs = this.activeSession.pauseTotalMs;
        if (this.activeSession.status === "paused") {
          const last = this.activeSession.pauses[this.activeSession.pauses.length - 1];
          if (last && last.end === undefined) {
            pauseTotalMs += now - last.start;
          }
        }

        const elapsedMs = Math.max(0, now - this.activeSession.startTime - pauseTotalMs);

        let remainMs: number | undefined;
        if (this.activeSession.expectedMs) {
          remainMs = Math.max(0, this.activeSession.expectedMs - elapsedMs);

          // 倒计时模式：当剩余时间为 0 且未触发过自动停止时，自动结束会话
          if (
            remainMs === 0 &&
            !this.autoStopTriggered &&
            this.activeSession.status === "running"
          ) {
            this.autoStopTriggered = true;
            // 异步执行停止操作，避免阻塞 tick
            this.autoStopSession().catch(e => {
              console.error("Failed to auto stop session:", e);
            });
          }
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
