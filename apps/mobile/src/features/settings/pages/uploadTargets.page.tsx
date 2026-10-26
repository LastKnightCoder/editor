// 上传位置列表页：「图片与附件」页「更换位置」进入。

import { UploadTargetsPage } from "../upload/UploadTargetsPage";
import { definePage } from "../../../router";

export default definePage({
  key: "uploadTargets",
  match: "single",
  params: {},
  component: UploadTargetsPage,
});
