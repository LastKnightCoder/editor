import { MermaidConfig } from "mermaid";

export const defaultMermaidConfig: MermaidConfig = {
  startOnLoad: true,
  theme: "forest",
  logLevel: 0,
  securityLevel: "strict",
  arrowMarkerAbsolute: false,
  flowchart: {
    htmlLabels: true,
    curve: "linear",
  },
  themeCSS: `
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
  }`,
  sequence: {
    diagramMarginX: 50,
    diagramMarginY: 10,
    actorMargin: 50,
    width: 150,
    height: 65,
    boxMargin: 10,
    boxTextMargin: 5,
    noteMargin: 10,
    messageMargin: 35,
    mirrorActors: true,
    bottomMarginAdj: 1,
    useMaxWidth: true,
    rightAngles: false,
    showSequenceNumbers: false,
  },
  gantt: {
    titleTopMargin: 25,
    barHeight: 20,
    barGap: 4,
    topPadding: 50,
    leftPadding: 75,
    gridLineStartPadding: 35,
    fontSize: 11,
    numberSectionStyles: 4,
    axisFormat: "%Y-%m-%d",
  },
};
