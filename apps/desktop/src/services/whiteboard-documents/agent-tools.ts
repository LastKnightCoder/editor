import type { createWhiteboardBinding } from "@tau/whiteboard/collaboration";
import type { WhiteboardDocumentClient } from "./client";
import type { WhiteboardRemoteSync } from "./remote";
import { agentIdentity } from "../agent-identity";
import type { ToolDefinition, ToolExecutionContext, ToolParameterSchema } from "@/types/tool";
import { applyWhiteboardAgentOperations } from "@/commands/whiteboard-document";
import {
  coordKeys,
  endpointId,
  pageElements,
  readGeometry,
  simpleLabel,
} from "../../../shared/whiteboard-agent";

const string = { type: "string" };
const geometry: ToolParameterSchema = {
  type: "object",
  properties: Object.fromEntries(coordKeys.map(k => [k, { type: "number" }])),
  required: [...coordKeys],
  additionalProperties: false,
};
const op: ToolParameterSchema = {
  type: "object",
  properties: {
    kind: { type: "string", enum: ["shape", "text", "connect", "move", "label", "delete"] },
    id: { type: "string", description: "创建填本批临时名称，其余填读到的元素 ID" },
    shape: { type: "string", enum: ["rectangle", "capsule", "cylinder"] },
    geometry,
    before: geometry,
    text: string,
    beforeText: string,
    beforeRevision: { type: "integer" },
    from: string,
    to: string,
  },
  required: ["kind", "id"],
  additionalProperties: false,
};
const parameters = (properties: Record<string, ToolParameterSchema>, required: string[] = []) => ({
  type: "object" as const,
  properties,
  required,
  additionalProperties: false,
});

export function whiteboardAgentTools(
  scope: string,
  binding: ReturnType<typeof createWhiteboardBinding>,
  client: WhiteboardDocumentClient,
  remote: WhiteboardRemoteSync | undefined,
  lifetime: AbortSignal,
  apply = applyWhiteboardAgentOperations
): ToolDefinition[] {
  const pageId = binding.pageId;
  const targets = new Map<string, string>();
  const check = (ctx?: ToolExecutionContext) => {
    lifetime.throwIfAborted();
    ctx?.signal?.throwIfAborted();
    if (
      !ctx?.conversationKey ||
      !ctx.databaseName ||
      ctx.databaseName.replace(/\.db$/, "") !== client.target.databaseName.replace(/\.db$/, "") ||
      !binding.board ||
      binding.closed ||
      binding.pageId !== pageId ||
      client.needsReopen ||
      client.isDisposed
    )
      throw new Error("当前白板页已失效，请重新发起指令");
    return binding.board;
  };
  const page = () => {
    const p = client.model.read().pages.find(p => p.id === pageId);
    if (!p) throw new Error("目标白板页已移除");
    return p;
  };
  const writable = () =>
    Boolean(binding.board?.captureSubmission()()) &&
    !["forbidden", "closed", "incompatible", "rebind", "rejected", "error"].includes(
      remote?.getSnapshot().phase ?? ""
    );
  const target = (args: Record<string, unknown>, ctx?: ToolExecutionContext) => {
    if (
      !ctx?.conversationKey ||
      typeof args.target !== "string" ||
      args.target !== targets.get(ctx.conversationKey)
    )
      throw new Error("目标句柄已失效，请重新读取当前白板");
  };
  const show = (ctx: ToolExecutionContext | undefined, ids: string[]) => {
    const board = binding.board;
    if (!board || lifetime.aborted) return;
    const selection = ids.slice(0, 64).map(id => ({ id, minX: 0, minY: 0, maxX: 0, maxY: 0 }));
    remote?.reportAgent({
      owner: ctx?.conversationKey ?? scope,
      name: agentIdentity(ctx?.toolContext?.agentTitle).name,
      presence: {
        pageId,
        selection,
        moving: false,
        cursor: selection.length
          ? null
          : { x: board.viewPort.minX + 24, y: board.viewPort.minY + 32 },
      },
    });
  };
  return [
    {
      name: "get_whiteboard_context",
      displayName: "读取当前白板",
      risk: "read",
      description: "读取左侧当前白板页、视口、选区和写入目标。操作白板前先调用。",
      parameters: parameters({}),
      async executor(_args, ctx) {
        const board = check(ctx),
          selected = board.selection?.selectedElements.map(e => e.id).slice(0, 64) ?? [];
        const owner = ctx?.conversationKey;
        if (!owner) throw new Error("白板工具缺少对话身份");
        const handle = targets.get(owner) ?? crypto.randomUUID();
        targets.set(owner, handle);
        show(ctx, selected);
        return {
          content: JSON.stringify({
            target: handle,
            title: page().title,
            pageId,
            viewport: board.viewPort,
            selected,
            writable: writable(),
          }),
        };
      },
    },
    {
      name: "read_whiteboard_elements",
      displayName: "读取白板元素",
      risk: "read",
      description:
        "分页读取当前页的元素 ID、位置、简单标签和连线。可指定元素或画布范围。删除前读取 revision。",
      parameters: parameters(
        {
          target: string,
          ids: { type: "array", items: string, maxItems: 64 },
          region: geometry,
          offset: { type: "integer", minimum: 0 },
        },
        ["target"]
      ),
      async executor(args, ctx) {
        check(ctx);
        target(args, ctx);
        await client.observeRevision(client.getSnapshot().revision);
        check(ctx);
        const ids = args.ids;
        if (
          ids !== undefined &&
          (!Array.isArray(ids) || ids.length > 64 || !ids.every(id => typeof id === "string"))
        )
          throw new Error("元素 ID 列表无效");
        const region = args.region === undefined ? undefined : readGeometry(args.region);
        const offset = args.offset ?? 0;
        if (typeof offset !== "number" || !Number.isSafeInteger(offset) || offset < 0)
          throw new Error("分页位置无效");
        const nodes = pageElements(page().children).filter(
          n =>
            (!Array.isArray(ids) || ids.includes(n.id)) &&
            (!region ||
              (n.geometry.x + n.geometry.width >= region.x &&
                n.geometry.x <= region.x + region.width &&
                n.geometry.y + n.geometry.height >= region.y &&
                n.geometry.y <= region.y + region.height))
        );
        const elements = nodes.slice(offset, offset + 32).map(n => ({
          id: n.id,
          type: n.type,
          geometry: n.geometry,
          text: simpleLabel(n)?.slice(0, 1024),
          from: endpointId(n.data.source),
          to: endpointId(n.data.target),
          children: n.children.length,
        }));
        show(
          ctx,
          elements.slice(0, 8).map(e => e.id)
        );
        return {
          content: JSON.stringify({
            revision: client.getSnapshot().revision,
            elements,
            next: offset + elements.length < nodes.length ? offset + elements.length : null,
          }),
        };
      },
    },
    {
      name: "apply_whiteboard_operations",
      displayName: "修改当前白板",
      risk: "write",
      description:
        "原子提交操作数组。shape/text 填 geometry 和 text，connect 的 from/to 可指向本批先创建的临时 ID。move 带读取的 before 和新 geometry；label 带 beforeText 和 text；delete 单独提交并带 beforeRevision。重试复用 requestId。",
      parameters: parameters(
        {
          target: string,
          requestId: string,
          operations: { type: "array", items: op, minItems: 1, maxItems: 256 },
        },
        ["target", "requestId", "operations"]
      ),
      async executor(args, ctx) {
        const board = check(ctx);
        target(args, ctx);
        const valid = board.captureSubmission();
        const checkWrite = () => {
          check(ctx);
          if (
            !valid() ||
            !writable() ||
            binding.gesture ||
            (args.operations instanceof Array &&
              args.operations.some(
                op => op && [op.id, op.from, op.to].some(id => board.isEditingElements.includes(id))
              ))
          )
            throw new Error("画布当前只读或正在编辑，请结束手势后重试");
        };
        checkWrite();
        if (
          !ctx?.conversationKey ||
          typeof args.requestId !== "string" ||
          !Array.isArray(args.operations) ||
          !args.operations.length ||
          args.operations.length > 256 ||
          args.operations.some(item => !item || typeof item !== "object" || Array.isArray(item))
        )
          throw new Error("白板批次参数无效");
        const lease = client.leaseId;
        if (!lease) throw new Error("白板会话已关闭");
        await client.flush();
        checkWrite();
        const signal = ctx.signal ? AbortSignal.any([ctx.signal, lifetime]) : lifetime;
        const result = await apply(
          lease,
          {
            owner: ctx.conversationKey,
            requestId: args.requestId,
            pageId,
            operations: args.operations,
          },
          signal
        );
        if (result.error || result.projectedRevision < result.operationRevision)
          throw new Error("白板已记录，投影待恢复；请用原请求 ID 重试：" + (result.error ?? ""));
        if (!lifetime.aborted) {
          try {
            await client.observeRevision(result.operationRevision);
          } catch (error) {
            throw new Error("白板已保存，但画布尚未确认显示；可按原请求 ID 重试：" + String(error));
          }
        }
        show(
          ctx,
          args.operations.map(o => result.ids[o.id] ?? o.id).filter(id => typeof id === "string")
        );
        return {
          content: JSON.stringify({
            ids: result.ids,
            revision: result.operationRevision,
            localSaved: true,
            shared: remote?.confirmationFor(result.operationRevision) ?? "local",
          }),
        };
      },
    },
  ];
}
