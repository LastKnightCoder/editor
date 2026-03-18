export const GENERATIVE_WIDGET_SVG_STYLES = `
svg .t  { font-family: var(--font-sans); font-size: 14px; fill: var(--color-text-primary); }
svg .ts { font-family: var(--font-sans); font-size: 12px; fill: var(--color-text-secondary); }
svg .th { font-family: var(--font-sans); font-size: 14px; font-weight: 500; fill: var(--color-text-primary); }

svg .box { fill: var(--color-background-secondary); stroke: var(--color-border-secondary); }
svg .node { cursor: pointer; }
svg .node:hover { opacity: 0.84; }
svg .arr { stroke: var(--color-text-tertiary); stroke-width: 1.5; fill: none; }
svg .leader { stroke: var(--color-text-tertiary); stroke-width: 0.5; stroke-dasharray: 4 3; fill: none; }

svg .c-purple > rect, svg .c-purple > circle, svg .c-purple > ellipse { fill: #3C3489; stroke: #AFA9EC; }
svg .c-purple > .th, svg .c-purple > .t { fill: #CECBF6; }
svg .c-purple > .ts { fill: #AFA9EC; }
svg rect.c-purple, svg circle.c-purple, svg ellipse.c-purple { fill: #3C3489; stroke: #AFA9EC; }

svg .c-teal > rect, svg .c-teal > circle, svg .c-teal > ellipse { fill: #085041; stroke: #5DCAA5; }
svg .c-teal > .th, svg .c-teal > .t { fill: #9FE1CB; }
svg .c-teal > .ts { fill: #5DCAA5; }
svg rect.c-teal, svg circle.c-teal, svg ellipse.c-teal { fill: #085041; stroke: #5DCAA5; }

svg .c-coral > rect, svg .c-coral > circle, svg .c-coral > ellipse { fill: #712B13; stroke: #F0997B; }
svg .c-coral > .th, svg .c-coral > .t { fill: #F5C4B3; }
svg .c-coral > .ts { fill: #F0997B; }
svg rect.c-coral, svg circle.c-coral, svg ellipse.c-coral { fill: #712B13; stroke: #F0997B; }

svg .c-pink > rect, svg .c-pink > circle, svg .c-pink > ellipse { fill: #72243E; stroke: #ED93B1; }
svg .c-pink > .th, svg .c-pink > .t { fill: #F4C0D1; }
svg .c-pink > .ts { fill: #ED93B1; }
svg rect.c-pink, svg circle.c-pink, svg ellipse.c-pink { fill: #72243E; stroke: #ED93B1; }

svg .c-gray > rect, svg .c-gray > circle, svg .c-gray > ellipse { fill: #444441; stroke: #B4B2A9; }
svg .c-gray > .th, svg .c-gray > .t { fill: #D3D1C7; }
svg .c-gray > .ts { fill: #B4B2A9; }
svg rect.c-gray, svg circle.c-gray, svg ellipse.c-gray { fill: #444441; stroke: #B4B2A9; }

svg .c-blue > rect, svg .c-blue > circle, svg .c-blue > ellipse { fill: #0C447C; stroke: #85B7EB; }
svg .c-blue > .th, svg .c-blue > .t { fill: #B5D4F4; }
svg .c-blue > .ts { fill: #85B7EB; }
svg rect.c-blue, svg circle.c-blue, svg ellipse.c-blue { fill: #0C447C; stroke: #85B7EB; }

svg .c-green > rect, svg .c-green > circle, svg .c-green > ellipse { fill: #27500A; stroke: #97C459; }
svg .c-green > .th, svg .c-green > .t { fill: #C0DD97; }
svg .c-green > .ts { fill: #97C459; }
svg rect.c-green, svg circle.c-green, svg ellipse.c-green { fill: #27500A; stroke: #97C459; }

svg .c-amber > rect, svg .c-amber > circle, svg .c-amber > ellipse { fill: #633806; stroke: #EF9F27; }
svg .c-amber > .th, svg .c-amber > .t { fill: #FAC775; }
svg .c-amber > .ts { fill: #EF9F27; }
svg rect.c-amber, svg circle.c-amber, svg ellipse.c-amber { fill: #633806; stroke: #EF9F27; }

svg .c-red > rect, svg .c-red > circle, svg .c-red > ellipse { fill: #791F1F; stroke: #F09595; }
svg .c-red > .th, svg .c-red > .t { fill: #F7C1C1; }
svg .c-red > .ts { fill: #F09595; }
svg rect.c-red, svg circle.c-red, svg ellipse.c-red { fill: #791F1F; stroke: #F09595; }
`;
