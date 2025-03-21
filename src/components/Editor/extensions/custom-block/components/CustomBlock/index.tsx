import React, { PropsWithChildren, useEffect, useMemo, useRef } from "react";
import ReactDOM from "react-dom/client";
import { RenderElementProps, useSlate, ReactEditor } from "slate-react";
import { Transforms } from "slate";
import * as Babel from "@babel/standalone";
import * as antd from "antd";
import * as antdIcons from "@ant-design/icons";
import useTheme from "../../../../hooks/useTheme";

import styles from "./index.module.less";

import { type CustomBlockElement } from "@/components/Editor/types";
import PreviewWithEditor from "@/components/Editor/components/PreviewWithEditor";

interface CustomBlockProps {
  attributes: RenderElementProps["attributes"];
  element: CustomBlockElement;
}

const CustomBlock = (props: { content: string }) => {
  const [availableCode, setAvailableCode] = React.useState<string>("");
  const ref = useRef<HTMLDivElement>(null);
  const { isDark } = useTheme();
  const { content } = props;

  const code = useMemo(() => {
    const prefix = `const { antd } = components;\n`;
    const suffix = `
    if (typeof Component === 'function') {
      const App = () => {
        const { ConfigProvider, theme } = antd;
        return (
          <ConfigProvider
            theme={{
              algorithm: ${isDark} ? theme.darkAlgorithm : theme.defaultAlgorithm,
            }}
          >
            <Component />
          </ConfigProvider>
        )
      }
      const root = ReactDOM.createRoot(el);
      root.render(<App />);
    }`;
    const normalizedCode = `${prefix}${content}${suffix}`;
    try {
      const code =
        Babel.transform(normalizedCode, {
          presets: [
            Babel.availablePresets["react"],
            [
              Babel.availablePresets["typescript"],
              {
                onlyRemoveTypeImports: true,
                allExtensions: true,
                isTSX: true,
              },
            ],
          ],
        }).code || "";
      setAvailableCode(code);
      return code;
    } catch (e) {
      return availableCode;
    }
  }, [content, availableCode, isDark]);

  useEffect(() => {
    const AsyncFunction = Object.getPrototypeOf(
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      async function () {},
    ).constructor;
    const fn = new AsyncFunction(
      "React",
      "ReactDOM",
      "el",
      "components",
      "hooks",
      "extraInfo",
      code + "\nreturn root;",
    );

    try {
      const root = fn(
        React,
        ReactDOM,
        ref.current,
        { antd, antdIcons },
        { useTheme },
        { isDark },
      );

      return () => {
        root?.then((s: any) => {
          s?.unmount?.();
        });
      };
    } catch (e) {
      console.error(e);
    }
  }, [code]);

  return <div ref={ref}></div>;
};

const CustomBlockElement: React.FC<PropsWithChildren<CustomBlockProps>> = (
  props,
) => {
  const { attributes, children, element } = props;
  const { content } = element;

  const editor = useSlate();
  const handleChange = (content: string) => {
    Transforms.setNodes(
      editor,
      { content },
      { at: ReactEditor.findPath(editor, element) },
    );
  };

  return (
    <div className={styles.container} {...attributes}>
      <PreviewWithEditor
        mode={"jsx"}
        initValue={content}
        element={element}
        onChange={handleChange}
      >
        {content ? (
          <CustomBlock content={content} />
        ) : (
          <div className={styles.empty}>点击编辑代码</div>
        )}
      </PreviewWithEditor>
      {children}
    </div>
  );
};

export default CustomBlockElement;
