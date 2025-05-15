import{n as h,j as t,u,o as p,T as x,R as b}from"./profile-8842cb3f.js";import{r as d}from"./react-a383d3d5.js";import{z as n}from"./mermaid-e2dea184.js";import"./react-dom-2b1e1bcb.js";import"./katex-f1cbb8ad.js";import"./react-router-dom-385503e7.js";const c={startOnLoad:!0,theme:"forest",logLevel:0,securityLevel:"strict",arrowMarkerAbsolute:!1,flowchart:{htmlLabels:!0,curve:"linear"},themeCSS:`
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
  }`,sequence:{diagramMarginX:50,diagramMarginY:10,actorMargin:50,width:150,height:65,boxMargin:10,boxTextMargin:5,noteMargin:10,messageMargin:35,mirrorActors:!0,bottomMarginAdj:1,useMaxWidth:!0,rightAngles:!1,showSequenceNumbers:!1},gantt:{titleTopMargin:25,barHeight:20,barGap:4,topPadding:50,leftPadding:75,gridLineStartPadding:35,fontSize:11,numberSectionStyles:4,axisFormat:"%Y-%m-%d"}};n.initialize(c);const M=s=>{const{chart:a}=s,e=d.useRef(null),i=h(()=>`mermaid-${Math.random().toString(36).slice(2)}`,[]);return d.useEffect(()=>{n.render(i,a).then(({svg:r})=>{e.current&&(e.current.innerHTML=r)}).catch(r=>{e.current&&(e.current.innerHTML=r)})},[a,i]),t.jsxs(t.Fragment,{children:[t.jsx("code",{id:i,style:{display:"none"}}),t.jsx("div",{ref:e,style:{width:"100%",padding:20}})]})},k="_mermaid_15axm_1",y="_empty_15axm_5",l={mermaid:k,empty:y};n.initialize(c);const T=s=>{const{attributes:a,element:e,children:i}=s,{chart:r}=e,o=u(),m=()=>t.jsx("div",{contentEditable:!1,className:l.empty,children:"点击编辑图表"}),f=g=>{x.setNodes(o,{chart:g},{at:b.findPath(o,e)})};return t.jsxs("div",{...a,className:l.mermaid,children:[t.jsx("div",{contentEditable:!1,children:t.jsx(p,{mode:"mermaid",initValue:r,onChange:f,element:e,center:!0,children:r?t.jsx(M,{chart:r}):m()})}),i]})};export{T as default};
