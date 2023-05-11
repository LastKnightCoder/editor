import { useState } from "react";
import { Button } from "antd";

import { createEditor, Descendant } from 'slate';
import { Slate, Editable, withReact } from 'slate-react';
import { withHistory } from 'slate-history';

import {applyPlugin, getElementParent, getLeafParent, registerHotKey, isAtParagraphStart } from "./utils";
import { initValue as defaultValue } from "./configs";
import { withMarkdownShortcuts, withOverrideSettings, withQuitMode, withInsertBreak, withDeleteBackward } from "./plugins";
import hotKeyConfigs from "./hotkeys";
import { renderElement, renderLeaf } from "./renderMethods";
import { usePressedKeyStore } from "./stores";


const App = () => {
  const plugins = [withReact, withHistory, withOverrideSettings, withMarkdownShortcuts, withQuitMode, withInsertBreak, withDeleteBackward];
  const [editor] = useState(() => applyPlugin(createEditor(), plugins));
  const [initValue] = useState(() => {
    const content = localStorage.getItem('content');
    if (content) {
      return JSON.parse(content);
    }
    return defaultValue;
  });
  const [value, setValue] = useState<Descendant[]>(initValue);

  const { listenKeyPressed, resetPressedKey } = usePressedKeyStore(state => ({
    listenKeyPressed: state.listenKeyPressed,
    resetPressedKey: state.resetPressedKey,
  }));


  const save = (value: Descendant[]) => {
    localStorage.setItem('content', JSON.stringify(value));
    setValue(value);
  }

  const clear = () => {
    localStorage.clear();
    window.location.reload();
  }

  const handleGetLeafParent = () => {
    const curLeafNode = getLeafParent(editor);
    console.log('::curLeafNode', curLeafNode);
  }

  const handleGetElementParent = () => {
    const curEle = getElementParent(editor);
    console.log('::curEle', curEle);
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', overflow: 'hidden' }}>
      <Slate editor={editor} value={initValue} onChange={save} >
        <div>
          <Editable
            style={{ flex: 2, padding: '50px 40px', minWidth: '800px' }}
            renderElement={renderElement(editor)}
            renderLeaf={renderLeaf(editor)}
            onKeyDown={(event) => {
              registerHotKey(editor, event, hotKeyConfigs);
              listenKeyPressed(event);
            }}
            onKeyUp={() => {
              resetPressedKey();}
            }
          />
          <Button onClick={clear}>清除数据并刷新页面</Button>
          <Button onClick={handleGetLeafParent} >获取当前叶子节点的父节点</Button>
          <Button onClick={handleGetElementParent} >获取当前元素节点的父节点</Button>
          <Button onClick={() => { console.log('::isAtParagraphStart', isAtParagraphStart(editor)) }} >是否在段落开头</Button>
        </div>
      </Slate>
      {/*<Button onClick={() => { const curEle = getFarthestCurrentElement(editor); console.log('::curEle', curEle); const curLeafNode =  getCurrentTextNode(editor); console.log('::curLeafNode', curLeafNode) }} >获取当前</Button>*/}
      <pre style={{ maxHeight: '100vh', overflow: 'auto', padding: 40, margin: 0, boxSizing: 'border-box' }}>
        <code>{JSON.stringify(value, null, 2)}</code>
      </pre>
    </div>
  )
}

export default App;