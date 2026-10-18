import type { ChatAdapter } from "@tau/plugins/host";
import { copyJson } from "@tau/plugins/host";
import type { JsonValue } from "@tau/plugins";
import { registerOwnedToolCallRenderer } from "@tau/chat-ui/renderers";
import { getPluginToolName } from "@/tools/plugin-tool-name";

export const desktopPluginChat: ChatAdapter = {
  async prepare(context, definition) {
    const name = await getPluginToolName(context.pluginId, definition.mcpId, definition.toolName);
    context.signal.throwIfAborted();
    const Component = definition.component;
    return () => {
      context.signal.throwIfAborted();
      const handle = registerOwnedToolCallRenderer(name, function PluginToolRenderer(props) {
        if (
          context.signal.aborted ||
          props.execution.status === "failed" ||
          props.execution.status === "cancelled"
        )
          return props.renderDefault();
        const render = props.execution.metadata?.render as
          { version?: unknown; payload?: unknown } | undefined;
        let data: JsonValue | null = null;
        let dataVersion: number | null = null;
        if (render?.version !== undefined) {
          if (!Number.isSafeInteger(render.version) || (render.version as number) < 1)
            return props.renderDefault();
          try {
            data = copyJson(render.payload);
            dataVersion = render.version as number;
          } catch {
            return props.renderDefault();
          }
        }
        return (
          <Component
            execution={props.execution}
            isDark={props.isDark}
            parsedInput={props.parsedInput}
            inputParseError={props.inputParseError}
            data={data}
            dataVersion={dataVersion}
            renderDefault={props.renderDefault}
          />
        );
      });
      const dispose = () => {
        context.signal.removeEventListener("abort", dispose);
        handle.dispose();
      };
      context.signal.addEventListener("abort", dispose, { once: true });
      if (context.signal.aborted) dispose();
      return { dispose };
    };
  },
};
