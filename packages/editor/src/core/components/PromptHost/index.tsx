import { useEditorI18nRuntime } from "../../../i18n";
import { editorMessages, requestRuntime } from "../../../i18n-runtime";
import { useI18n } from "@tau/i18n/react";
import { useRef, useState } from "react";
import { Button, Dialog, DialogBody, Input } from "@tau/ui";

import usePromptStore from "../../stores/usePromptStore";
import { useHostedRequestLeader } from "../../stores/createHostedRequestStore";

/**
 * 默认提示服务的单行输入框（`@tau/ui` Dialog）。挂在编辑器内，宿主不需要额外挂载；
 * 同页多个编辑器时只由队首渲染。校验不通过时保持打开，错误就地显示在输入框下方。
 */
export default function PromptHost() {
  const pending = usePromptStore(state => state.pending);
  const inheritedRuntime = useEditorI18nRuntime();
  const { t } = useI18n(editorMessages, requestRuntime(pending) ?? inheritedRuntime);
  const settle = usePromptStore(state => state.settle);
  const isLeader = useHostedRequestLeader(usePromptStore);
  // 最近一次请求：关闭动画期间 pending 已清空，标题与按钮文案仍按它渲染
  const [shown, setShown] = useState(pending);
  const [value, setValue] = useState("");
  const [invalid, setInvalid] = useState(false);
  const error = invalid && pending ? pending.validate?.(value.trim()) : undefined;

  // 新请求进来时在渲染期重置草稿，避免先闪一帧上一次的输入
  if (pending && pending !== shown) {
    setShown(pending);
    setValue(pending.defaultValue ?? "");
    setInvalid(false);
  }

  const lastCopy = useRef<
    | {
        title: string;
        placeholder?: string;
        cancelText: string;
        confirmText: string;
        inputMode?: "text" | "url";
      }
    | undefined
  >(undefined);
  if (pending)
    lastCopy.current = {
      title: pending.title,
      placeholder: pending.placeholder,
      cancelText: pending.cancelText ?? t("editorCommon.cancel"),
      confirmText: pending.confirmText ?? t("editorCommon.ok"),
      inputMode: pending.inputMode,
    };
  const copy = lastCopy.current;

  if (!isLeader) return null;

  const trimmed = value.trim();
  const submit = () => {
    if (!pending || !trimmed) return;
    const message = pending.validate?.(trimmed);
    if (message) {
      setInvalid(true);
      return;
    }
    settle(trimmed);
  };
  const cancel = () => settle(null);

  return (
    <Dialog
      open={!!pending}
      onOpenChange={open => !open && cancel()}
      title={copy?.title ?? ""}
      width={460}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={cancel}>
            {copy?.cancelText ?? t("editorCommon.cancel")}
          </Button>
          <Button variant="primary" size="sm" disabled={!trimmed} onClick={submit}>
            {copy?.confirmText ?? t("editorCommon.ok")}
          </Button>
        </>
      }
    >
      <DialogBody>
        <Input
          data-autofocus
          placeholder={copy?.placeholder}
          inputMode={copy?.inputMode}
          value={value}
          aria-invalid={!!error}
          onChange={e => {
            setValue(e.target.value);
            setInvalid(false);
          }}
          onKeyDown={e => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
        />
        {error && (
          <p role="alert" className="text-danger text-tau-meta mt-1.5">
            {error}
          </p>
        )}
      </DialogBody>
    </Dialog>
  );
}
