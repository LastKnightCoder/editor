import { useState } from "react";
import { Button } from "antd";

import { createEditor, Descendant } from 'slate';
import { Slate, Editable, withReact } from 'slate-react';
import { withHistory } from 'slate-history';

import { getFarthestCurrentElement, getCurrentTextNode, applyPlugin, registerHotKey } from "./utils";
import { initValue as defaultValue } from "./configs";
import { withMarkdownShortcuts, withOverrideSettings } from "./plugins";
import hotKeyConfigs from "./hotkeys";
import { renderElement, renderLeaf } from "./renderMethods";


const App = () => {
  const [editor] = useState(() => applyPlugin(createEditor(), [withReact, withHistory, withOverrideSettings, withMarkdownShortcuts]));
  const [initValue] = useState(() => {
    const content = localStorage.getItem('content');
    if (content) {
      return JSON.parse(content);
    }
    return defaultValue;
  });
  const [value, setValue] = useState<Descendant[]>(initValue);


  const save = (value: Descendant[]) => {
    localStorage.setItem('content', JSON.stringify(value));
    setValue(value);
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', overflow: 'hidden' }}>
      <Slate editor={editor} value={initValue} onChange={save} >
        <Editable
          style={{ flex: 2, padding: '50px 40px', minWidth: '800px' }}
          renderElement={renderElement(editor)}
          renderLeaf={renderLeaf(editor)}
          onKeyDown={(event) => {
            registerHotKey(editor, event, hotKeyConfigs);
          }}
        />
      </Slate>
      <pre style={{ maxHeight: '100vh', overflow: 'auto', padding: 40, margin: 0, boxSizing: 'border-box' }}>
        <code>{JSON.stringify(value, null, 2)}</code>
      </pre>
      <Button onClick={() => { const curEle = getFarthestCurrentElement(editor); console.log('::curEle', curEle); const curLeafNode =  getCurrentTextNode(editor); console.log('::curLeafNode', curLeafNode) }} >获取当前</Button>
    </div>
  )
}

export default App;