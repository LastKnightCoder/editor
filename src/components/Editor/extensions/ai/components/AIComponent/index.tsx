import { IExtensionBaseProps } from "@editor/extensions/types.ts";
import { AIElement } from "@editor/types/element/ai.ts";
import { Button, Flex, Popover } from "antd";
import { Editor, Transforms, Element } from "slate";
import { ReactEditor, useSlate } from "slate-react";

const AIComponent = (props: IExtensionBaseProps<AIElement>) => {
  const { element, attributes, children } = props;

  const isFinished = element.isFinished;

  const editor = useSlate();

  const apply = () => {
    // 将结果 unwrap
    Transforms.unwrapNodes(editor, {
      match: n =>
        !Editor.isEditor(n) && Element.isElement(n) && n.type === 'ai',
    })
  }

  const deleteBlock = () => {
    const path = ReactEditor.findPath(editor, element);
    if (!path) return;
    Transforms.delete(editor, {
      at: path
    })
  }

  return (
    <Popover
      open={!!isFinished}
      content={(
        <Flex gap={12}>
          <Button onClick={apply}>应用</Button>
          <Button onClick={deleteBlock}>删除</Button>
        </Flex>
      )}
    >
      <div style={{ color: 'red' }} {...attributes}>
        {children}
      </div>
    </Popover>
  )
}

export default AIComponent;
