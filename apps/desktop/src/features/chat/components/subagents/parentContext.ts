import { createContext, useContext } from "react";
import type { SubagentParentRef } from "@/types/subagent";

/** 当前对话作为子 Agent 父会话的身份：对话容器提供，任务卡 / 顶部入口 / 详情按它读取 */
export const SubagentParentContext = createContext<SubagentParentRef | undefined>(undefined);

export const useSubagentParent = () => useContext(SubagentParentContext);
