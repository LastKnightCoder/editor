import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FlaskConical, X } from "lucide-react";
import { Button, IconButton, Panel, cn } from "@tau/ui";
import type { MockController, MockFlags } from "./mockApi";

type Choice<K extends keyof MockFlags> = {
  key: K;
  label: string;
  options: [MockFlags[K], string][];
};

const CHOICES = [
  {
    key: "list",
    label: "提交列表",
    options: [
      ["normal", "正常"],
      ["empty", "空列表"],
      ["error", "加载失败"],
    ],
  },
  {
    key: "upload",
    label: "上传",
    options: [
      ["normal", "正常"],
      ["network", "网络中断"],
      ["invalid", "校验失败"],
      ["server-error", "服务异常"],
    ],
  },
  {
    key: "submit",
    label: "提交",
    options: [
      ["normal", "正常"],
      ["repository", "仓库未通过"],
      ["github", "GitHub 不可用"],
      ["network", "响应丢失"],
    ],
  },
] as const satisfies Choice<"list" | "upload" | "submit">[];

const TOGGLES: [keyof MockFlags, string][] = [
  ["slowUpload", "慢速上传（便于取消）"],
  ["expireNextRequest", "下一次请求会话过期"],
  ["conflictNextSave", "下一次保存遇到其他窗口的新版本"],
];

/** 仅模拟模式出现的场景面板：切换异常分支，覆盖各状态样本 */
export function MockPanel({ controller }: { controller: MockController }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [flags, setFlags] = useState(controller.getFlags);
  const update = (patch: Partial<MockFlags>) => {
    controller.setFlags(patch);
    setFlags(controller.getFlags());
    if ("list" in patch) void queryClient.invalidateQueries({ queryKey: ["submissions"] });
  };

  if (!open) {
    return (
      <Button
        size="sm"
        variant="soft"
        icon={FlaskConical}
        className="fixed bottom-4 right-4 z-50"
        onClick={() => setOpen(true)}
      >
        模拟模式
      </Button>
    );
  }
  return (
    <Panel
      pad="compact"
      className="shadow-float fixed bottom-4 right-4 z-50 flex w-[320px] flex-col gap-3"
    >
      <header className="flex items-center gap-2">
        <FlaskConical size={15} className="text-accent-text" />
        <h2 className="text-tau-sm text-ink-1 font-semibold">模拟场景</h2>
        <IconButton aria-label="收起" className="ml-auto" onClick={() => setOpen(false)}>
          <X size={14} />
        </IconButton>
      </header>
      {CHOICES.map(choice => (
        <div key={choice.key} className="flex flex-col gap-1.5">
          <p className="text-tau-micro text-ink-3">{choice.label}</p>
          <div className="flex flex-wrap gap-1">
            {choice.options.map(([value, label]) => (
              <Button
                key={value}
                size="sm"
                variant={flags[choice.key] === value ? "soft" : "ghost"}
                aria-pressed={flags[choice.key] === value}
                onClick={() => update({ [choice.key]: value })}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
      ))}
      <div className="flex flex-col gap-1">
        {TOGGLES.map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={!!flags[key]}
            onClick={() => update({ [key]: !flags[key] })}
            className={cn(
              "text-tau-sm rounded-tau-sm flex items-center gap-2 px-2 py-1.5 text-left transition-colors",
              flags[key] ? "bg-accent-soft text-accent-text" : "text-ink-2 hover:bg-hover"
            )}
          >
            <span className={cn("size-2 rounded-full", flags[key] ? "bg-accent" : "bg-line-2")} />
            {label}
          </button>
        ))}
      </div>
      <div className="border-line-1 flex flex-wrap gap-2 border-t pt-3">
        <Button size="sm" onClick={() => window.location.assign("/login?error=oauth_failed")}>
          OAuth 失败
        </Button>
        <Button
          size="sm"
          variant="danger-soft"
          onClick={() => {
            controller.reset();
            window.location.assign("/submissions");
          }}
        >
          重置样本数据
        </Button>
      </div>
    </Panel>
  );
}
