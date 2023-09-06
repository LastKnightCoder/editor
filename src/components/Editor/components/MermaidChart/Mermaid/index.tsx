import { useRef, useEffect } from 'react';
import mermaid from 'mermaid';
import { useAsyncEffect } from "ahooks";

import { defaultMermaidConfig } from "@/components/Editor/components/MermaidChart/config.ts";

mermaid.initialize(defaultMermaidConfig);

interface IMermaidProps {
  chart: string;
}

const Mermaid = (props: IMermaidProps) => {
  const { chart } = props;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    mermaid.init(undefined, ref.current);
  }, [])

  useAsyncEffect(async () => {
    if (!ref.current) return;
    try {
      const { svg } = await mermaid.render('mermaid', chart);
      ref.current.innerHTML = svg;
    } catch (e) {
      ref.current.innerHTML = 'error'
    }
  }, [chart])

  return (
    <div style={{ width: '100%', padding: 20 }} ref={ref}>
      {chart}
    </div>
  )
}

export default Mermaid;