/* eslint-disable react-refresh/only-export-components -- 页面声明由宿主 glob 注册。 */
import { definePage } from "../../../router";
import { McpPage } from "../McpPage";

export default definePage({
  key: "aiMcp",
  match: "single",
  params: {},
  component: McpPage,
});
