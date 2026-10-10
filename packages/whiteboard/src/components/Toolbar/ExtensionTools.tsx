import { memo, useState } from "react";
import { Blocks } from "lucide-react";
import { Popover } from "@tau/ui";
import { ChromeButton, stopCanvasEvents } from "../../chrome";
import { useActiveTool, useBoard } from "../../hooks";

/**
 * 「扩展工具」入口：第三方（非 tau 命名空间）工具的收口，工具栏宽度不受插件数量影响。
 * 入口图标记住最近用过的扩展工具（仅当前画布实例内，不持久化）；
 * 菜单项由 label + icon 生成，副行显示来源扩展的展示名。
 */
const ExtensionTools = memo(() => {
  const board = useBoard();
  const activeTool = useActiveTool();
  const extensions = board.extensions!;
  const tools = extensions.tools.filter(tool => !tool.id.startsWith("tau."));
  const [open, setOpen] = useState(false);
  const [lastUsedId, setLastUsedId] = useState<string | null>(null);
  if (!tools.length) return null;

  const lastUsed = tools.find(tool => tool.id === lastUsedId);
  const Icon = lastUsed?.icon ?? Blocks;

  return (
    <span data-extension-tools-entry className="relative z-[1] inline-flex">
      <Popover
        open={open}
        onOpenChange={setOpen}
        placement="bottom"
        arrow={false}
        className="min-w-0"
        trigger={
          <ChromeButton label="扩展工具" sub active={!activeTool.startsWith("tau.")}>
            <Icon strokeWidth={1.75} />
          </ChromeButton>
        }
      >
        <div {...stopCanvasEvents} className="w-[236px] p-1.5">
          <div className="text-tau-micro text-ink-3 px-2 pb-[5px] pt-[3px]">扩展工具</div>
          {tools.map(tool => {
            const ownerId = extensions.toolOwner(tool.id);
            const name = ownerId ? extensions.getExtensionName(ownerId) : undefined;
            const ToolIcon = tool.icon;
            return (
              <button
                key={tool.id}
                type="button"
                aria-pressed={activeTool === tool.id}
                onClick={() => {
                  setLastUsedId(tool.id);
                  extensions.runTool(tool);
                  setOpen(false);
                }}
                className="ease-tau-out hover:bg-hover aria-pressed:bg-accent-soft flex w-full items-center gap-2.5 rounded-[8px] px-2 py-1.5 text-left transition-colors duration-150"
              >
                <span className="bg-hover text-ink-2 grid size-7 flex-none place-items-center rounded-[7px] [&_svg]:size-[15px]">
                  <ToolIcon />
                </span>
                <span className="min-w-0 flex-1 leading-[1.35]">
                  <span className="text-tau-meta text-ink-1 block truncate">{tool.label}</span>
                  {name && (
                    <span className="text-tau-micro text-ink-3 block truncate">来自 {name}</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </Popover>
    </span>
  );
});

export default ExtensionTools;
