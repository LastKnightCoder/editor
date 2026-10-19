import type { EditorPromptOptions } from "../services/notifier";
import { createHostedRequestStore } from "./createHostedRequestStore";

/** 默认提示服务的输入框状态，由编辑器内的 `PromptHost` 渲染；取消结算为 null */
const usePromptStore = createHostedRequestStore<EditorPromptOptions, string | null>(null);

export default usePromptStore;
