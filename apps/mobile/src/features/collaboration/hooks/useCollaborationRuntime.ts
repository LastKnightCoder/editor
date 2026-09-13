// 协作运行时按需启动：进入协作相关页面（中心 / 加入 / 编辑 / 成员 / 发起）时挂载。
//
// 生命周期采用引用计数：所有协作页面卸载后运行时保留一段空闲窗口（覆盖「跳出去看
// 一眼设置再回来」）；仍有活跃会话时持续保活，避免页面转场导致连接和会话被清空——
// 未使用协作的用户不加载运行时，也不会在服务器上静默注册设备身份；
// 「设置 → 启用协作」关闭时立即停止。
import { useEffect } from "react";
import { DEFAULT_COLLABORATION_URL } from "@tau/collaboration/src/protocol";
import { useAppContext } from "../../../app/AppContext";
import { toast } from "../../../components/toast";
import { consumeCollaborationNotice, useCollaborationStore } from "../core/store";

export function useCollaborationRuntime() {
  const safeSetting = useAppContext().syncSettings.safeSetting;
  const notices = useCollaborationStore(state => state.notices);

  const enabled = safeSetting?.collaboration?.enable !== false;
  const serverUrl = safeSetting?.collaboration?.serverUrl || DEFAULT_COLLABORATION_URL;
  const nickname = safeSetting?.collaboration?.nickname || "Tau 用户";

  useEffect(() => {
    if (!enabled) {
      void import("../core/manager").then(({ collaborationManager }) => {
        collaborationManager.stop();
      });
      return;
    }
    let disposed = false;
    void import("../core/manager").then(({ collaborationManager }) => {
      collaborationManager.retain();
      if (disposed) {
        collaborationManager.release();
        return;
      }
      return collaborationManager.start({ serverUrl, nickname }).catch(failure => {
        const message = failure instanceof Error ? failure.message : String(failure);
        toast.error(message);
      });
    });
    return () => {
      disposed = true;
      void import("../core/manager").then(({ collaborationManager }) => {
        collaborationManager.release();
      });
    };
  }, [enabled, serverUrl, nickname]);

  // 被撤权 / 被结束：服务端已断连，这里只做一次性提示
  useEffect(() => {
    for (const notice of notices) {
      if (!consumeCollaborationNotice(notice.id)) continue;
      toast(
        notice.kind === "closed"
          ? { type: "warning", text: `「${notice.title}」的共享已被作者结束` }
          : { type: "warning", text: `你已失去「${notice.title}」的访问权限` }
      );
    }
  }, [notices]);
}
