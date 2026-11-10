/**
 * Agent 一轮运行结束的进程内通知：pi 会话宿主在 agent_end 时发出，按会话作用域（scope）区分。
 * 正文在场等只关心「这个 Agent 是否还在干活」的模块订阅它，不依赖 pi 宿主的内部结构。
 */

type Listener = (scope: string) => void;

const listeners = new Set<Listener>();
const editExecutions = new Map<string, AbortController>();

/** 渲染端发起正文提交时复用主进程工具调用的生命周期。 */
export function registerAgentEditExecution(id: string): () => void {
  const controller = new AbortController();
  editExecutions.set(id, controller);
  return () => {
    editExecutions.delete(id);
    controller.abort();
  };
}

export function agentEditSignal(id: string): AbortSignal {
  return editExecutions.get(id)?.signal ?? AbortSignal.abort();
}

export function onAgentRunEnded(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitAgentRunEnded(scope: string) {
  for (const listener of listeners) {
    try {
      listener(scope);
    } catch (error) {
      console.warn("[agent-run-events] 监听者处理失败", error);
    }
  }
}
