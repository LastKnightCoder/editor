/**
 * 昵称就地修改（本机唯一的协作设置）：点击原位变输入框，回车 / 失焦保存、Esc 取消。
 * 铅笔图标占固定槽位淡入，悬停不改变宽度。
 */

import { useRef, useState } from "react";
import { PenLine } from "lucide-react";
import { Input, Tooltip, toast } from "@tau/ui";
import { setCollaborationNickname } from "@/commands";
import { Avatar } from "@/components/CollaborationUI";

export function NicknameChip({ deviceId, nickname }: { deviceId?: string; nickname: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(nickname);
  const [saving, setSaving] = useState(false);
  // Esc 取消后输入框卸载可能再触发 blur，不能把草稿当作保存
  const settled = useRef(false);

  const commit = async () => {
    if (settled.current) return;
    settled.current = true;
    const value = draft.trim();
    setEditing(false);
    if (!value || value === nickname) return;
    setSaving(true);
    try {
      await setCollaborationNickname(value);
      toast.success("昵称已更新，协作者会看到新名字");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "修改失败");
    } finally {
      setSaving(false);
    }
  };

  const avatar = <Avatar id={deviceId ?? "local"} name={nickname} size={22} className="ring-0" />;

  if (editing)
    return (
      <span className="flex items-center gap-2 px-1">
        {avatar}
        <Input
          size="sm"
          autoFocus
          aria-label="协作昵称"
          maxLength={40}
          value={draft}
          wrapperClassName="w-[132px]"
          onChange={event => setDraft(event.target.value)}
          onFocus={event => event.target.select()}
          onBlur={() => void commit()}
          onKeyDown={event => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === "Enter") void commit();
            if (event.key === "Escape") {
              event.stopPropagation();
              settled.current = true;
              setEditing(false);
            }
          }}
        />
      </span>
    );

  return (
    <Tooltip content="你在协作中显示的名字，点击修改">
      <button
        type="button"
        disabled={saving || !nickname}
        onClick={() => {
          settled.current = false;
          setDraft(nickname);
          setEditing(true);
        }}
        className="rounded-tau-sm text-ink-2 hover:bg-hover hover:text-ink-1 text-tau-meta group flex h-7 cursor-pointer items-center gap-2 pl-1 pr-0.5 disabled:opacity-60"
      >
        {avatar}
        <span className="max-w-[10em] truncate">{nickname}</span>
        <span className="grid w-4 place-items-center opacity-0 transition-opacity duration-[160ms] group-hover:opacity-100">
          <PenLine className="text-ink-3 size-3" strokeWidth={1.75} />
        </span>
      </button>
    </Tooltip>
  );
}
