// 内容协作绑定查询（轻量，不加载协作运行时）：详情页入口挂载/刷新时查询该内容
// 是否绑定协作房间（collaboration_bindings 仅记录本机发起的共享），有绑定时详情页
// 原地切换为协作编辑。查询失败按无绑定处理，常规编辑兜底由数据库层守卫拦截。
import { useEffect, useState } from "react";
import * as tauri from "../../services/tauri";
import type { CollaborationBinding } from "../../types";

export function useContentCollabBinding(contentId: number | undefined, refreshKey?: number) {
  const [binding, setBinding] = useState<CollaborationBinding | null>(null);
  useEffect(() => {
    if (!contentId || contentId <= 0) {
      setBinding(null);
      return;
    }
    let cancelled = false;
    tauri
      .collabGetBinding(contentId)
      .then(result => {
        if (!cancelled) setBinding(result ?? null);
      })
      .catch(() => {
        if (!cancelled) setBinding(null);
      });
    return () => {
      cancelled = true;
    };
  }, [contentId, refreshKey]);
  return binding;
}

