/**
 * 协作状态镜像 —— 会话、成员、申请都在主进程，这里只镜像 `collaboration:state` 的广播。
 *
 * 监听在模块级常驻注册（首次 import 即接线，不随页面卸载或 Activity 停驻丢失）；
 * 每个渲染进程各有一份。UI 选中态不在这里：协作页的当前内容是页面参数。
 */

import { create } from "zustand";
import { getCollaborationState } from "@/commands";
import { on } from "@/electron";
import { DEFAULT_COLLABORATION_URL, type CollaborationState } from "@tau/collaboration";

// 直接看桥是否注入（与 @/electron 的 isElectron 同一判据）；模块加载即接线，不读可被测试替身省略的导出
const hasBridge = typeof window !== "undefined" && Boolean(window.electron);

interface State extends CollaborationState {
  /** 已收到主进程的真实状态（此前是占位值，界面不应据此显示空态） */
  synced: boolean;
}

const useCollaborationStore = create<State>()(() => ({
  serverUrl: DEFAULT_COLLABORATION_URL,
  nickname: "",
  sessions: [],
  requests: [],
  // Web 端没有主进程协作模块：直接视为已同步，界面走空态而不是一直加载
  synced: !hasBridge,
}));

function connect() {
  on("collaboration:state", (_event, state: CollaborationState) =>
    useCollaborationStore.setState({ ...state, synced: true })
  );
  on("collaboration:removed", (_event, { documentId }: { documentId: string }) =>
    useCollaborationStore.setState(state => ({
      sessions: state.sessions.filter(session => session.id !== documentId),
      requests: state.requests.filter(request => request.documentId !== documentId),
    }))
  );
  // 主进程协作模块在窗口显示后初始化，首拉失败时按秒重试
  const load = (remaining: number) => {
    void getCollaborationState()
      .then(state => useCollaborationStore.setState({ ...state, synced: true }))
      .catch(() => {
        if (remaining > 0) setTimeout(() => load(remaining - 1), 1000);
      });
  };
  load(20);
}

if (hasBridge) connect();

export default useCollaborationStore;
