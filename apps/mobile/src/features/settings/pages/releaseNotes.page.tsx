// 更新内容页：关于页「更新内容」进入，内容取应用内更新的检查结果。

import { ReleaseNotesPage } from "../about/ReleaseNotesPage";
import { definePage } from "../../../router";

export default definePage({
  key: "releaseNotes",
  match: "single",
  params: {},
  component: ReleaseNotesPage,
});
