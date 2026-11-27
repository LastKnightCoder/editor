import { createEditor, Transforms, type Descendant } from "slate";
import { describe, expect, it, vi } from "vitest";
import type { CheckListItemElement } from "@tau/editor/extensions/list";
import {
  commitMobileDocTaskReminders,
  createMobileDocTaskReminderTarget,
  readCheckListReminders,
} from "../docTaskReminders";

function makeEditor(nodes: Descendant[]) {
  const editor = createEditor();
  editor.children = nodes;
  return editor;
}

const access = { collectable: true, excluded: false, promotedTaskIds: [] };

describe("commitMobileDocTaskReminders", () => {
  it("旧勾选项前插入新行后，提醒仍写在原项；原项被替换则放弃", async () => {
    const row = (text: string): CheckListItemElement => ({
      type: "check-list-item",
      checked: false,
      children: [{ type: "paragraph", children: [{ text, type: "formatted" }] }],
    });
    const original = row("原项");
    const editor = makeEditor([{ type: "check-list", children: [original] }]);
    const target = createMobileDocTaskReminderTarget(original);
    Transforms.insertNodes(editor, row("新项"), { at: [0, 0] });
    const next = [{ at: "2026-11-28T08:00:00.000Z" }];
    expect(
      (await commitMobileDocTaskReminders({ access, editor, target, nextReminders: next })).status
    ).toBe("saved");
    const rows = (editor.children[0] as { children: CheckListItemElement[] }).children;
    expect(readCheckListReminders(rows[0])).toEqual([]);
    expect(readCheckListReminders(rows[1])).toEqual(next);
    const removed = createMobileDocTaskReminderTarget(rows[0]);
    Transforms.removeNodes(editor, { at: [0, 0] });
    expect(
      (await commitMobileDocTaskReminders({ access, editor, target: removed, nextReminders: next }))
        .status
    ).toBe("missing");
  });

  it("老笔记单条 08:00 增改删保留正文格式与 taskId，冲突时不覆盖并发修改", async () => {
    const at0800 = "2026-11-28T08:00:00.000Z";
    const at2000 = "2026-11-28T20:00:00.000Z";
    const at1930 = "2026-11-28T19:30:00.000Z";

    const legacyItem = {
      type: "check-list-item",
      checked: false,
      taskId: "legacy-mobile-1",
      taskReminder: { version: 1, at: at0800 },
      children: [
        {
          type: "paragraph",
          children: [{ text: "重要", bold: true }, { text: "草稿未保存编辑" }],
        },
      ],
    } as unknown as CheckListItemElement;

    const editor = makeEditor([
      { type: "check-list", children: [legacyItem] } as unknown as Descendant,
    ]);
    const flushNow = vi.fn(async () => true);

    // 1. 打开老笔记并添加 20:00（保留 08:00）
    const target1 = createMobileDocTaskReminderTarget(legacyItem);
    expect(target1.reminders).toEqual([{ at: at0800 }]);
    const res1 = await commitMobileDocTaskReminders({
      access,
      editor,
      target: target1,
      nextReminders: [{ at: at0800 }, { at: at2000 }],
      flushNow,
    });
    expect(res1).toMatchObject({ status: "saved", taskId: "legacy-mobile-1" });
    expect(flushNow).toHaveBeenCalledTimes(1);

    // 校验正文格式、未保存文字和 taskId 完整保留
    const live1 = (editor.children[0] as { children: CheckListItemElement[] }).children[0];
    expect(live1.taskId).toBe("legacy-mobile-1");
    expect(readCheckListReminders(live1)).toEqual([{ at: at0800 }, { at: at2000 }]);
    expect(
      (live1.children[0] as { children: Array<{ text: string; bold?: boolean }> }).children
    ).toEqual([{ text: "重要", bold: true }, { text: "草稿未保存编辑" }]);

    // 2. 用旧 target1 再次写入应被判定冲突，不覆盖当前列表
    const conflict = await commitMobileDocTaskReminders({
      access,
      editor,
      target: target1,
      nextReminders: [{ at: at0800 }],
      flushNow,
    });
    expect(conflict).toMatchObject({
      status: "conflict",
      reminders: [{ at: at0800 }, { at: at2000 }],
    });
    expect(flushNow).toHaveBeenCalledTimes(1);

    // 3. 把 20:00 改成 19:30，再删除 08:00
    const target2 = createMobileDocTaskReminderTarget(live1);
    const res2 = await commitMobileDocTaskReminders({
      access,
      editor,
      target: target2,
      nextReminders: [{ at: at1930 }],
      flushNow,
    });
    expect(res2).toMatchObject({ status: "saved", reminders: [{ at: at1930 }] });
    const live2 = (editor.children[0] as { children: CheckListItemElement[] }).children[0];
    expect(readCheckListReminders(live2)).toEqual([{ at: at1930 }]);

    // 4. 外部把节点改写后，旧 target2 也检测冲突
    Transforms.setNodes(
      editor,
      {
        taskReminder: { version: 2, reminders: [{ at: at2000 }] },
      } as Partial<CheckListItemElement>,
      { at: [0, 0] }
    );
    const conflict2 = await commitMobileDocTaskReminders({
      access,
      editor,
      target: target2,
      nextReminders: [],
      flushNow,
    });
    expect(conflict2).toMatchObject({ status: "conflict", reminders: [{ at: at2000 }] });
  });
});
