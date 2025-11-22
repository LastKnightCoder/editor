import { useCreation } from "ahooks";
import { useEffect } from "react";
import { v4 as uuid } from "uuid";

interface ScriptProps {
  src: string;
}

const Script = (props: ScriptProps) => {
  const { src } = props;
  const id = useCreation(() => {
    return `script-${uuid()}`;
  }, []);
  useEffect(() => {
    const script: HTMLScriptElement = document.createElement("script");
    script.id = id;
    script.type = "text/javascript";
    script.src = src;
    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
    };
  }, [src]);

  return null;
};

export default Script;
