import { EditorLabPage } from "../EditorLabPage";
import { definePage } from "../../../router";

// 仅开发构建注册；生产构建中 import.meta.env.DEV 为常量 false，页面定义与组件代码被摇树移除
export default import.meta.env.DEV
  ? definePage({
      key: "editorLab",
      match: "single",
      params: {},
      component: EditorLabPage,
    })
  : null;
