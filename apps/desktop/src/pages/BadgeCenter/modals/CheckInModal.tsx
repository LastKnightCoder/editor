import { useEffect, useState, type CSSProperties } from "react";
import { App } from "antd";
import { useMemoizedFn } from "ahooks";
import type { Descendant } from "slate";
import { Editor } from "@tau/editor/src";
import type { BadgeDefinition } from "@/types";
import { createBadgeManualEntry } from "@/commands/badge";
import { badgeConditionSources } from "../ruleBuilder";
import ModalShell from "../components/ModalShell";
import Button from "../components/Button";
import useThemeColors from "@/hooks/useThemeColors";

// 模块级常量：避免每次渲染创建新引用，导致 Editor 等子组件无意义重渲染
const EMPTY_EDITOR_VALUE: Descendant[] = [];
const EMPTY_DETAIL: unknown[] = [];
const EMPTY_ATTACHMENTS: Array<Record<string, unknown>> = [];
const EDITOR_STYLE: CSSProperties = { minHeight: 240 };
const EDITOR_PLACEHOLDER = "补充今天的完成情况、感受、图片或链接";
const TODAY_LABEL = "打卡已记录";
const SAVE_FAIL_LABEL = "打卡失败";

export interface CheckInModalProps {
  open: boolean;
  target: { definition: BadgeDefinition; manualKey: string } | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}

const getManualLabel = (manualKey: string) => {
  const source = badgeConditionSources.find(
    (item) => item.value === `manual:${manualKey}`,
  );
  return source?.label.replace("手动打卡：", "") ?? manualKey;
};

const CheckInModal = ({
  open,
  target,
  onClose,
  onSaved,
}: CheckInModalProps) => {
  const themeColors = useThemeColors();
  const { message } = App.useApp();
  const [detail, setDetail] = useState<unknown[]>(EMPTY_DETAIL);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setDetail(EMPTY_DETAIL);
  }, [open, target]);

  const handleEditorChange = useMemoizedFn((value: unknown[]) => {
    setDetail(value);
  });

  const handleSave = useMemoizedFn(async () => {
    if (!target) return;
    setSaving(true);
    try {
      await createBadgeManualEntry({
        definitionId: target.definition.id,
        manualKey: target.manualKey,
        entryDate: new Date().toISOString().slice(0, 10),
        detailContent: detail,
        attachments: EMPTY_ATTACHMENTS,
      });
      await onSaved();
      onClose();
      message.success(TODAY_LABEL);
    } catch (err) {
      const msg = err instanceof Error ? err.message : SAVE_FAIL_LABEL;
      message.error(msg);
    } finally {
      setSaving(false);
    }
  });

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title={target ? `打卡：${target.definition.name}` : "打卡"}
      subtitle={target ? `手动项：${getManualLabel(target.manualKey)}` : ""}
      widthClass="max-w-3xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" disabled={saving} onClick={handleSave}>
            {saving ? "保存中" : "完成打卡"}
          </Button>
        </>
      }
    >
      <div
        className={`min-h-[280px] rounded-2xl border p-4 ${themeColors.borderClass} ${themeColors.cardBgClass}`}
      >
        <Editor
          initValue={EMPTY_EDITOR_VALUE}
          onChange={handleEditorChange}
          placeHolder={EDITOR_PLACEHOLDER}
          readonly={false}
          style={EDITOR_STYLE}
        />
      </div>
    </ModalShell>
  );
};

export default CheckInModal;
