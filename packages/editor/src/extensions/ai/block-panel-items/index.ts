import { Sparkles } from "lucide-react";
import { ReactEditor } from "slate-react";
import { Editor, NodeEntry, Path, Transforms } from "slate";
import {
  CodeBlockElement,
  IBlockPanelListItem,
} from "../../../types";
import type {
  ChatModelConfig,
  ChatProviderConfig,
} from "../../../types/services";
import {
  insertAIBlock,
  insertBulletList,
  insertCodeBlock,
  insertHeader,
  insertNumberedList,
} from "../../../utils";
import { codeBlockMap } from "../../../extensions/code-block";
import { Role, CONTINUE_WRITE_PROMPT_TEMPLATE } from "../../../constants";

type ContinueWriteProviderConfig = {
  id: string;
  models?: Array<{ name: string }>;
};

const items: IBlockPanelListItem[] = [
  {
    icon: Sparkles,
    title: "AI续写",
    keywords: ["ai", "AI续写"],
    description: "AI续写",
    onClick: async (editor) => {
      const path = insertAIBlock(editor);

      if (!path) {
        return;
      }

      const ParserCtor = editor.services?.utility.CommandParser;
      if (!ParserCtor) {
        console.warn("CommandParser 未提供，无法执行 AI 续写");
        return;
      }

      const parser = new ParserCtor();
      const chatStream = editor.services?.ai?.chatLLMStream;
      if (!chatStream) {
        console.warn("chatLLMStream 未注入，无法执行 AI 续写");
        return;
      }

      const getMarkdown =
        editor.services?.utility.getMarkdown ??
        ((nodes: any) => JSON.stringify(nodes));

      // 获取AI续写功能的配置
      const llmConfigs = editor.services?.settings.get('llmConfigs');
      const llmUsageSettings = editor.services?.settings.get('llmUsageSettings');
      const usageConfig = llmUsageSettings?.aiContinueWrite;

      if (!usageConfig) {
        console.error("AI续写功能未配置LLM");
        return;
      }

      const providerList: ContinueWriteProviderConfig[] = Array.isArray(llmConfigs)
        ? (llmConfigs as ContinueWriteProviderConfig[])
        : [];

      const providerConfig = providerList.find(
        (config) => config.id === usageConfig.providerId,
      );
      if (!providerConfig) {
        console.error("找不到AI续写功能的provider配置");
        return;
      }

      const modelConfig = providerConfig.models?.find(
        (model) =>
          model.name === usageConfig.modelName ||
          (model as ChatModelConfig).id === usageConfig.modelName,
      );
      if (!modelConfig) {
        console.error("找不到AI续写功能的model配置");
        return;
      }

      // 开始续写
      chatStream(
        providerConfig as unknown as ChatProviderConfig,
        modelConfig as unknown as ChatModelConfig,
        [
          {
            role: Role.System,
            content: [
              {
                type: "text",
                text: CONTINUE_WRITE_PROMPT_TEMPLATE,
              },
            ],
          },
          {
            role: Role.User,
            content: [
              {
                type: "text",
                text: getMarkdown(editor.children),
              },
            ],
          },
        ],
        {
          onError: (e) => {
            console.error(e);
            parser.error();
          },
          onUpdate: (_full, incrementalText) => {
            parser.addText(incrementalText);
          },
          onFinish: () => {
            parser.finish();
          },
        },
      );

      let currentCodeBlock:
        | {
            path: Path;
            element: CodeBlockElement;
            code: string;
          }
        | undefined;

      let preCommandType = "";

      for await (const command of parser) {
        if (!command) continue;
        const cmd = command as any;
        try {
          if (cmd.type === "insert-text") {
            editor.select(Editor.end(editor, path));
            editor.insertText(cmd.text);
            // editor.select(Editor.end(editor, path));
          } else if (cmd.type === "insert-header") {
            editor.select(Editor.end(editor, path));
            const { level = 1 } = cmd as { level?: 1 | 2 | 3 | 4 | 5 | 6 };
            insertHeader(editor, level);
          } else if (cmd.type === "insert-delete") {
            editor.select(Editor.end(editor, path));
            editor.deleteBackward("character");
          } else if (cmd.type === "insert-bulleted-list") {
            editor.select(Editor.end(editor, path));
            insertBulletList(editor);
          } else if (cmd.type === "insert-numbered-list") {
            editor.select(Editor.end(editor, path));
            insertNumberedList(editor);
          } else if (cmd.type === "insert-break") {
            editor.select(Editor.end(editor, path));
            if (preCommandType === "insert-code-end") {
              continue;
            }
            editor.insertBreak();
          } else if (cmd.type === "insert-inline-code-start") {
            editor.select(Editor.end(editor, path));
            editor.addMark("code", true);
          } else if (cmd.type === "insert-inline-code") {
            editor.select(Editor.end(editor, path));
            editor.insertText(cmd.code);
          } else if (cmd.type === "insert-inline-code-end") {
            editor.select(Editor.end(editor, path));
            editor.removeMark("code");
          } else if (cmd.type === "insert-code-start") {
            editor.select(Editor.end(editor, path));
            const { language = "" } = cmd as { language?: string };
            const codePath = insertCodeBlock(editor, language);
            if (codePath) {
              const entry = Editor.node(editor, codePath);
              if (entry) {
                const [element] = entry as NodeEntry<CodeBlockElement>;
                currentCodeBlock = {
                  path: codePath,
                  element,
                  code: "",
                };
              }
            }
            ReactEditor.deselect(editor);
          } else if (cmd.type === "insert-code") {
            if (currentCodeBlock) {
              const { element, code: preCode } = currentCodeBlock;
              const codeEditor = codeBlockMap.get(element.uuid);
              const { code = "" } = cmd as { code?: string };
              const newCode = preCode + code;
              currentCodeBlock.code = newCode;
              if (codeEditor) {
                codeEditor.setValue(newCode);
                const doc = codeEditor.getDoc();
                const lastPos = doc.posFromIndex(doc.getValue().length);
                // codeEditor.focus();
                codeEditor.setCursor(lastPos);
              }
            }
          } else if (cmd.type === "insert-code-end") {
            if (currentCodeBlock) {
              const { path, code } = currentCodeBlock;
              Transforms.setNodes(editor, { code }, { at: path });
              // ReactEditor.focus(editor);
              const { path: codePath } = currentCodeBlock;
              const nextPath = Path.next(codePath);
              Transforms.insertNodes(
                editor,
                {
                  type: "paragraph",
                  children: [{ type: "formatted", text: "" }],
                },
                {
                  at: nextPath,
                  select: true,
                },
              );
              currentCodeBlock = undefined;
            }
          }
        } catch (e) {
          console.error(e);
        } finally {
          preCommandType = cmd.type;
        }
      }

      Transforms.setNodes(
        editor,
        {
          isFinished: true,
        },
        {
          at: path,
        },
      );
    },
  },
];

export default items;
