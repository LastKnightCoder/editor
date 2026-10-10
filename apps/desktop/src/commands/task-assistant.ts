import { invoke } from "@/electron";
import { currentCommandScope } from "@/services/command-context";
import useSettingStore from "@/stores/useSettingStore";
import { withModule } from "./module-init";

export async function taskAssistantRequest<T>(
  channel: string,
  args: unknown[],
  database?: string,
  signal?: AbortSignal
): Promise<T> {
  const scope = currentCommandScope();
  const expected =
    database ?? scope?.databaseName ?? useSettingStore.getState().setting.database.active;
  const check = () => {
    (signal ?? scope?.signal)?.throwIfAborted();
    if (
      useSettingStore.getState().setting.database.active.replace(/\.db$/, "") !==
      expected.replace(/\.db$/, "")
    )
      throw new Error("数据库已切换，请重新操作");
  };
  check();
  return withModule("task-assistant", () => {
    check();
    // 库名由宿主绑定，不能从模型参数获得。
    return invoke<T>(channel, ...args, { databaseName: expected });
  });
}
