import { useChatWorkspaceI18n } from "../workspace.i18n";
import { WorkspaceCheckoutError } from "../workspace-errors";
import { usePlatformLabels } from "@/platform/i18n";
/**
 * 对话工作目录栏：输入框正上方显示 AI 执行命令、读写文件所在的目录，是仓库时显示当前分支。
 * 在这里换目录只影响当前对话（下一轮起生效）；切分支直接作用于该仓库。
 * 对话进行中不允许切换，免得一轮命令跑到一半换了地方。
 */

import { useState } from "react";
import { ChevronDown, ExternalLink, Folder, FolderOpen, GitBranch, RotateCcw } from "lucide-react";
import { Menu, toast } from "@tau/ui";
import { selectDirectoryWithDialog, showInFolder } from "@/commands";
import useChatSessionStore, { useChatCwd } from "@/stores/useChatSessionStore";
import useSettingStore from "@/stores/useSettingStore";
import { useWorkspaceBranches, useWorkspaceCheckout, useWorkspaceInfo } from "../workspaceQueries";

const MENU_ICON = "size-[15px] shrink-0";
const TRIGGER =
  "text-ink-2 hover:bg-hover rounded-tau-sm text-tau-meta inline-flex h-6 min-w-0 items-center gap-1 px-1.5 disabled:pointer-events-none disabled:opacity-60";

const baseName = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? path;

export function WorkspaceBar({ chatId, busy }: { chatId: string; busy: boolean }) {
  const { t } = useChatWorkspaceI18n();
  const { revealInFileManagerLabel } = usePlatformLabels();
  const cwd = useChatCwd(chatId);
  const defaultCwd = useSettingStore(s => s.setting.agentWorkspace?.defaultCwd?.trim() ?? "");
  const { data: info } = useWorkspaceInfo(cwd);
  const busyTitle = busy ? t("workspace.busy") : undefined;

  const changeCwd = async (next: string) => {
    try {
      await useChatSessionStore.getState().setChatCwd(chatId, next);
    } catch (error) {
      toast.error(t("workspace.changeFailed"));
      console.error(error);
    }
  };

  const pickDirectory = async () => {
    const picked = await selectDirectoryWithDialog();
    if (picked) await changeCwd(picked);
  };

  if (!info) return null;

  return (
    <div className="mb-1 -ml-1.5 flex h-7 min-w-0 items-center gap-0.5 overflow-hidden">
      <Menu
        className="w-[300px]"
        trigger={
          <button
            type="button"
            className={TRIGGER}
            disabled={busy}
            title={busyTitle ?? info.path}
            aria-label={t("workspace.label")}
          >
            <Folder size={13} strokeWidth={1.75} className="shrink-0" />
            <span className="truncate">{baseName(info.path)}</span>
            <ChevronDown size={12} strokeWidth={1.75} className="text-ink-3 shrink-0" />
          </button>
        }
      >
        <Menu.Group>
          <span className="block font-normal tracking-normal break-all">{info.path}</span>
        </Menu.Group>
        <Menu.Item
          icon={<FolderOpen className={MENU_ICON} strokeWidth={1.75} />}
          onSelect={() => void pickDirectory()}
        >
          {t("workspace.choose")}
        </Menu.Item>
        {cwd !== defaultCwd && (
          <Menu.Item
            icon={<RotateCcw className={MENU_ICON} strokeWidth={1.75} />}
            onSelect={() => void changeCwd("")}
          >
            {t("workspace.reset")}
          </Menu.Item>
        )}
        <Menu.Separator />
        <Menu.Item
          icon={<ExternalLink className={MENU_ICON} strokeWidth={1.75} />}
          onSelect={() => void showInFolder(info.path)}
        >
          {revealInFileManagerLabel}
        </Menu.Item>
      </Menu>

      {info.git && <BranchMenu cwd={cwd} git={info.git} busy={busy} busyTitle={busyTitle} />}

      {info.missing && (
        <span className="text-warn text-tau-tiny truncate">{t("workspace.missing")}</span>
      )}
    </div>
  );
}

function BranchMenu({
  cwd,
  git,
  busy,
  busyTitle,
}: {
  cwd: string;
  git: { branch: string | null; head: string };
  busy: boolean;
  busyTitle?: string;
}) {
  const { t } = useChatWorkspaceI18n();
  const [open, setOpen] = useState(false);
  const branches = useWorkspaceBranches(cwd, open);
  const checkout = useWorkspaceCheckout(cwd);
  const label = git.branch ?? t("branch.detached", { head: git.head });

  const switchTo = (branch: string) => {
    setOpen(false);
    if (branch === git.branch) return;
    checkout.mutate(branch, {
      onSuccess: () => toast.success(t("branch.done", { branch })),
      onError: error =>
        toast.error(
          error instanceof WorkspaceCheckoutError || !(error instanceof Error)
            ? t("branch.failed")
            : error.message
        ),
    });
  };

  return (
    <Menu
      fit
      open={open}
      onOpenChange={setOpen}
      className="w-[260px]"
      trigger={
        <button
          type="button"
          className={TRIGGER}
          disabled={busy || checkout.isPending}
          title={busyTitle ?? t("branch.current", { branch: label })}
          aria-label={t("branch.switch")}
        >
          <GitBranch size={13} strokeWidth={1.75} className="shrink-0" />
          <span className="truncate">{label}</span>
          <ChevronDown size={12} strokeWidth={1.75} className="text-ink-3 shrink-0" />
        </button>
      }
    >
      <Menu.Group>{t("branch.switch")}</Menu.Group>
      {branches.isPending ? (
        <Menu.Item disabled>{t("branch.loading")}</Menu.Item>
      ) : branches.isError ? (
        <Menu.Item disabled>{t("branch.readFailed")}</Menu.Item>
      ) : (
        <Menu.RadioGroup value={git.branch ?? undefined} onValueChange={switchTo}>
          {(branches.data ?? []).map(branch => (
            <Menu.RadioItem key={branch} value={branch}>
              <span className="truncate">{branch}</span>
            </Menu.RadioItem>
          ))}
        </Menu.RadioGroup>
      )}
    </Menu>
  );
}
