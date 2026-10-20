import type { BackendChild } from "./manager";

/** 清理期限结束后强制结束实例，不能依赖插件配合 SIGTERM。 */
export function terminateBackendChild(child: BackendChild) {
  const pid = child.pid;
  if (pid) {
    try {
      process.kill(pid, "SIGKILL");
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ESRCH") return;
    }
  }
  child.kill();
}
