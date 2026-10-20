import { defineBackend } from "@tau/plugins/backend";
import { arch, platform } from "node:os";

export default defineBackend({
  create: () => ({
    activate(context) {
      context.rpc.register(
        "system.info",
        {
          input: {
            parse(value) {
              if (value !== null) throw new Error("系统信息查询不接受参数");
              return null;
            },
          },
          output: {
            parse(value) {
              if (
                !value ||
                typeof value !== "object" ||
                !("platform" in value) ||
                !("arch" in value) ||
                !("pid" in value) ||
                typeof value.platform !== "string" ||
                typeof value.arch !== "string" ||
                typeof value.pid !== "number"
              )
                throw new Error("系统信息格式无效");
              return { platform: value.platform, arch: value.arch, pid: value.pid };
            },
          },
        },
        () => ({ platform: platform(), arch: arch(), pid: process.pid })
      );
    },
  }),
});
