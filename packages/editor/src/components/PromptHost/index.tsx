import { useState } from "react";
import { Button, Dialog, DialogBody, Input } from "@tau/ui";

import usePromptStore from "../../stores/usePromptStore";
import { useHostedRequestLeader } from "../../stores/createHostedRequestStore";

/**
 * 默认提示服务的单行输入框（`@tau/ui` Dialog）。挂在编辑器内，宿主不需要额外挂载；
 * 同页多个编辑器时只由队首渲染。校验不通过时保持打开，错误就地显示在输入框下方。
 */
export default function PromptHost() {
  const pending = usePromptStore(state => state.pending);
  const settle = usePromptStore(state => state.settle);
  const isLeader = useHostedRequestLeader(usePromptStore);
  // 最近一次请求：关闭动画期间 pending 已清空，标题与按钮文案仍按它渲染
  const [shown, setShown] = useState(pending);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string>();

  // 新请求进来时在渲染期重置草稿，避免先闪一帧上一次的输入
  if (pending && pending !== shown) {
    setShown(pending);
    setValue(pending.defaultValue ?? "");
    setError(undefined);
  }

  if (!isLeader) return null;

  const trimmed = value.trim();
  const submit = () => {
    if (!pending || !trimmed) return;
    const message = pending.validate?.(trimmed);
    if (message) {
      setError(message);
      return;
    }
    settle(trimmed);
  };
  const cancel = () => settle(null);

  return (
    <Dialog
      open={!!pending}
      onOpenChange={open => !open && cancel()}
      title={shown?.title ?? ""}
      width={460}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={cancel}>
            {shown?.cancelText ?? "取消"}
          </Button>
          <Button variant="primary" size="sm" disabled={!trimmed} onClick={submit}>
            {shown?.confirmText ?? "确定"}
          </Button>
        </>
      }
    >
      <DialogBody>
        <Input
          data-autofocus
          placeholder={shown?.placeholder}
          inputMode={shown?.inputMode}
          value={value}
          aria-invalid={!!error}
          onChange={e => {
            setValue(e.target.value);
            setError(undefined);
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
