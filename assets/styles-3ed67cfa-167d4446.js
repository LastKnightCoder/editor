import{G as M}from"./graph-e2c3195d.js";import{F as R,G as q,y as A,n as g,z as H,h as S,p as G,A as z,B as L,x as E,l as C,C as U,H as j,D as J,I as K,J as W}from"./mermaid-d49aec67.js";import{r as X}from"./index-fc10efb0-b274977e.js";function se(e,r){return!!e.children(r).length}function ie(e){return N(e.v)+":"+N(e.w)+":"+N(e.name)}var Q=/:/g;function N(e){return e?String(e).replace(Q,"\\:"):""}function Y(e,r){r&&e.attr("style",r)}function ce(e,r,c){r&&e.attr("class",r).attr("class",c+" "+e.attr("class"))}function de(e,r){var c=r.graph();if(R(c)){var a=c.transition;if(q(a))return a(e)}return e}function Z(e,r){var c=e.append("foreignObject").attr("width","100000"),a=c.append("xhtml:div");a.attr("xmlns","http://www.w3.org/1999/xhtml");var i=r.label;switch(typeof i){case"function":a.insert(i);break;case"object":a.insert(function(){return i});break;default:a.html(i)}Y(a,r.labelStyle),a.style("display","inline-block"),a.style("white-space","nowrap");var d=a.node().getBoundingClientRect();return c.attr("width",d.width).attr("height",d.height),c}const P={},O=function(e){const r=Object.keys(e);for(const c of r)P[c]=e[c]},V=async function(e,r,c,a,i,d){const w=a.select(`[id="${c}"]`),n=Object.keys(e);for(const p of n){const l=e[p];let y="default";l.classes.length>0&&(y=l.classes.join(" ")),y=y+" flowchart-label";const u=A(l.styles);let t=l.text!==void 0?l.text:l.id,s;if(g.info("vertex",l,l.labelType),l.labelType==="markdown")g.info("vertex",l,l.labelType);else if(H(S().flowchart.htmlLabels))s=Z(w,{label:t}).node(),s.parentNode.removeChild(s);else{const k=i.createElementNS("http://www.w3.org/2000/svg","text");k.setAttribute("style",u.labelStyle.replace("color:","fill:"));const _=t.split(G.lineBreakRegex);for(const $ of _){const m=i.createElementNS("http://www.w3.org/2000/svg","tspan");m.setAttributeNS("http://www.w3.org/XML/1998/namespace","xml:space","preserve"),m.setAttribute("dy","1em"),m.setAttribute("x","1"),m.textContent=$,k.appendChild(m)}s=k}let b=0,o="";switch(l.type){case"round":b=5,o="rect";break;case"square":o="rect";break;case"diamond":o="question";break;case"hexagon":o="hexagon";break;case"odd":o="rect_left_inv_arrow";break;case"lean_right":o="lean_right";break;case"lean_left":o="lean_left";break;case"trapezoid":o="trapezoid";break;case"inv_trapezoid":o="inv_trapezoid";break;case"odd_right":o="rect_left_inv_arrow";break;case"circle":o="circle";break;case"ellipse":o="ellipse";break;case"stadium":o="stadium";break;case"subroutine":o="subroutine";break;case"cylinder":o="cylinder";break;case"group":o="rect";break;case"doublecircle":o="doublecircle";break;default:o="rect"}const T=await z(t,S());r.setNode(l.id,{labelStyle:u.labelStyle,shape:o,labelText:T,labelType:l.labelType,rx:b,ry:b,class:y,style:u.style,id:l.id,link:l.link,linkTarget:l.linkTarget,tooltip:d.db.getTooltip(l.id)||"",domId:d.db.lookUpDomId(l.id),haveCallback:l.haveCallback,width:l.type==="group"?500:void 0,dir:l.dir,type:l.type,props:l.props,padding:S().flowchart.padding}),g.info("setNode",{labelStyle:u.labelStyle,labelType:l.labelType,shape:o,labelText:T,rx:b,ry:b,class:y,style:u.style,id:l.id,domId:d.db.lookUpDomId(l.id),width:l.type==="group"?500:void 0,type:l.type,dir:l.dir,props:l.props,padding:S().flowchart.padding})}},F=async function(e,r,c){g.info("abc78 edges = ",e);let a=0,i={},d,w;if(e.defaultStyle!==void 0){const n=A(e.defaultStyle);d=n.style,w=n.labelStyle}for(const n of e){a++;const p="L-"+n.start+"-"+n.end;i[p]===void 0?(i[p]=0,g.info("abc78 new entry",p,i[p])):(i[p]++,g.info("abc78 new entry",p,i[p]));let l=p+"-"+i[p];g.info("abc78 new link id to be used is",p,l,i[p]);const y="LS-"+n.start,u="LE-"+n.end,t={style:"",labelStyle:""};switch(t.minlen=n.length||1,n.type==="arrow_open"?t.arrowhead="none":t.arrowhead="normal",t.arrowTypeStart="arrow_open",t.arrowTypeEnd="arrow_open",n.type){case"double_arrow_cross":t.arrowTypeStart="arrow_cross";case"arrow_cross":t.arrowTypeEnd="arrow_cross";break;case"double_arrow_point":t.arrowTypeStart="arrow_point";case"arrow_point":t.arrowTypeEnd="arrow_point";break;case"double_arrow_circle":t.arrowTypeStart="arrow_circle";case"arrow_circle":t.arrowTypeEnd="arrow_circle";break}let s="",b="";switch(n.stroke){case"normal":s="fill:none;",d!==void 0&&(s=d),w!==void 0&&(b=w),t.thickness="normal",t.pattern="solid";break;case"dotted":t.thickness="normal",t.pattern="dotted",t.style="fill:none;stroke-width:2px;stroke-dasharray:3;";break;case"thick":t.thickness="thick",t.pattern="solid",t.style="stroke-width: 3.5px;fill:none;";break;case"invisible":t.thickness="invisible",t.pattern="solid",t.style="stroke-width: 0;fill:none;";break}if(n.style!==void 0){const o=A(n.style);s=o.style,b=o.labelStyle}t.style=t.style+=s,t.labelStyle=t.labelStyle+=b,n.interpolate!==void 0?t.curve=L(n.interpolate,E):e.defaultInterpolate!==void 0?t.curve=L(e.defaultInterpolate,E):t.curve=L(P.curve,E),n.text===void 0?n.style!==void 0&&(t.arrowheadStyle="fill: #333"):(t.arrowheadStyle="fill: #333",t.labelpos="c"),t.labelType=n.labelType,t.label=await z(n.text.replace(G.lineBreakRegex,`
`),S()),n.style===void 0&&(t.style=t.style||"stroke: #333; stroke-width: 1.5px;fill:none;"),t.labelStyle=t.labelStyle.replace("color:","fill:"),t.id=l,t.classes="flowchart-link "+y+" "+u,r.setEdge(n.start,n.end,t,a)}},ee=function(e,r){return r.db.getClasses()},te=async function(e,r,c,a){g.info("Drawing flowchart");let i=a.db.getDirection();i===void 0&&(i="TD");const{securityLevel:d,flowchart:w}=S(),n=w.nodeSpacing||50,p=w.rankSpacing||50;let l;d==="sandbox"&&(l=C("#i"+r));const y=d==="sandbox"?C(l.nodes()[0].contentDocument.body):C("body"),u=d==="sandbox"?l.nodes()[0].contentDocument:document,t=new M({multigraph:!0,compound:!0}).setGraph({rankdir:i,nodesep:n,ranksep:p,marginx:0,marginy:0}).setDefaultEdgeLabel(function(){return{}});let s;const b=a.db.getSubGraphs();g.info("Subgraphs - ",b);for(let f=b.length-1;f>=0;f--)s=b[f],g.info("Subgraph - ",s),a.db.addVertex(s.id,{text:s.title,type:s.labelType},"group",void 0,s.classes,s.dir);const o=a.db.getVertices(),T=a.db.getEdges();g.info("Edges",T);let k=0;for(k=b.length-1;k>=0;k--){s=b[k],U("cluster").append("text");for(let f=0;f<s.nodes.length;f++)g.info("Setting up subgraphs",s.nodes[f],s.id),t.setParent(s.nodes[f],s.id)}await V(o,t,r,y,u,a),await F(T,t);const _=y.select(`[id="${r}"]`),$=y.select("#"+r+" g");if(await X($,t,["point","circle","cross"],"flowchart",r),j.insertTitle(_,"flowchartTitleText",w.titleTopMargin,a.db.getDiagramTitle()),J(t,_,w.diagramPadding,w.useMaxWidth),a.db.indexNodes("subGraph"+k),!w.htmlLabels){const f=u.querySelectorAll('[id="'+r+'"] .edgeLabel .label');for(const x of f){const v=x.getBBox(),h=u.createElementNS("http://www.w3.org/2000/svg","rect");h.setAttribute("rx",0),h.setAttribute("ry",0),h.setAttribute("width",v.width),h.setAttribute("height",v.height),x.insertBefore(h,x.firstChild)}}Object.keys(o).forEach(function(f){const x=o[f];if(x.link){const v=C("#"+r+' [id="'+f+'"]');if(v){const h=u.createElementNS("http://www.w3.org/2000/svg","a");h.setAttributeNS("http://www.w3.org/2000/svg","class",x.classes.join(" ")),h.setAttributeNS("http://www.w3.org/2000/svg","href",x.link),h.setAttributeNS("http://www.w3.org/2000/svg","rel","noopener"),d==="sandbox"?h.setAttributeNS("http://www.w3.org/2000/svg","target","_top"):x.linkTarget&&h.setAttributeNS("http://www.w3.org/2000/svg","target",x.linkTarget);const B=v.insert(function(){return h},":first-child"),I=v.select(".label-container");I&&B.append(function(){return I.node()});const D=v.select(".label");D&&B.append(function(){return D.node()})}}})},pe={setConf:O,addVertices:V,addEdges:F,getClasses:ee,draw:te},le=(e,r)=>{const c=W,a=c(e,"r"),i=c(e,"g"),d=c(e,"b");return K(a,i,d,r)},re=e=>`.label {
    font-family: ${e.fontFamily};
    color: ${e.nodeTextColor||e.textColor};
  }
  .cluster-label text {
    fill: ${e.titleColor};
  }
  .cluster-label span,p {
    color: ${e.titleColor};
  }

  .label text,span,p {
    fill: ${e.nodeTextColor||e.textColor};
    color: ${e.nodeTextColor||e.textColor};
  }

  .node rect,
  .node circle,
  .node ellipse,
  .node polygon,
  .node path {
    fill: ${e.mainBkg};
    stroke: ${e.nodeBorder};
    stroke-width: 1px;
  }
  .flowchart-label text {
    text-anchor: middle;
  }
  // .flowchart-label .text-outer-tspan {
  //   text-anchor: middle;
  // }
  // .flowchart-label .text-inner-tspan {
  //   text-anchor: start;
  // }

  .node .katex path {
    fill: #000;
    stroke: #000;
    stroke-width: 1px;
  }

  .node .label {
    text-align: center;
  }
  .node.clickable {
    cursor: pointer;
  }

  .arrowheadPath {
    fill: ${e.arrowheadColor};
  }

  .edgePath .path {
    stroke: ${e.lineColor};
    stroke-width: 2.0px;
  }

  .flowchart-link {
    stroke: ${e.lineColor};
    fill: none;
  }

  .edgeLabel {
    background-color: ${e.edgeLabelBackground};
    rect {
      opacity: 0.5;
      background-color: ${e.edgeLabelBackground};
      fill: ${e.edgeLabelBackground};
    }
    text-align: center;
  }

  /* For html labels only */
  .labelBkg {
    background-color: ${le(e.edgeLabelBackground,.5)};
    // background-color: 
  }

  .cluster rect {
    fill: ${e.clusterBkg};
    stroke: ${e.clusterBorder};
    stroke-width: 1px;
  }

  .cluster text {
    fill: ${e.titleColor};
  }

  .cluster span,p {
    color: ${e.titleColor};
  }
  /* .cluster div {
    color: ${e.titleColor};
  } */

  div.mermaidTooltip {
    position: absolute;
    text-align: center;
    max-width: 200px;
    padding: 2px;
    font-family: ${e.fontFamily};
    font-size: 12px;
    background: ${e.tertiaryColor};
    border: 1px solid ${e.border2};
    border-radius: 2px;
    pointer-events: none;
    z-index: 100;
  }

  .flowchartTitleText {
    text-anchor: middle;
    font-size: 18px;
    fill: ${e.textColor};
  }
`,be=re;export{Y as a,Z as b,de as c,ce as d,ie as e,pe as f,be as g,se as i};
