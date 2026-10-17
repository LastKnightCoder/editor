import { createMockApi } from "./mockApi";
export function startMock() {
  return {
    api: createMockApi(),
    panel: (
      <div className="bg-accent-soft text-accent-text rounded-tau-sm text-tau-sm fixed bottom-4 right-4 px-3 py-2">
        模拟模式 · 不会上传至服务器
      </div>
    ),
  };
}
