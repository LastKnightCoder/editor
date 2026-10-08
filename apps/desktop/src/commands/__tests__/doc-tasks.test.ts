import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  database: "a",
  ready: Promise.resolve(),
  invoke: vi.fn(async () => "ok"),
}));
vi.mock("@/electron", () => ({ invoke: state.invoke }));
vi.mock("@/stores/useSettingStore", () => ({
  default: { getState: () => ({ setting: { database: { active: state.database } } }) },
}));
vi.mock("../module-init", () => ({
  withModule: async (_name: string, run: () => Promise<unknown>) => {
    await state.ready;
    return run();
  },
}));
import { setDocTasksExcluded, toggleDocTask } from "../doc-tasks";

beforeEach(() => {
  state.database = "a";
  state.ready = Promise.resolve();
  state.invoke.mockClear();
});
describe("文档待办命令的数据库身份", () => {
  it("等待模块期间切库时拒绝原请求", async () => {
    let ready = () => {};
    state.ready = new Promise<void>(resolve => {
      ready = resolve;
    });
    const pending = setDocTasksExcluded(7, true, "a");
    state.database = "b";
    ready();
    await expect(pending).rejects.toThrow("数据库已切换");
    expect(state.invoke).not.toHaveBeenCalled();
  });
  it("旧撤销闭包不操作新库同号正文", () => {
    state.database = "b";
    expect(() => toggleDocTask(7, "task", false, "a")).toThrow("数据库已切换");
    expect(state.invoke).not.toHaveBeenCalled();
  });
  it("IPC 携带发起库，库名后缀保持等价", async () => {
    await setDocTasksExcluded(7, true, "a.db");
    expect(state.invoke).toHaveBeenCalledWith("doc-tasks:set-excluded", 7, true, {
      databaseName: "a.db",
    });
  });
});
