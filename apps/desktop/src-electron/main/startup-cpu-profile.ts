import { Session } from "node:inspector";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import PathUtil from "./utils/PathUtil";

export const startupCpuProfile: {
  status: "disabled" | "recording" | "saved" | "failed";
  path?: string;
  error?: string;
} = { status: "disabled" };

// 仅显式诊断启动开启；使用进程内 inspector 会话，不打开调试端口。
if (process.argv.includes("--tau-profile-startup")) {
  const session = new Session();
  const fail = (error: unknown) => {
    startupCpuProfile.status = "failed";
    startupCpuProfile.error = error instanceof Error ? error.message : String(error);
    session.disconnect();
    console.error("[startup-profile] 启动 CPU 采集失败", error);
  };
  try {
    session.connect();
    session.post("Profiler.enable", error => {
      if (error) return fail(error);
      session.post("Profiler.start", error => {
        if (error) return fail(error);
        startupCpuProfile.status = "recording";
        setTimeout(() => {
          session.post("Profiler.stop", (error, result) => {
            if (error) return fail(error);
            session.disconnect();
            const directory = path.join(PathUtil.getAppDir(), "logs");
            const target = path.join(directory, `startup-main-${Date.now()}.cpuprofile`);
            void mkdir(directory, { recursive: true })
              .then(() => writeFile(target, JSON.stringify(result.profile), "utf8"))
              .then(() => {
                startupCpuProfile.status = "saved";
                startupCpuProfile.path = target;
                console.info(`[startup-profile] 启动 CPU 采集已保存: ${target}`);
              })
              .catch(fail);
          });
        }, 10_000).unref();
      });
    });
  } catch (error) {
    fail(error);
  }
}
