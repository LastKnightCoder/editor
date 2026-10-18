import { Command } from "commander";
import { beforeEach, expect, it, vi } from "vitest";
vi.mock("./status.js", () => ({ runDbStatus: vi.fn(async () => {}) }));
import { runDbStatus } from "./status.js";
import { registerDbCommands } from "./index.js";
beforeEach(() => vi.clearAllMocks());
const program = () => {
  const root = new Command().exitOverride().configureOutput({ writeErr: () => {} });
  registerDbCommands(root);
  return root;
};
it("保留普通数据库状态命令", async () => {
  await program().parseAsync(["node", "tau", "db", "status"]);
  expect(runDbStatus).toHaveBeenCalledOnce();
});
it("同步命令已删除，不保留隐藏转发或降级入口", async () => {
  await expect(program().parseAsync(["node", "tau", "db", "sync", "push"])).rejects.toMatchObject({
    code: "commander.unknownCommand",
  });
  expect(runDbStatus).not.toHaveBeenCalled();
});
