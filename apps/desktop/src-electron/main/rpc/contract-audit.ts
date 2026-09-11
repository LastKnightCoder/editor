import "@tau/contracts";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import "@/commands/contracts/article";
// 渲染侧契约（article/collaboration）主进程并不使用，import 仅为把 channel
// 登记进对账集合；cli 契约经 modules/setting.ts 间接加载，显式引入保持意图清晰
import "@/commands/contracts/cli";
import "@/commands/contracts/collaboration";
import { auditCommandCoverage } from "@tau/rpc";
import { listRegisteredInvokeChannels } from "./ipc-registry";

/**
 * 契约覆盖率对账（仅 dev）：对比 registry 实际注册的 channel 与契约定义，
 * 输出尚未契约化的存量清单，作为迁移进度的活报告。
 */
export function reportContractCoverage(): void {
  const { contracted, uncontracted } = auditCommandCoverage(listRegisteredInvokeChannels());
  const percent =
    contracted.length + uncontracted.length > 0
      ? Math.round((contracted.length / (contracted.length + uncontracted.length)) * 100)
      : 0;
  console.log(
    `[contract-audit] 契约化 ${contracted.length}/${contracted.length + uncontracted.length}（${percent}%），未契约化 ${uncontracted.length} 个`
  );
  if (uncontracted.length > 0) {
    console.log(`[contract-audit] 存量清单：${uncontracted.sort().join(", ")}`);
  }
}
