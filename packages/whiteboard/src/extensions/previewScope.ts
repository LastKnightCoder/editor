import { bindWhiteboardAuthorAPI } from "./authorApi";
import type { WhiteboardAPI } from "./api";
import type { WhiteboardAuthorBridge } from "./authorTypes";
import type { WhiteboardElement } from "./authorTypes";
import type { BoardElement } from "../types/element";
import type { CreationPreviewSession } from "../interactions/CreationPreviewSession";
import { createSnapshotReader } from "./snapshot";
import { resolveBoardAccess } from "./access";

function draftSnapshot(node: BoardElement): WhiteboardElement {
  return {
    id: node.id,
    type: node.type,
    name: node.name,
    style: node.style,
    data: node.data ?? {},
    geometry: {
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      rotation: node.rotation ?? 0,
    },
    children: (node.children ?? []).map(draftSnapshot),
  };
}

/** 预览渲染复用作者接口，只替换草稿读取与写入权限。 */
export function createPreviewScope(
  sourceAPI: WhiteboardAPI,
  owner: string,
  session: CreationPreviewSession,
  authorBridge: () => WhiteboardAuthorBridge | undefined,
  active: () => boolean
) {
  const readSnapshot = createSnapshotReader();
  const assertActive = () => {
    if (!active() || !session.active) throw new Error("创建预览已失效");
  };
  const reject = () => {
    throw new Error("创建预览只读");
  };
  const api: WhiteboardAPI = Object.freeze(
    Object.create(sourceAPI, {
      readonly: { value: true },
      captureSubmission: { value: () => () => false },
      getElement: {
        value: (id: string) => {
          assertActive();
          return readSnapshot(session.getElement(id) ?? sourceAPI.getElement(id));
        },
      },
      subscribe: {
        value: (listener: () => void) => {
          assertActive();
          const stopPreview = session.subscribe(listener);
          const stopDocument = sourceAPI.subscribe(listener);
          const stop = () => {
            stopPreview();
            stopDocument();
          };
          const stopLifecycle = session.onDispose(stop);
          return () => {
            stopLifecycle();
            stop();
          };
        },
      },
      submit: { value: reject },
      apply: { value: reject },
      updateElement: { value: reject },
      select: { value: reject },
      setActiveTool: { value: reject },
      emit: { value: reject },
      execute: { value: () => Promise.reject(new Error("创建预览只读")) },
    })
  );
  const bridge = () => {
    assertActive();
    const source = authorBridge();
    if (!source) return;
    return {
      ...source,
      canWrite: () => false,
      getElement: (id: string) => {
        assertActive();
        const node = session.getElement(id);
        if (!node) return source.getElement(id);
        return readSnapshot(draftSnapshot(node));
      },
      getTextBinding: (requester: string, id: string, field: string) => {
        assertActive();
        const node = session.getElement(id);
        if (!node) return source.getTextBinding(requester, id, field);
        const runtime = resolveBoardAccess(sourceAPI).extensions;
        if (requester !== owner || runtime?.authorOfType(node.type) !== owner)
          throw new Error("插件不拥有此版本的内部编辑权限");
        const definition = runtime.getElementDefinition(node.type);
        if (!definition?.collaboration?.textFields?.includes(field))
          throw new Error("文本字段未声明");
        return session.textField(id, element => {
          const value = element.data?.[field];
          return typeof value === "string" ? value : "";
        });
      },
    };
  };
  const dispose = bindWhiteboardAuthorAPI(api, owner, bridge, () => active() && session.active);
  return { api, dispose };
}
