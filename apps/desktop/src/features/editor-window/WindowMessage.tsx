import type { ReactNode } from "react";
import { Button } from "@tau/ui";
import { closeWindow } from "@/commands";

/** 窗口级提示（参数无效 / 连库失败 / 文档已不存在）：居中说明 + 操作，默认带「关闭窗口」 */
export function WindowMessage({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
      <p className="text-tau-title text-ink-1 font-semibold">{title}</p>
      {description && <p className="text-tau-meta text-ink-2 max-w-md">{description}</p>}
      <div className="mt-3 flex gap-2">
        {actions}
        <Button variant="secondary" onClick={() => void closeWindow()}>
          关闭窗口
        </Button>
      </div>
    </div>
  );
}
