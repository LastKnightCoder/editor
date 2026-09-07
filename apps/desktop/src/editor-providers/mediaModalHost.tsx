import { Fragment, useEffect, useState } from "react";
import type { ReactNode } from "react";

import CustomModal from "@/components/CustomModal";

/**
 * 媒体模态宿主（desktop）：
 * 各 MediaInsertSource 的 open 实现经 showMediaModal / showMediaNode
 * 命令式弹出 UI，由挂在应用根部的 MediaModalHost 统一渲染。
 * 弹窗统一使用 CustomModal，保持应用内视觉一致。
 * 支持并发多个弹窗（多槽互不覆盖），close 仅卸载自己的槽位。
 */

interface MediaModalDescriptor {
  title: string;
  width?: number;
  /** close 用于业务完成后收起弹窗 */
  content: (close: () => void) => ReactNode;
}

interface MountedMediaModal {
  id: number;
  node: ReactNode;
}

let mountNode: ((nodes: MountedMediaModal[]) => void) | null = null;
let mounted: MountedMediaModal[] = [];
let slotIdCounter = 0;

const syncMount = () => {
  mountNode?.([...mounted]);
};

/** 挂载自包含的模态组件（组件内部自带弹窗实现），返回卸载函数 */
export function showMediaNode(node: ReactNode): () => void {
  const id = ++slotIdCounter;
  mounted = [...mounted, { id, node }];
  syncMount();
  return () => {
    mounted = mounted.filter(item => item.id !== id);
    syncMount();
  };
}

/** 以 CustomModal 包裹业务面板内容弹出，返回关闭函数 */
export function showMediaModal(descriptor: MediaModalDescriptor): () => void {
  const close = showMediaNode(
    <CustomModal
      open
      title={descriptor.title}
      footer={null}
      width={descriptor.width ?? 640}
      onCancel={() => close()}
      destroyOnClose
    >
      {descriptor.content(() => close())}
    </CustomModal>
  );
  return close;
}

/** 应用根部挂载一次 */
export function MediaModalHost() {
  const [nodes, setNodes] = useState<MountedMediaModal[]>([]);

  useEffect(() => {
    mountNode = setNodes;
    return () => {
      mountNode = null;
    };
  }, []);

  return (
    <>
      {nodes.map(item => (
        <Fragment key={item.id}>{item.node}</Fragment>
      ))}
    </>
  );
}
