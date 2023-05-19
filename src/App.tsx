import { useState, useEffect } from "react";

import { createEditor, Descendant, Editor } from 'slate';
import { Slate, Editable, withReact } from 'slate-react';
import { withHistory } from 'slate-history';

import { applyPlugin, registerHotKey } from "./utils";
import { initValue as defaultValue } from "./configs";
import { withMarkdownShortcuts, withOverrideSettings, withInsertBreak, withDeleteBackward, withPasteImage } from "./plugins";
import hotKeyConfigs from "./hotkeys";
import { renderElement, renderLeaf } from "./renderMethods";
import {useFocusStore, useGithubStore, usePressedKeyStore} from "./stores";

import ImagesOverview from "./components/ImagesOverview";
import { MathJaxContext } from "better-react-mathjax";
import { Button, Drawer } from "antd";
import Command from "./components/Command";

const config = {
  loader: { load: ["[tex]/html"] },
  tex: {
    packages: { "[+]": ["html"] },
    inlineMath: [
      ["$", "$"],
      ["\\(", "\\)"]
    ],
    displayMath: [
      ["$$", "$$"],
      ["\\[", "\\]"]
    ]
  }
};

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
  const [isNormalized, setIsNormalized] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isNormalized) {
      Editor.normalize(editor, { force: true });
      setIsNormalized(true);
    }
  });

  useEffect(() => {
    const {
      setBranches,
      setRepo,
      setToken,
      setUserInfo,
      setBranch,
      setRepos,
    } = useGithubStore.getState();
    const token = localStorage.getItem('github_token') || '';
    const user = JSON.parse(localStorage.getItem('github_user') || '{}') || null;
    const repo = localStorage.getItem('github_repo') || '';
    const branches = JSON.parse(localStorage.getItem('github_branches') || '[]');
    const repos = JSON.parse(localStorage.getItem('github_repos') || '[]');
    const branch = localStorage.getItem('github_branch') || '';
    setToken(token);
    setUserInfo(user);
    setRepo(repo);
    setBranches(branches);
    setRepos(repos);
    setBranch(branch);
  }, []);

  const [value, setValue] = useState<Descendant[]>(initValue);

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
    setValue(value);
  }

  const clear = () => {
    localStorage.removeItem('content');
    window.location.reload();
  }

  return (
    <div>
      <MathJaxContext config={config}>
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
            <Command />
            <div style={{ position: 'fixed', right: 10, top: 10 }}>
              <Button onClick={clear}>清除数据并刷新页面</Button>
              <Button style={{ marginLeft: 10 }} onClick={() => setOpen(true)}>查看数据</Button>
            </div>
          </div>
        </Slate>
      </MathJaxContext>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        width={600}
      >
        <pre>
          <code>{JSON.stringify(value, null, 2)}</code>
        </pre>
      </Drawer>
    </div>
  )
}

export default App;