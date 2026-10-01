/**
 * 新建 / 编辑日历（合并 legacy CreateCalendarDialog + EditCalendarDialog）。
 * 字段：名称 · 分组（可选已有分组或直接输入新名，保存时找到或新建）· 颜色（17 色）。
 * 系统日历只能改颜色：名称禁用、分组隐藏。
 */

import { useEffect, useMemo, useState } from "react";
import { Button, Dialog, DialogBody, Input, Select, cn, toast, type SelectOption } from "@tau/ui";
import { useCalendarCatalog, useScheduleMutations } from "../../queries";
import { PROJECT_COLORS, type ProjectColorName } from "@/constants/project-colors";
import type { Calendar } from "@/types";
import { TONE, toneStyle } from "../../eventTone";

interface CalendarFormDialogProps {
  open: boolean;
  /** 编辑态传入日历；新建为 null */
  calendar: Calendar | null;
  /** 新建时预选分组（从分组菜单「添加日历」进入） */
  defaultGroupId?: number | null;
  onClose: () => void;
}

const CalendarFormDialog = ({
  open,
  calendar,
  defaultGroupId,
  onClose,
}: CalendarFormDialogProps) => {
  const { calendarGroups } = useCalendarCatalog();
  const { createCalendar, updateCalendar, createCalendarGroup } = useScheduleMutations();

  const [title, setTitle] = useState("");
  const [color, setColor] = useState<ProjectColorName>("blue");
  const [groupName, setGroupName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const editing = calendar !== null;
  const isSystem = calendar?.isInSystemGroup ?? false;
  // 用户分组：非系统且无 parent（系统下的「待办清单」子组不可选）
  const userGroups = useMemo(
    () => calendarGroups.filter(g => !g.isSystem && !g.parentGroupId),
    [calendarGroups]
  );

  useEffect(() => {
    if (!open) return;
    setTitle(calendar?.title ?? "");
    setColor(calendar?.color ?? "blue");
    const groupId = calendar ? calendar.groupId : defaultGroupId;
    setGroupName(userGroups.find(g => g.id === groupId)?.name ?? null);
  }, [open, calendar, defaultGroupId, userGroups]);

  const groupOptions = useMemo<SelectOption<string>[]>(
    () => [
      { value: "", label: <span className="text-ink-3">不分组</span>, searchText: "不分组" },
      ...userGroups.map(g => ({ value: g.name, label: g.name })),
    ],
    [userGroups]
  );

  const handleSave = async () => {
    if (!title.trim()) {
      toast.warning("请输入日历名称");
      return;
    }
    setSaving(true);
    try {
      // 找到或新建分组
      let groupId: number | undefined;
      const name = groupName?.trim();
      if (name) {
        const existing = userGroups.find(g => g.name === name);
        groupId =
          existing?.id ??
          (
            await createCalendarGroup({
              name,
              isSystem: false,
              parentGroupId: null,
              orderIndex: userGroups.length,
            })
          ).id;
      }

      if (calendar) {
        await updateCalendar({
          ...calendar,
          title: title.trim(),
          color,
          groupId: isSystem ? calendar.groupId : groupId,
        });
      } else {
        await createCalendar({
          title: title.trim(),
          color,
          descriptionContentId: 0,
          archived: false,
          pinned: false,
          visible: true,
          orderIndex: 0,
          groupId,
        });
      }
      onClose();
    } catch (error) {
      console.error("Failed to save calendar:", error);
      toast.error("保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (!next) onClose();
      }}
      title={editing ? (isSystem ? "编辑颜色" : "编辑日历") : "新建日历"}
      context={isSystem ? calendar?.title : undefined}
      locked={saving}
      footer={
        <>
          <Button variant="secondary" size="sm" disabled={saving} onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" size="sm" loading={saving} onClick={handleSave}>
            {editing ? "保存" : "创建"}
          </Button>
        </>
      }
    >
      <DialogBody>
        <div className="flex flex-col gap-3.5">
          {!isSystem && (
            <label className="flex flex-col gap-1.5">
              <span className="text-ink-2 text-[12px]">名称</span>
              <Input
                data-autofocus
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="如：工作、学习"
                onKeyDown={e => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) void handleSave();
                }}
              />
            </label>
          )}
          {!isSystem && (
            <div className="flex flex-col gap-1.5">
              <span className="text-ink-2 text-[12px]">分组（可选）</span>
              <Select
                options={groupOptions}
                value={groupName ?? ""}
                onValueChange={v => setGroupName(v || null)}
                searchable
                creatable
                placeholder="选择或输入新分组"
              />
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <span className="text-ink-2 text-[12px]">颜色</span>
            <div className="flex flex-wrap gap-2">
              {PROJECT_COLORS.map(c => (
                <button
                  key={c.name}
                  type="button"
                  title={c.label}
                  aria-label={c.label}
                  aria-pressed={color === c.name}
                  onClick={() => setColor(c.name)}
                  style={toneStyle(c.name)}
                  className={cn(
                    "size-[22px] rounded-[7px] bg-[var(--cal)] transition-shadow",
                    TONE,
                    color === c.name &&
                      "shadow-[0_0_0_2px_var(--tau-bg-surface),0_0_0_3.5px_var(--cal)]"
                  )}
                />
              ))}
            </div>
          </div>
        </div>
      </DialogBody>
    </Dialog>
  );
};

export default CalendarFormDialog;
