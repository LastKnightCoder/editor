import { pluginTranslator, usePluginI18n, pluginPermission } from "../i18n";
import { Button, Loading } from "@tau/ui";
import { formatSize, type CenterReason } from "@tau/plugins/center";
import { BottomSheet } from "../../../components/BottomSheet";
import { reasonLabel } from "./pluginStatus";
const t = pluginTranslator.t;

/** 安装面板的展示状态；版本、大小与权限必须取选版返回的确切记录。 */
export type InstallSheetState =
  | { kind: "resolving" }
  | { kind: "unavailable"; reasons: readonly CenterReason[]; message?: string }
  | {
      kind: "confirm";
      version: string;
      size: number;
      permissions: readonly string[];
      newPermissions?: readonly string[];
    }
  | { kind: "installing"; phase: "queued" | "downloading" | "checking"; version?: string }
  | { kind: "done"; version: string }
  | { kind: "failed"; version: string; message: string };

const PHASE_LABELS = {
  get queued() {
    return t("install.queued");
  },
  get downloading() {
    return t("install.downloading");
  },
  get checking() {
    return t("install.verifying");
  },
};

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
  usePluginI18n();
  const version = "version" in state && state.version ? ` v${state.version}` : "";
  const installing = state.kind === "installing";
  return (
    <BottomSheet
      open={open}
      title={t(mode === "install" ? "install.titleInstall" : "install.titleUpdate", {
        name,
        version,
      })}
      onClose={onClose}
    >
      <div className="flex flex-col gap-4 px-5 pb-4">
        {state.kind === "resolving" && <Loading minHeight={96} label={t("install.resolving")} />}
        {state.kind === "unavailable" && (
          <div role="alert" className="flex flex-col gap-1.5 text-[13px]">
            <p className="text-ink-1 font-semibold">
              {t(mode === "install" ? "install.cannotInstall" : "install.cannotUpdate")}
            </p>
            {state.message && <p className="text-ink-2">{state.message}</p>}
            <ul className="text-ink-2 flex list-disc flex-col gap-0.5 pl-5">
              {state.reasons.map(reason => (
                <li key={reason.code}>{reasonLabel(reason)}</li>
              ))}
            </ul>
          </div>
        )}
        {state.kind === "confirm" && (
          <>
            <p className="text-ink-2 text-[13px] leading-relaxed">
              {t(mode === "install" ? "install.downloadInstall" : "install.downloadUpdate", {
                size: formatSize(state.size),
              })}
            </p>
            <section aria-label={t("install.permissions")} className="flex flex-col gap-1.5">
              <h4 className="text-ink-1 text-[14px] font-semibold">
                {t("install.requiredPermissions")}
              </h4>
              {state.permissions.length ? (
                <ul className="text-ink-2 flex list-disc flex-col gap-1 pl-5 text-[13px]">
                  {state.permissions.map(permission => (
                    <li key={permission}>
                      {state.newPermissions?.includes(permission)
                        ? t("permission.new", { permission: pluginPermission(permission) })
                        : pluginPermission(permission)}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-ink-3 text-[13px]">{t("install.noPermissions")}</p>
              )}
            </section>
          </>
        )}
        {state.kind === "installing" && (
          <div className="flex flex-col gap-1 text-[13px]">
            <p role="status" className="text-ink-2">
              {PHASE_LABELS[state.phase]}
            </p>
            <p className="text-ink-3">{t("install.closeHint")}</p>
          </div>
        )}
        {state.kind === "done" && (
          <p role="status" className="text-ok text-[13px]">
            {mode === "install"
              ? t("install.doneInstall", { version: state.version })
              : t("install.doneUpdate", { version: state.version })}
          </p>
        )}
        {state.kind === "failed" && (
          <p role="alert" className="text-danger text-[13px] break-words">
            {t(mode === "install" ? "install.failedInstall" : "install.failedUpdate", {
              error: state.message,
            })}
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          {state.kind === "confirm" ? (
            <>
              <Button className="min-h-11" onClick={onClose}>
                {t("common.cancel")}
              </Button>
              <Button variant="primary" className="min-h-11" onClick={onConfirm}>
                {t(mode === "install" ? "install.installVersion" : "install.confirmUpdateVersion", {
                  version: state.version,
                })}
              </Button>
            </>
          ) : installing ? (
            <>
              <Button className="min-h-11" onClick={onCancelInstall}>
                {t("install.cancelDownload")}
              </Button>
              <Button variant="primary" className="min-h-11" onClick={onClose}>
                {t("install.background")}
              </Button>
            </>
          ) : state.kind === "failed" ? (
            <>
              <Button className="min-h-11" onClick={onClose}>
                {t("common.close")}
              </Button>
              <Button variant="primary" className="min-h-11" onClick={onConfirm}>
                {t("common.retry")}
              </Button>
            </>
          ) : (
            <Button className="col-span-2 min-h-11" onClick={onClose}>
              {state.kind === "done" ? t("common.done") : t("common.close")}
            </Button>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}
