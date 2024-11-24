import { CodeBlockElement, IBlockPanelListItem } from "@editor/types";
import { insertAIBlock, insertBulletList, insertCodeBlock, insertHeader, insertNumberedList } from "@editor/utils";
import { chatLLMStream } from "@/hooks/useChatLLM.ts";
import { CommandParser, getMarkdown } from '@/utils';
import { CONTINUE_WRITE_PROMPT_TEMPLATE, Role } from '@/constants';
import { Editor, NodeEntry, Path, Transforms } from "slate";
import { codeBlockMap } from "@editor/extensions/code-block";
import { ReactEditor } from "slate-react";
// import { ReactEditor } from "slate-react";

const items: IBlockPanelListItem[] = [{
  icon: 'ai',
  title: 'AI续写(Beta)',
  keywords: ['ai', 'AI续写'],
  description: 'AI续写',
  onClick: async (editor) => {
    const path = insertAIBlock(editor);

    if (!path) {
      return;
    }

    const parser = new CommandParser();

    // 开始续写
    chatLLMStream([{
      role: Role.System,
      content: CONTINUE_WRITE_PROMPT_TEMPLATE,
    }, {
      role: Role.User,
      content: getMarkdown(editor.children)
    }], {
      onError: (e) => {
        console.error(e)
        parser.error();
      },
      onUpdate: (_full, incrementalText) => {
        parser.addText(incrementalText);
      },
      onFinish: (fullText) => {
        console.log('fullText: \n', fullText);
        parser.finish();
      },
    });

    let currentCodeBlock: {
      path: Path;
      element: CodeBlockElement;
      code: string;
    } | undefined;

    let preCommandType = '';

    for await(const command of parser) {
      if (!command) continue;
      // console.log('command: ', command);
      try {
        if (command.type === 'insert-text') {
          editor.select(Editor.end(editor, path));
          editor.insertText(command.text);
          // editor.select(Editor.end(editor, path));
        } else if (command.type === 'insert-header') {
          editor.select(Editor.end(editor, path));
          const { level } = command;
          insertHeader(editor, level);
        } else if (command.type === 'insert-delete') {
          editor.select(Editor.end(editor, path));
          editor.deleteBackward("character");
        } else if (command.type === 'insert-bulleted-list') {
          editor.select(Editor.end(editor, path));
          insertBulletList(editor);
        } else if (command.type === 'insert-numbered-list') {
          editor.select(Editor.end(editor, path));
          insertNumberedList(editor);
        } else if (command.type === 'insert-break') {
          editor.select(Editor.end(editor, path));
          if (preCommandType === 'insert-code-end') {
            continue;
          }
          editor.insertBreak();
        } else if (command.type === 'insert-inline-code-start') {
          editor.select(Editor.end(editor, path));
          editor.addMark('code', true);
        } else if (command.type === 'insert-inline-code') {
          editor.select(Editor.end(editor, path));
          editor.insertText(command.code);
        } else if (command.type === 'insert-inline-code-end') {
          editor.select(Editor.end(editor, path));
          editor.removeMark('code');
        } else if (command.type === 'insert-code-start') {
          editor.select(Editor.end(editor, path));
          const { language } = command;
          const codePath = insertCodeBlock(editor, language);
          if (codePath) {
            const entry = Editor.node(editor, codePath);
            if (entry) {
              const [element] = entry as NodeEntry<CodeBlockElement>;
              currentCodeBlock = {
                path: codePath,
                element,
                code: ""
              };
            }
          }
          ReactEditor.deselect(editor);
        } else if (command.type === 'insert-code') {
          if (currentCodeBlock) {
            const { element, code: preCode } = currentCodeBlock;
            const codeEditor = codeBlockMap.get(element.uuid);
            const { code } = command;
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
        } else if (command.type === 'insert-code-end') {
          if (currentCodeBlock) {
            const { path, code } = currentCodeBlock;
            Transforms.setNodes(editor, { code }, { at: path });
            // ReactEditor.focus(editor);
            const { path: codePath } = currentCodeBlock;
            const nextPath = Path.next(codePath);
            Transforms.insertNodes(editor, {
              type: 'paragraph',
              children: [{ type: 'formatted', text: '' }],
            }, {
              at: nextPath,
              select: true,
            });
            currentCodeBlock = undefined;
          }
        }
      } catch (e) {
        console.error(e);
      } finally {
        preCommandType = command.type;
      }
    }

    Transforms.setNodes(editor, {
      isFinished: true,
    }, {
      at: path
    })
  }
}]

export default items;
