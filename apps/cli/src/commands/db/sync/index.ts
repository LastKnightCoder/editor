import type { Command } from "commander";
import { runSyncStatus } from "./status.js";
import { runSyncPush } from "./push.js";
import { runSyncPull } from "./pull.js";

export function registerSyncCommands(db: Command) {
  const sync = db.command("sync").description("数据库与对话配对快照同步");

  sync
    .command("status")
    .description("Show sync status (local vs remote version)")
    .action(async () => {
      await runSyncStatus();
    });

  sync
    .command("push")
    .description("上传数据库与对话包，全部成功后发布版本")
    .action(async () => {
      try {
        await runSyncPush();
      } catch (e: any) {
        console.error(e.message);
        process.exit(1);
      }
    });

  sync
    .command("pull")
    .description("校验并成对下载数据库与对话包，失败自动回滚")
    .action(async () => {
      try {
        await runSyncPull();
      } catch (e: any) {
        console.error(e.message);
        process.exit(1);
      }
    });
}
