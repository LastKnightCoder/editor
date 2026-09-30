import type { EditorConfirmOptions } from "../services/notifier";
import { createHostedRequestStore } from "./createHostedRequestStore";

/**
 * 默认提示服务的确认框状态。确认框由编辑器内的 `ConfirmHost` 渲染（`@tau/ui` 的 ConfirmDialog），
 * 同一时刻最多一个确认，所以全局一份即可。
 */
const useConfirmStore = createHostedRequestStore<EditorConfirmOptions, boolean>(false);

export default useConfirmStore;
