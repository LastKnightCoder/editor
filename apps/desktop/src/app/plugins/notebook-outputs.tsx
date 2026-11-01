/**
 * Notebook 输出（SDK notebooks.registerOutput）在宿主里的承载：列出可用的插件输出、
 * 把插件的选项区与阅读区组件挂进宿主界面树（出错只影响这一块，插件 context 经 PluginComponentScope 下传）。
 * 只在主窗口有插件运行时；独立编辑窗口没有，自然不列。
 */

import type { ReactNode } from "react";
import { Plug } from "lucide-react";
import { Button, EmptyNote, UiProvider } from "@tau/ui";
import { RecoverableBoundary } from "@/components/ErrorState";
import { useDesktopPlugins } from "./context";
import { PluginComponentScope } from "./component-scope";
import type { RegisteredPluginNotebookOutput } from "./runtime";

export type { RegisteredPluginNotebookOutput };

/** 当前可用的插件输出，按注册顺序；插件启停时随运行时刷新 */
export function useNotebookOutputs(): RegisteredPluginNotebookOutput[] {
  const runtime = useDesktopPlugins();
  return runtime ? runtime.listNotebookOutputs() : [];
}

/** 某个插件产物对应的输出（插件停用时为 undefined） */
export function useNotebookOutputFor(
  pluginId: string | undefined,
  kind: string | undefined
): RegisteredPluginNotebookOutput | undefined {
  const runtime = useDesktopPlugins();
  return runtime && pluginId && kind ? runtime.findNotebookOutput(pluginId, kind) : undefined;
}

export function useGrantNotebook() {
  const runtime = useDesktopPlugins();
  return (pluginId: string, notebookId: number) => runtime?.grantNotebook(pluginId, notebookId);
}

export function notebookOutputIcon(output: RegisteredPluginNotebookOutput | undefined) {
  return output?.definition.icon ?? Plug;
}

export function PluginNotebookSlot({
  output,
  resetKeys,
  children,
}: {
  output: RegisteredPluginNotebookOutput;
  resetKeys: unknown[];
  children: ReactNode;
}) {
  return (
    <RecoverableBoundary
      resetKeys={resetKeys}
      fallback={({ error, reset }) => (
        <div className="flex items-center gap-3">
          <EmptyNote className="mt-0 min-w-0 flex-1">
            插件出错了：{error instanceof Error ? error.message : String(error)}
          </EmptyNote>
          <Button size="sm" variant="ghost" onClick={reset}>
            重试
          </Button>
        </div>
      )}
    >
      <UiProvider className="contents">
        <PluginComponentScope context={output.context}>{children}</PluginComponentScope>
      </UiProvider>
    </RecoverableBoundary>
  );
}
