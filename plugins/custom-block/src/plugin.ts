import { definePlugin } from "@tau/plugins";
import { customBlockExtension } from "./index";
import { customBlockCodec } from "./markdown";
import content from "../SKILL.md";
import manifest from "../manifest.json";

export default definePlugin({
  id: manifest.id,
  name: manifest.name,
  version: manifest.version,
  editorExtensions: [customBlockExtension],
  editorCodecs: [customBlockCodec],
  skills: [
    {
      id: "authoring",
      name: "自定义组件块",
      description:
        "用户要求可交互的 React、DOM、Canvas 演示时加载，按运行时契约与主题规范生成 custom-block。",
      content,
    },
  ],
});
