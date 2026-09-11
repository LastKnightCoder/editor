import { describe, expect, it } from "vitest";
import { setCommandBridge } from "@tau/rpc";
import { settingCommands } from "./setting";

describe("setting 命令契约", () => {
  it("保留参数与返回值类型并通过桥接调用", async () => {
    setCommandBridge({
      call: async (channel, args) => {
        expect(channel).toBe("write-setting");
        expect(args).toEqual(["{}"]);
        return undefined;
      },
    });
    await expect(settingCommands.write.call("{}")).resolves.toBeUndefined();
    setCommandBridge(null);
  });
});
