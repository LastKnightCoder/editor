import { Fragment, useEffect, useState } from "react";
import type { ReactNode } from "react";

/**
 * 媒体模态宿主（desktop）：
 * 各 MediaInsertSource 的 open 实现经 showMediaNode 命令式挂载自带
 * Dialog 的弹窗组件，由挂在应用根部的 MediaModalHost 统一渲染。
 * 支持并发多个弹窗（多槽互不覆盖），close 仅卸载自己的槽位。
 */

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
