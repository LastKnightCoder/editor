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
  const cwd = useChatCwd(chatId);
  const defaultCwd = useSettingStore(s => s.setting.agentWorkspace?.defaultCwd?.trim() ?? "");
  const { data: info } = useWorkspaceInfo(cwd);
  const busyTitle = busy ? "对话进行中，结束后再切换" : undefined;

  const changeCwd = async (next: string) => {
    try {
      await useChatSessionStore.getState().setChatCwd(chatId, next);
    } catch (error) {
      toast.error("工作目录更新失败");
      console.error(error);
    }
  };

  const pickDirectory = async () => {
    const picked = await selectDirectoryWithDialog();
    if (picked) await changeCwd(picked);
  };

  if (!info) return null;

  return (
    <div className="-ml-1.5 mb-1 flex h-7 min-w-0 items-center gap-0.5 overflow-hidden">
      <Menu
        className="w-[300px]"
        trigger={
          <button
            type="button"
            className={TRIGGER}
            disabled={busy}
            title={busyTitle ?? info.path}
            aria-label="工作目录"
          >
            <Folder size={13} strokeWidth={1.75} className="shrink-0" />
            <span className="truncate">{baseName(info.path)}</span>
            <ChevronDown size={12} strokeWidth={1.75} className="text-ink-3 shrink-0" />
          </button>
        }
      >
        <Menu.Group>
          <span className="block break-all font-normal tracking-normal">{info.path}</span>
        </Menu.Group>
        <Menu.Item
          icon={<FolderOpen className={MENU_ICON} strokeWidth={1.75} />}
          onSelect={() => void pickDirectory()}
        >
          选择目录…
        </Menu.Item>
        {cwd !== defaultCwd && (
          <Menu.Item
            icon={<RotateCcw className={MENU_ICON} strokeWidth={1.75} />}
            onSelect={() => void changeCwd("")}
          >
            使用默认目录
          </Menu.Item>
        )}
        <Menu.Separator />
        <Menu.Item
          icon={<ExternalLink className={MENU_ICON} strokeWidth={1.75} />}
          onSelect={() => void showInFolder(info.path)}
        >
          在访达中显示
        </Menu.Item>
      </Menu>

      {info.git && <BranchMenu cwd={cwd} git={info.git} busy={busy} busyTitle={busyTitle} />}

      {info.missing && (
        <span className="text-warn text-tau-tiny truncate">目录不存在，已改用应用数据目录</span>
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
  const [open, setOpen] = useState(false);
  const branches = useWorkspaceBranches(cwd, open);
  const checkout = useWorkspaceCheckout(cwd);
  const label = git.branch ?? `${git.head}（游离）`;

  const switchTo = (branch: string) => {
    setOpen(false);
    if (branch === git.branch) return;
    checkout.mutate(branch, {
      onSuccess: () => toast.success(`已切换到 ${branch}`),
      onError: error => toast.error(error instanceof Error ? error.message : "切换分支失败"),
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
          title={busyTitle ?? `当前分支：${label}`}
          aria-label="切换分支"
        >
          <GitBranch size={13} strokeWidth={1.75} className="shrink-0" />
          <span className="truncate">{label}</span>
          <ChevronDown size={12} strokeWidth={1.75} className="text-ink-3 shrink-0" />
        </button>
      }
    >
      <Menu.Group>切换分支</Menu.Group>
      {branches.isPending ? (
        <Menu.Item disabled>读取中…</Menu.Item>
      ) : branches.isError ? (
        <Menu.Item disabled>读取分支失败</Menu.Item>
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
