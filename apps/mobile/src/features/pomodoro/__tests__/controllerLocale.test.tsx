import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { usePomodoroController, type UsePomodoroControllerResult } from "../usePomodoroController";
import { usePomodoroI18n, pomoText } from "../i18n";
import { mobileLocaleSource } from "../../../services/i18n";
import type { PomodoroPreset, PomodoroSession } from "../../../types";
import * as tauri from "../../../services/tauri";
let client: QueryClient;
vi.mock("../../../router", () => ({ getQueryClient: () => client }));
vi.mock("../../../services/tauri", () => ({
  pomodoroGetActiveSession: vi.fn(),
  pomodoroStopSession: vi.fn(),
  pomodoroStartSession: vi.fn(),
  pomodoroPauseSession: vi.fn(),
  pomodoroResumeSession: vi.fn(),
}));
it("语言切换不重启倒计时，归零只结束并庆祝一次", async () => {
  vi.useFakeTimers();
  const now = new Date(2026, 10, 27, 9).getTime();
  vi.setSystemTime(now);
  const original = mobileLocaleSource.getSnapshot();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const preset: PomodoroPreset = {
    id: 3,
    name: "原始预设名",
    mode: "countdown",
    durationMin: 5,
    sortOrder: 1,
    archived: false,
    createTime: 1,
    updateTime: 1,
  };
  const session: PomodoroSession = {
    id: 17,
    presetId: 3,
    startTime: now - 298000,
    endTime: null,
    expectedMs: 300000,
    focusMs: 0,
    pauseTotalMs: 0,
    pauseCount: 0,
    pauses: [],
    status: "running",
    createTime: 1,
    updateTime: 1,
  };
  let server: PomodoroSession | null = session;
  vi.mocked(tauri.pomodoroGetActiveSession).mockImplementation(async () => server);
  vi.mocked(tauri.pomodoroStopSession).mockImplementation(async () => {
    server = null;
    return { ...session, focusMs: 300000, endTime: now + 2000, status: "completed" };
  });
  client.setQueryData(["pomodoro", "active"], session);
  const error = vi.fn();
  let read = (): UsePomodoroControllerResult | null => null;
  const Probe = () => {
    usePomodoroI18n();
    const controller = usePomodoroController([preset], error);
    read = () => controller;
    return <output>{pomoText("state.focusing")}</output>;
  };
  try {
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <Probe />
        </QueryClientProvider>
      );
      await vi.advanceTimersByTimeAsync(0);
    });
    const calls = vi.mocked(tauri.pomodoroGetActiveSession).mock.calls.length;
    const interval = vi.spyOn(window, "setInterval");
    for (const locale of ["zh-TW", "en-US"]) {
      await act(async () => mobileLocaleSource.setLocale(locale));
      expect(read()?.session).toBe(session);
      expect(read()?.preset).toBe(preset);
      expect(read()?.tick?.remainMs).toBe(2000);
      expect(vi.mocked(tauri.pomodoroGetActiveSession).mock.calls.length).toBe(calls);
      expect(interval).not.toHaveBeenCalled();
      for (const action of [
        tauri.pomodoroStopSession,
        tauri.pomodoroStartSession,
        tauri.pomodoroPauseSession,
        tauri.pomodoroResumeSession,
      ])
        expect(action).not.toHaveBeenCalled();
    }
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(tauri.pomodoroStopSession).toHaveBeenCalledExactlyOnceWith(true);
    expect(read()?.justCompleted).toBe(true);
    expect(read()?.lastCompleted?.id).toBe(session.id);
    await act(async () => {
      mobileLocaleSource.setLocale("zh-CN");
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(tauri.pomodoroStopSession).toHaveBeenCalledTimes(1);
    expect(error).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    client.clear();
    host.remove();
    mobileLocaleSource.setLocale(original);
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.useRealTimers();
  }
});
