import { Button, Loading } from "@tau/ui";
import type { CenterReason } from "@tau/plugins/center";
import { BottomSheet } from "../../../components/BottomSheet";
import { reasonLabel } from "./pluginStatus";

function formatSize(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** 安装面板的展示状态；版本、大小与权限必须取选版返回的确切记录。 */
export type InstallSheetState =
  | { kind: "resolving" }
  | { kind: "unavailable"; reasons: readonly CenterReason[]; message?: string }
  | { kind: "confirm"; version: string; size: number; permissions: readonly string[] }
  | { kind: "installing"; phase: "downloading" | "checking"; version?: string }
  | { kind: "done"; version: string }
  | { kind: "failed"; version: string; message: string };

const PHASE_LABELS = { downloading: "正在从插件中心下载…", checking: "正在校验包与发布记录…" };

export function InstallSheet({
  open,
  mode,
  name,
  state,
  onConfirm,
  onCancelInstall,
  onClose,
}: {
  open: boolean;
  mode: "install" | "update";
  name: string;
  state: InstallSheetState;
  onConfirm: () => void;
  onCancelInstall: () => void;
  onClose: () => void;
}) {
  const verb = mode === "install" ? "安装" : "更新";
  const version = "version" in state && state.version ? ` v${state.version}` : "";
  const installing = state.kind === "installing";
  return (
    <BottomSheet
      open={open}
      title={`${verb} ${name}${version}`}
      // 下载/校验中返回手势不关闭面板，避免误以为已取消
      backDismiss={!installing}
      onClose={installing ? () => undefined : onClose}
    >
      <div className="flex flex-col gap-4 px-5 pb-[calc(16px+var(--mobile-safe-bottom,0px))]">
        {state.kind === "resolving" && <Loading minHeight={96} label="正在选择适合此设备的版本…" />}
        {state.kind === "unavailable" && (
          <div role="alert" className="flex flex-col gap-1.5 text-[13px]">
            <p className="text-ink-1 font-semibold">暂时不能{verb}</p>
            {state.message && <p className="text-ink-2">{state.message}</p>}
            <ul className="text-ink-2 flex list-disc flex-col gap-0.5 pl-5">
              {state.reasons.map(reason => (
                <li key={reasonLabel(reason)}>{reasonLabel(reason)}</li>
              ))}
            </ul>
          </div>
        )}
        {state.kind === "confirm" && (
          <>
            <p className="text-ink-2 text-[13px] leading-relaxed">
              从插件中心下载 {formatSize(state.size)}，校验通过后在下次打开应用时生效。
            </p>
            <section aria-label="插件权限" className="flex flex-col gap-1.5">
              <h4 className="text-ink-1 text-[14px] font-semibold">需要的权限</h4>
              {state.permissions.length ? (
                <ul className="text-ink-2 flex list-disc flex-col gap-1 pl-5 text-[13px]">
                  {state.permissions.map(permission => (
                    <li key={permission}>{permission}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-ink-3 text-[13px]">不需要额外权限</p>
              )}
            </section>
          </>
        )}
        {state.kind === "installing" && (
          <p role="status" className="text-ink-2 text-[13px]">
            {PHASE_LABELS[state.phase]}
          </p>
        )}
        {state.kind === "done" && (
          <p role="status" className="text-ok text-[13px]">
            已安装 v{state.version}，将在下次打开应用时生效。
          </p>
        )}
        {state.kind === "failed" && (
          <p role="alert" className="text-danger break-words text-[13px]">
            {verb}失败：{state.message}。已安装的旧版本不受影响。
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          {state.kind === "confirm" ? (
            <>
              <Button className="min-h-11" onClick={onClose}>
                取消
              </Button>
              <Button variant="primary" className="min-h-11" onClick={onConfirm}>
                {verb} v{state.version}
              </Button>
            </>
          ) : installing ? (
            <Button className="col-span-2 min-h-11" onClick={onCancelInstall}>
              取消下载
            </Button>
          ) : state.kind === "failed" ? (
            <>
              <Button className="min-h-11" onClick={onClose}>
                关闭
              </Button>
              <Button variant="primary" className="min-h-11" onClick={onConfirm}>
                重试
              </Button>
            </>
          ) : (
            <Button className="col-span-2 min-h-11" onClick={onClose}>
              {state.kind === "done" ? "完成" : "关闭"}
            </Button>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}
