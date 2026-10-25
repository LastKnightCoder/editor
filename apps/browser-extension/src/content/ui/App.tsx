import { PortalScope } from "@tau/ui";
import { useCompanion } from "../state/store";
import { useController } from "./context";
import { Orb } from "./Orb";
import { SelectionToolbar } from "./SelectionToolbar";
import { MarginMarkers, NoteEditor } from "./Annotations";
import { QuickBubble } from "./QuickBubble";
import { Panel } from "./Panel";

const prefersDark = () => matchMedia("(prefers-color-scheme: dark)").matches;

/** 伴读根：主题跟随 Tau（未连接时用暖纸 + 系统明暗），全部浮层渲染在 shadow root 内 */
export function App() {
  const appearance = useCompanion(state => state.status.appearance);
  const hidden = useCompanion(state => state.hiddenOnSite);
  const panelOpen = useCompanion(state => state.panelOpen);
  return (
    <div
      className="tau-root font-tau text-tau-body text-ink-1 antialiased"
      data-theme={appearance?.theme ?? "paper"}
      data-mode={appearance?.mode ?? (prefersDark() ? "dark" : "light")}
    >
      <PortalScope>
        {(!hidden || panelOpen) && <Orb />}
        <MarginMarkers />
        <SelectionToolbar />
        <NoteEditor />
        <QuickBubble />
        <Panel />
        <Coach />
        <Toast />
      </PortalScope>
    </div>
  );
}

function Coach() {
  const controller = useController();
  const seen = useCompanion(state => state.coachSeen);
  const side = useCompanion(state => state.side);
  const ratio = useCompanion(state => state.orbRatio);
  const panelOpen = useCompanion(state => state.panelOpen);
  if (seen || panelOpen) return null;
  return (
    <div
      className="bg-surface shadow-float animate-tau-pop rounded-tau-md fixed z-[31] w-[248px] px-3.5 pt-3.5 pb-3"
      style={{
        top: Math.max(12, ratio * innerHeight - 150),
        [side === "right" ? "right" : "left"]: 60,
      }}
    >
      <h4 className="text-tau-body-lg text-ink-1 mb-1 font-semibold">伴读在这里</h4>
      <p className="text-tau-meta text-ink-2 mb-2.5">
        选中文字即可高亮、批注或提问；悬停这颗球看快捷动作，拖动可换位置。
      </p>
      <div className="flex items-center justify-between">
        <span className="text-tau-tiny text-ink-3 border-line-1 rounded-[5px] border px-1.5 font-mono">
          ⌥J 打开面板
        </span>
        <button
          type="button"
          onClick={() => controller.dismissCoach()}
          className="border-line-1 text-ink-2 hover:bg-hover text-tau-sm rounded-tau-sm h-[26px] border px-2.5"
        >
          知道了
        </button>
      </div>
    </div>
  );
}

function Toast() {
  const toast = useCompanion(state => state.toast);
  if (!toast) return null;
  return (
    <div
      role="status"
      className="bg-ink-1 text-surface shadow-float animate-tau-pop text-tau-meta fixed bottom-7 left-1/2 z-50 -translate-x-1/2 rounded-[10px] px-3.5 py-2"
    >
      {toast}
    </div>
  );
}
