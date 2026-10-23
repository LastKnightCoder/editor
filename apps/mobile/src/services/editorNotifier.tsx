/**
 * Mobile 的编辑器提示服务（IEditorNotifier）：提示走 mobile 自己的 toast，确认走 MobileConfirmDialog，
 * 单行输入走 BottomSheet。编辑器的默认实现是 @tau/ui 的 toast 与对话框，mobile 没挂 @tau/ui 的 ToastHost，
 * 确认框与输入框也必须接返回手势（AGENTS.md 移动端浮层规范），所以注册自己的实现。
 */
import { useState } from "react";
import { create } from "zustand";
import type { EditorConfirmOptions, EditorNotifier, EditorPromptOptions } from "@tau/editor";
import { BottomSheet } from "../components/BottomSheet";
import { MobileConfirmDialog } from "../components/MobileConfirmDialog";
import { toast } from "../components/toast";
import { getNavigator } from "../router";
import { takeRecentUploadFailure } from "./uploadOutcome";

interface PendingRequestState<TOptions, TResult> {
  pending: (TOptions & { resolve: (result: TResult) => void }) | null;
  request: (options: TOptions & { signal?: AbortSignal }) => Promise<TResult>;
  settle: (result: TResult) => void;
}

/** Promise 驱动的单槽请求：同一时刻只保留最新一次，旧的按取消（cancelled）结算 */
function createPendingRequestStore<TOptions extends object, TResult>(cancelled: TResult) {
  return create<PendingRequestState<TOptions, TResult>>((set, get) => ({
    pending: null,
    request: options =>
      new Promise<TResult>(resolve => {
        if (options.signal?.aborted) {
          resolve(cancelled);
          return;
        }
        get().pending?.resolve(cancelled);
        const abort = () => {
          if (get().pending === pending) get().settle(cancelled);
        };
        const pending = {
          ...options,
          resolve: (result: TResult) => {
            options.signal?.removeEventListener("abort", abort);
            resolve(result);
          },
        };
        options.signal?.addEventListener("abort", abort, { once: true });
        set({ pending });
      }),
    settle: result => {
      const { pending } = get();
      if (!pending) return;
      set({ pending: null });
      pending.resolve(result);
    },
  }));
}

export const useEditorConfirmStore = createPendingRequestStore<EditorConfirmOptions, boolean>(
  false
);
export const useEditorPromptStore = createPendingRequestStore<EditorPromptOptions, string | null>(
  null
);

/** 进行中提示的常驻时长：上传等操作结束时会用同一个 id 覆盖成结果 */
const LOADING_DURATION = 60_000;
let loadingSeq = 0;

/** 编辑器只报一句「上传失败」：紧随上传失败的提示补上原因，并给出去「图片与附件」的入口 */
function notifyError(message: string) {
  const failure = takeRecentUploadFailure();
  if (!failure) {
    toast.error(message);
    return;
  }
  toast({
    type: "error",
    text: `图片没传上去：${failure.message}`,
    duration: 6000,
    action: {
      label: "去设置",
      onClick: () => getNavigator().push("settingsModule", { module: "resource" }),
    },
  });
}

export const mobileEditorNotifier: EditorNotifier = {
  success: message => void toast.success(message),
  error: notifyError,
  warning: message => void toast.warning(message),
  loading: message => {
    const id = `editor-loading-${++loadingSeq}`;
    toast({ id, type: "info", text: message, duration: LOADING_DURATION });
    return {
      success: next => void toast.success({ id, text: next }),
      error: next => void toast.error({ id, text: next }),
    };
  },
  confirm: options => useEditorConfirmStore.getState().request(options),
  prompt: options => useEditorPromptStore.getState().request(options),
};

/** 编辑器确认框的挂载点：AppShell 挂一次 */
export function EditorConfirmHost() {
  const pending = useEditorConfirmStore(state => state.pending);
  const settle = useEditorConfirmStore(state => state.settle);
  return (
    <MobileConfirmDialog
      open={!!pending}
      title={pending?.title ?? ""}
      description={pending?.description}
      confirmText={pending?.confirmText}
      cancelText={pending?.cancelText}
      danger={pending?.danger}
      onCancel={() => settle(false)}
      onConfirm={() => settle(true)}
    />
  );
}

/**
 * 编辑器单行输入（插入网络图片 / 视频 / 音频地址等）的挂载点：AppShell 挂一次。
 * BottomSheet 内置返回拦截：返回手势、遮罩、下拉都等同取消；校验不通过时保持打开并就地提示。
 */
export function EditorPromptHost() {
  const pending = useEditorPromptStore(state => state.pending);
  const settle = useEditorPromptStore(state => state.settle);
  const [shown, setShown] = useState(pending);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string>();

  // 新请求进来时在渲染期重置草稿，避免先闪一帧上一次的输入
  if (pending && pending !== shown) {
    setShown(pending);
    setValue(pending.defaultValue ?? "");
    setError(undefined);
  }

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
    <BottomSheet open={!!pending} title={shown?.title} onClose={cancel}>
      <input
        autoFocus
        value={value}
        placeholder={shown?.placeholder}
        inputMode={shown?.inputMode}
        enterKeyHint="done"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        aria-invalid={!!error}
        onChange={event => {
          setValue(event.target.value);
          setError(undefined);
        }}
        onKeyDown={event => {
          if (event.key === "Enter" && !event.nativeEvent.isComposing) {
            event.preventDefault();
            submit();
          }
        }}
        className={`bg-page text-ink-1 caret-accent placeholder:text-ink-3 w-full rounded-[14px] px-3.5 py-3 text-[14px] font-semibold outline-none ${error ? "ring-tag-5 ring-1" : ""}`}
      />
      {error ? (
        <p role="alert" className="text-tag-5 mt-2 text-[12px] font-semibold">
          {error}
        </p>
      ) : null}
      <div className="mt-4 flex gap-2.5">
        <button
          type="button"
          onClick={cancel}
          className="bg-page text-ink-2 flex-1 rounded-xl py-3 text-[14px] font-semibold transition-transform active:scale-[0.98]"
        >
          {shown?.cancelText ?? "取消"}
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!trimmed}
          className="bg-accent text-ink-inverse flex-1 rounded-xl py-3 text-[14px] font-semibold transition-transform active:scale-[0.98] disabled:opacity-40"
        >
          {shown?.confirmText ?? "确定"}
        </button>
      </div>
    </BottomSheet>
  );
}
