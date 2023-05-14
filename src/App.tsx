import { useState } from "react";
// import { Button } from "antd";

import { createEditor, Descendant } from 'slate';
import { Slate, Editable, withReact } from 'slate-react';
import { withHistory } from 'slate-history';

import { applyPlugin, registerHotKey } from "./utils";
import { initValue as defaultValue } from "./configs";
import { withMarkdownShortcuts, withOverrideSettings, withInsertBreak, withDeleteBackward, withPasteImage } from "./plugins";
import hotKeyConfigs from "./hotkeys";
import { renderElement, renderLeaf } from "./renderMethods";
import { useFocusStore, usePressedKeyStore } from "./stores";

import ImagesOverview from "./components/ImagesOverview";

const App = () => {
  const plugins = [withReact, withHistory, withOverrideSettings, withMarkdownShortcuts, withInsertBreak, withDeleteBackward, withPasteImage];
  const [editor] = useState(() => applyPlugin(createEditor(), plugins));
  const [initValue] = useState(() => {
    const content = localStorage.getItem('content');
    if (content) {
      return JSON.parse(content);
    }
    return defaultValue;
  });
  // const [value, setValue] = useState<Descendant[]>(initValue);

  const { listenKeyPressed, resetPressedKey, isReset } = usePressedKeyStore(state => ({
    listenKeyPressed: state.listenKeyPressed,
    resetPressedKey: state.resetPressedKey,
    isReset: state.isReset
  }));

  const { setFocus } = useFocusStore(state => ({
    setFocus: state.setFocus
  }));

  const save = (value: Descendant[]) => {
    localStorage.setItem('content', JSON.stringify(value));
    // setValue(value);
  }

  // const clear = () => {
  //   localStorage.clear();
  //   window.location.reload();
  // }

  return (
    <div>
      <Slate editor={editor} value={initValue} onChange={save} >
        <div style={{ margin: '10px auto', minWidth: '600px', maxWidth: '800px', }}>
          <Editable
            renderElement={renderElement(editor)}
            renderLeaf={renderLeaf()}
            onKeyDown={(event) => {
              registerHotKey(editor, event, hotKeyConfigs);
              listenKeyPressed(event);
            }}
            onKeyUp={() => {
              // 防止重复触发，频繁更新组件，编辑体验不好
              if (!isReset) {
                resetPressedKey();
              }
            }}
            onFocus={() => {
              setFocus(true);
            }}
            onBlur={() => {
              setFocus(false);
            }}
          />
          <ImagesOverview />
          {/*<Button onClick={clear}>清除数据并刷新页面</Button>*/}
        </div>
      </Slate>
      {/*<pre style={{ maxHeight: '100vh', overflowX: 'hidden', margin: 0, boxSizing: 'border-box' }}>*/}
      {/*  <code>{JSON.stringify(value, null, 2)}</code>*/}
      {/*</pre>*/}
    </div>
  )
}

export default App;