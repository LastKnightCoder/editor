import { useRef, useEffect } from 'react';
import mermaid from 'mermaid';
// import { useAsyncEffect } from "ahooks";

import { defaultMermaidConfig } from "../MermaidChart/config.ts";

mermaid.initialize(defaultMermaidConfig);

interface IMermaidProps {
  chart: string;
}

const Mermaid = (props: IMermaidProps) => {
  const { chart } = props;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    mermaid.contentLoaded();
  }, []);

  return (
    <div className={'mermaid'} style={{ width: '100%', padding: 20 }} ref={ref}>
      {chart}
    </div>
  )
}

export default Mermaid;