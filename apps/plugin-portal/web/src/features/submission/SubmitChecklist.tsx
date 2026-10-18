import { Check, X } from "lucide-react";
import { cn } from "@tau/ui";

export type CheckState = "done" | "todo" | "bad";
export interface CheckItem {
  key: string;
  state: CheckState;
  title: string;
  detail?: string;
}

/** 提交前检查：每项说明当前状态，未满足的项挡住提交 */
export function SubmitChecklist({ items }: { items: CheckItem[] }) {
  return (
    <ul aria-label="提交前检查" className="flex flex-col gap-0.5">
      {items.map(item => (
        <li key={item.key} className="text-tau-meta flex items-start gap-2.5 py-1.5">
          <span
            aria-label={{ done: "已满足", todo: "未完成", bad: "有问题" }[item.state]}
            className={cn(
              "mt-px grid size-[18px] shrink-0 place-items-center rounded-full",
              item.state === "done" && "bg-ok-soft text-ok",
              item.state === "bad" && "bg-danger-soft text-danger",
              item.state === "todo" && "border-track border-[1.5px]"
            )}
          >
            {item.state === "done" && <Check size={11} strokeWidth={2.4} />}
            {item.state === "bad" && <X size={11} strokeWidth={2.4} />}
          </span>
          <div className="min-w-0">
            <p className="text-ink-1">{item.title}</p>
            {item.detail && (
              <p
                className={cn(
                  "text-tau-micro",
                  item.state === "bad" ? "text-danger" : "text-ink-3"
                )}
              >
                {item.detail}
              </p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
