# Typst

支持使用 typst 语法渲染图表，包括函数图、连接图、图表、物理示意图等。

## 注意事项

- 所有实际绘制的图都需要使用 #html.frame() 来进行包裹
- 不要使用任何设置版面的指令，如 `#set page(width: auto, height: auto, margin: 5mm, fill: white)`

## 示例

### 图表

```typst
#import "@preview/lilaq:0.5.0" as lq

#let xs = range(4)

#let ys1 = (1.35, 3, 2.1, 4)
#let ys2 = (1.4, 3.3, 1.9, 4.2)

#let yerr1 = (0.2, 0.3, 0.5, 0.4)
#let yerr2 = (0.3, 0.3, 0.4, 0.7)

#html.frame(lq.diagram(
  width: 5cm,
  legend: (position: left + top),

  lq.bar(xs, ys1, offset: -0.2, width: 0.4, label: [Left]),
  lq.bar(xs, ys2, offset: 0.2, width: 0.4, label: [Right]),

  lq.plot(
    xs.map(x => x - 0.2), ys1,
    yerr: yerr1,
    color: black,
    stroke: none
  ),
  lq.plot(
    xs.map(x => x + 0.2), ys2,
    yerr: yerr2,
    color: black,
    stroke: none
  )
))
```

```typst
#import "@preview/lilaq:0.5.0" as lq

#let x = lq.linspace(0, 10)

#html.frame(lq.diagram(
  lq.plot(x, x => calc.sin(x + 0.541))
))
```

```typst
#import "@preview/lilaq:0.5.0" as lq
#import "@preview/suiji:0.3.0"

#let rng = suiji.gen-rng(33)
#let (rng, x) = suiji.uniform(rng, size: 20)
#let (rng, y) = suiji.uniform(rng, size: 20)
#let (rng, colors) = suiji.uniform(rng, size: 20)
#let (rng, sizes) = suiji.uniform(rng, size: 20)

#html.frame(lq.diagram(
  lq.scatter(
    x, y,
    size: sizes.map(size => 200 * size),
    color: colors,
    map: color.map.magma
  )
))
```

### 数学函数

```typst
#import "@preview/cetz:0.4.2"

#show math.equation: block.with(fill: white, inset: 1pt)

#html.frame(cetz.canvas(length: 3cm, {
  import cetz.draw: *

  set-style(
    mark: (fill: black, scale: 2),
    stroke: (thickness: 0.4pt, cap: "round"),
    angle: (
      radius: 0.3,
      label-radius: .22,
      fill: green.lighten(80%),
      stroke: (paint: green.darken(50%))
    ),
    content: (padding: 1pt)
  )

  grid((-1.5, -1.5), (1.4, 1.4), step: 0.5, stroke: gray + 0.2pt)

  circle((0,0), radius: 1)

  line((-1.5, 0), (1.5, 0), mark: (end: "stealth"))
  content((), $ x $, anchor: "west")
  line((0, -1.5), (0, 1.5), mark: (end: "stealth"))
  content((), $ y $, anchor: "south")

  for (x, ct) in ((-1, $ -1 $), (-0.5, $ -1/2 $), (1, $ 1 $)) {
    line((x, 3pt), (x, -3pt))
    content((), anchor: "north", ct)
  }

  for (y, ct) in ((-1, $ -1 $), (-0.5, $ -1/2 $), (0.5, $ 1/2 $), (1, $ 1 $)) {
    line((3pt, y), (-3pt, y))
    content((), anchor: "east", ct)
  }

  // Draw the green angle
  cetz.angle.angle((0,0), (1,0), (1, calc.tan(30deg)),
    label: text(green, [#sym.alpha]))

  line((0,0), (1, calc.tan(30deg)))

  set-style(stroke: (thickness: 1.2pt))

  line((30deg, 1), ((), "|-", (0,0)), stroke: (paint: red), name: "sin")
  content(("sin.start", 50%, "sin.end"), text(red)[$ sin alpha $])
  line("sin.end", (0,0), stroke: (paint: blue), name: "cos")
  content(("cos.start", 50%, "cos.end"), text(blue)[$ cos alpha $], anchor: "north")
  line((1, 0), (1, calc.tan(30deg)), name: "tan", stroke: (paint: orange))
  content("tan.end", $ text(#orange, tan alpha) = text(#red, sin alpha) / text(#blue, cos alpha) $, anchor: "west")
}))
```

```typst
#import "@preview/cetz:0.4.2": canvas, draw, vector, matrix

#html.frame(canvas({
  import draw: *

  ortho(y: -30deg, x: 30deg, {
    on-xz({
      grid((0,-2), (8,2), stroke: gray + .5pt)
    })

    // Draw a sine wave on the xy plane
    let wave(amplitude: 1, fill: none, phases: 2, scale: 8, samples: 100) = {
      line(..(for x in range(0, samples + 1) {
        let x = x / samples
        let p = (2 * phases * calc.pi) * x
        ((x * scale, calc.sin(p) * amplitude),)
      }), fill: fill)

      let subdivs = 8
      for phase in range(0, phases) {
        let x = phase / phases
        for div in range(1, subdivs + 1) {
          let p = 2 * calc.pi * (div / subdivs)
          let y = calc.sin(p) * amplitude
          let x = x * scale + div / subdivs * scale / phases
          line((x, 0), (x, y), stroke: rgb(0, 0, 0, 150) + .5pt)
        }
      }
    }

    on-xy({
      wave(amplitude: 1.6, fill: rgb(0, 0, 255, 50))
    })
    on-xz({
      wave(amplitude: 1, fill: rgb(255, 0, 0, 50))
    })
  })
}))
```

### 电容

```typst
#import "@preview/cetz:0.4.2": canvas, draw
#import draw: line, rect, content, bezier, group, anchor

// Constants
#let height = 5
#let width = 4
#let plate-width = 0.5
#let diel-width = 0.16 * width
#let n-field-lines = 7
#let n-charges = 7

// Colors
#let e-color = rgb("#e67300")
#let plus-color = rgb("#cc2200").transparentize(20%)
#let minus-color = rgb("#0044cc").transparentize(20%)

// Helper function to draw a capacitor plate with charges
#let plate(x, is-anode: true) = {
  let color = if is-anode { plus-color } else { minus-color }
  let fill-base = if is-anode { rgb("#f29797") } else { rgb("#9fc2f6") }
  let sign = if is-anode { $+$ } else { $-$ }

  // Draw plate with gradient fill
  rect(
    (x, 0),
    (x + plate-width, height),
    stroke: (paint: color, thickness: .7pt),
    fill: gradient.linear(fill-base.lighten(50%), fill-base, angle: 90deg),
  )
  // Draw charge label
  content(
    (x + plate-width / 2, height + 0.1),
    text(fill: color)[$sign Q_"C"$],
    anchor: "south",
  )
  // Draw charges
  for ii in range(n-charges) {
    let y = ii * height / n-charges + 0.325
    content((x + plate-width / 2, y), text(fill: color)[$sign$])
  }
}

// Helper function to draw a dipole
#let dipole(x, y, ..style) = group({
  let plus-grad = gradient.linear(
    angle: 90deg,
    minus-color.lighten(30%),
    minus-color.darken(30%),
  )
  let minus-grad = gradient.linear(
    angle: 90deg,
    plus-color.lighten(30%),
    plus-color.darken(30%),
  )
  rect(x, ((x, "|-", y), 50%, y), fill: plus-grad, radius: (west: .5), name: "minus", ..style)
  rect(y, ((x, "-|", y), 50%, x), fill: minus-grad, radius: (east: .5), name: "plus", ..style)
  content("plus", [+])
  content("minus", [--])
})

#html.frame(canvas({
  // Dielectric slab
  rect(
    (diel-width, -0.03 * height),
    (width - diel-width, 1.08 * height),
    stroke: e-color,
    fill: rgb("#fff8f0"), // very light orange
  )
  content((width / 2, 1.15 * height), text(fill: e-color)[$arrow(E)$])
  content((width * 0.8, 1.09 * height), text(fill: minus-color)[$+Q_"surf"$], anchor: "south")
  content((1.3 * diel-width, 1.09 * height), text(fill: plus-color)[$-Q_"surf"$], anchor: "south")

  // Electric field lines
  for ii in range(n-field-lines) {
    let y = (ii + 0.42) * height / n-field-lines
    line(
      (-plate-width, y),
      (width + plate-width, y),
      stroke: (paint: e-color, thickness: 1.2pt),
      mark: (pos: 0.5, end: "stealth", fill: e-color),
    )
  }

  // Draw plates
  plate(width, is-anode: false) // Left plate (cathode)
  plate(-plate-width, is-anode: true) // Right plate (anode)

  // Dipoles
  for x in (0.3, 0.5, 0.7) {
    for ii in range(n-field-lines) {
      let y = (ii + 0.94) * height / n-field-lines
      dipole((x * width - 0.3, y - 0.12), (x * width + 0.3, y + 0.12), stroke: 0.5pt)
    }
  }
}))
```

## 节点和边

```typst
#import "@preview/fletcher:0.5.8" as fletcher: diagram, node, edge
#html.frame(diagram(cell-size: 15mm, $
	G edge(f, ->) edge("d", pi, ->>) & im(f) \
	G slash ker(f) edge("ur", tilde(f), "hook-->")
$))
```

```typst
#import "@preview/fletcher:0.5.8" as fletcher: diagram, node, edge

#set text(10pt)
#html.frame(diagram(
	node-stroke: .1em,
	node-fill: gradient.radial(blue.lighten(80%), blue, center: (30%, 20%), radius: 80%),
	spacing: 4em,
	edge((-1,0), "r", "-|>", `open(path)`, label-pos: 0, label-side: center),
	node((0,0), `reading`, radius: 2em),
	edge(`read()`, "-|>"),
	node((1,0), `eof`, radius: 2em),
	edge(`close()`, "-|>"),
	node((2,0), `closed`, radius: 2em, extrude: (-2.5, 0)),
	edge((0,0), (0,0), `read()`, "--|>", bend: 130deg),
	edge((0,0), (2,0), `close()`, "-|>", bend: -40deg),
))
```

```typst
#import "@preview/fletcher:0.5.8" as fletcher: diagram, node, edge

#html.frame(diagram(
	node-corner-radius: 4pt,
	node((0,0), $S a$),
	node((1,0), $T b$),
	node((0,1), $S a'$),
	node((1,1), $T b'$),
	edge((0,0), (1,0), "->", $f$),
	edge((0,1), (1,1), "->", $f'$),
	edge((0,0), (0,1), "->", $alpha$),
	edge((1,0), (1,1), "->", $beta$),

	node((2,0), $(a, b, f)$),
	edge("->", text(0.8em, $(alpha, beta)$)),
	node((2,1), $(a', b', f')$),

	node((0,2), $S a$),
	edge("->", $f$),
	node((1,2), $T b$),

	node((2,2), $(a, b, f)$),

	{
		let tint(c) = (stroke: c, fill: rgb(..c.components().slice(0,3), 5%), inset: 8pt)
		node(enclose: ((0,0), (1,1)), ..tint(teal), name: <big>)
		node(enclose: ((2,0), (2,1)), ..tint(teal), name: <tall>)
		node(enclose: ((0,2), (1,2)), ..tint(green), name: <wide>)
		node(enclose: ((2,2),), ..tint(green), name: <small>)
	},

	edge(<big>, <tall>, "<==>", stroke: teal + .75pt),
	edge(<wide>, <small>, "<==>", stroke: green + .75pt),
	edge(<big>, <wide>, "<=>", stroke: .75pt),
	edge(<tall>, <small>, "<=>", stroke: .75pt),
))
```
