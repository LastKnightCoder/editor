import { createContext } from "react";

// 实例开关通过 Context 穿透 Slate 的元素 memo。
export const ShowDragHandleContext = createContext(true);
