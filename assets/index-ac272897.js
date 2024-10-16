import{j as e,u as h,P as u,T as p,R as b}from"./index-68ca0680.js";import{r as n}from"./react-51129ece.js";import{m as s}from"./mermaid-04879fec.js";import"./react-dom-d9a25264.js";import"./katex-3eb4982e.js";const l={startOnLoad:!0,theme:"forest",logLevel:0,securityLevel:"strict",arrowMarkerAbsolute:!1,flowchart:{htmlLabels:!0,curve:"linear"},themeCSS:`
  g.classGroup rect {
    fill: #282a36;
    stroke: #6272a4;
  } 
  g.classGroup text {
    fill: #f8f8f2;
  }
  g.classGroup line {
    stroke: #f8f8f2;
    stroke-width: 0.5;
  }
  .classLabel .box {
    stroke: #21222c;
    stroke-width: 3;
    fill: #21222c;
    opacity: 1;
  }
  .classLabel .label {
    fill: #f1fa8c;
  }
  .relation {
    stroke: #ff79c6;
    stroke-width: 1;
  }
  #compositionStart, #compositionEnd {
    fill: #bd93f9;
    stroke: #bd93f9;
    stroke-width: 1;
  }
  #aggregationEnd, #aggregationStart {
    fill: #21222c;
    stroke: #50fa7b;
    stroke-width: 1;
  }
  #dependencyStart, #dependencyEnd {
    fill: #00bcd4;
    stroke: #00bcd4;
    stroke-width: 1;
  } 
  #extensionStart, #extensionEnd {
    fill: #f8f8f2;
    stroke: #f8f8f2;
    stroke-width: 1;
  }`,sequence:{diagramMarginX:50,diagramMarginY:10,actorMargin:50,width:150,height:65,boxMargin:10,boxTextMargin:5,noteMargin:10,messageMargin:35,mirrorActors:!0,bottomMarginAdj:1,useMaxWidth:!0,rightAngles:!1,showSequenceNumbers:!1},gantt:{titleTopMargin:25,barHeight:20,barGap:4,topPadding:50,leftPadding:75,gridLineStartPadding:35,fontSize:11,numberSectionStyles:4,axisFormat:"%Y-%m-%d"}};s.initialize(l);const x=r=>{const{chart:a}=r,t=n.useRef(null);return n.useEffect(()=>{s.contentLoaded()},[]),e.jsx("div",{className:"mermaid",style:{width:"100%",padding:20},ref:t,children:a})},k="_mermaid_pi4zd_1",M="_empty_pi4zd_5",d={mermaid:k,empty:M};s.initialize(l);const v=r=>{const{attributes:a,element:t,children:c}=r,{chart:i}=t,o=h(),m=()=>e.jsx("div",{contentEditable:!1,className:d.empty,children:"点击编辑图表"}),f=g=>{p.setNodes(o,{chart:g},{at:b.findPath(o,t)})};return e.jsxs("div",{...a,className:d.mermaid,children:[e.jsx("div",{contentEditable:!1,children:e.jsx(u,{mode:"mermaid",initValue:i,onChange:f,element:t,center:!0,children:i?e.jsx(x,{chart:i}):m()})}),c]})};export{v as default};
