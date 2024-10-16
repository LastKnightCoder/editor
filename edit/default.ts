export default [
  {
    "type": "paragraph",
    "children": [
      {
        "type": "formatted",
        "text": "基于 SVG 无限画板的拖拽和缩放实现。"
      }
    ]
  },
  {
    "type": "paragraph",
    "children": [
      {
        "type": "formatted",
        "text": "SVG 可以看作是一个无限大小的画布，而 "
      },
      {
        "type": "formatted",
        "text": "viewBox",
        "code": true
      },
      {
        "type": "formatted",
        "text": " 属性就是决定将画布中的哪一部分展示出来，"
      },
      {
        "type": "formatted",
        "text": "viewBox",
        "code": true
      },
      {
        "type": "formatted",
        "text": " 指定的这个范围称之为视口。"
      },
      {
        "type": "formatted",
        "text": "viewBox",
        "code": true
      },
      {
        "type": "formatted",
        "text": " 通过四个属性来定义视口："
      }
    ]
  },
  {
    "type": "bulleted-list",
    "children": [
      {
        "type": "list-item",
        "children": [
          {
            "type": "paragraph",
            "children": [
              {
                "type": "formatted",
                "text": "左上角坐标 "
              },
              {
                "type": "inline-math",
                "tex": "(\\text{minX}, \\text{minY})",
                "children": [
                  {
                    "type": "formatted",
                    "text": "(minX, minY)"
                  }
                ]
              },
              {
                "type": "formatted",
                "text": "﻿"
              }
            ]
          }
        ]
      },
      {
        "type": "list-item",
        "children": [
          {
            "type": "paragraph",
            "children": [
              {
                "type": "formatted",
                "text": "视口大小 "
              },
              {
                "type": "inline-math",
                "tex": "(\\text{width}, \\text{height})",
                "children": [
                  {
                    "type": "formatted",
                    "text": "(width, height)"
                  }
                ]
              },
              {
                "type": "formatted",
                "text": "﻿"
              }
            ]
          }
        ]
      }
    ]
  },
  {
    "type": "paragraph",
    "children": [
      {
        "type": "formatted",
        "text": "这里使用的坐标均是 SVG 中的坐标系统，SVG 坐标系统中的一个单位长度与一像素并不相等，二者之间的换算关系取决于视口的大小与 SVG 元素的 CSS 大小"
      }
    ]
  },
  {
    "type": "code-block",
    "code": "<svg width=\"200\" height=\"200\" viewBox=\"0 0 100 100\"></svg>",
    "language": "html",
    "uuid": "a738390e-1c96-4b14-bcec-8a7a8f28e06b",
    "children": [
      {
        "type": "formatted",
        "text": ""
      }
    ]
  },
  {
    "type": "paragraph",
    "children": [
      {
        "type": "formatted",
        "text": "如上 SVG 的 CSS 大小为 "
      },
      {
        "type": "inline-math",
        "tex": "200",
        "children": [
          {
            "type": "formatted",
            "text": "200"
          }
        ]
      },
      {
        "type": "formatted",
        "text": " 像素，而视口的大小为 "
      },
      {
        "type": "inline-math",
        "tex": "100",
        "children": [
          {
            "type": "formatted",
            "text": "100"
          }
        ]
      },
      {
        "type": "formatted",
        "text": " SVG 单位，也就是说 "
      },
      {
        "type": "inline-math",
        "tex": "100",
        "children": [
          {
            "type": "formatted",
            "text": "100"
          }
        ]
      },
      {
        "type": "formatted",
        "text": " SVG 单位等价于 "
      },
      {
        "type": "inline-math",
        "tex": "200",
        "children": [
          {
            "type": "formatted",
            "text": "200"
          }
        ]
      },
      {
        "type": "formatted",
        "text": " 像素，所以一个单位等两个像素大小。"
      }
    ]
  },
  {
    "type": "callout",
    "calloutType": "info",
    "title": "信息",
    "children": [
      {
        "type": "paragraph",
        "children": [
          {
            "type": "formatted",
            "text": "实际上 "
          },
          {
            "type": "inline-math",
            "tex": "x",
            "children": [
              {
                "type": "formatted",
                "text": "x"
              }
            ]
          },
          {
            "type": "formatted",
            "text": " 轴和 "
          },
          {
            "type": "inline-math",
            "tex": "y",
            "children": [
              {
                "type": "formatted",
                "text": "y"
              }
            ]
          },
          {
            "type": "formatted",
            "text": " 轴方向可以有不同的换算比例，为了简单，只考虑二者的换算比例相同。"
          }
        ]
      }
    ]
  },
  {
    "type": "paragraph",
    "children": [
      {
        "type": "formatted",
        "text": "通过改变视口的左上角坐标即可实现画布拖拽，而改变 SVG 单位与像素单位的比例即可实现缩放。"
      }
    ]
  },
  {
    "type": "header",
    "children": [
      {
        "type": "formatted",
        "text": "拖拽"
      }
    ],
    "level": 2
  },
  {
    "type": "paragraph",
    "children": [
      {
        "type": "formatted",
        "text": "考虑点 "
      },
      {
        "type": "inline-math",
        "tex": "(x, y)",
        "children": [
          {
            "type": "formatted",
            "text": "(x, y)"
          }
        ]
      },
      {
        "type": "formatted",
        "text": "，要实现在视口上移动了 "
      },
      {
        "type": "inline-math",
        "tex": "\\text{offsetX}",
        "children": [
          {
            "type": "formatted",
            "text": "offsetX"
          }
        ]
      },
      {
        "type": "formatted",
        "text": " 像素和 "
      },
      {
        "type": "inline-math",
        "tex": "\\text{offsetY}",
        "children": [
          {
            "type": "formatted",
            "text": "offsetY"
          }
        ]
      },
      {
        "type": "formatted",
        "text": " 像素，求 "
      },
      {
        "type": "inline-math",
        "tex": "\\text{newMinX}",
        "children": [
          {
            "type": "formatted",
            "text": "newMinX "
          }
        ]
      },
      {
        "type": "formatted",
        "text": " 和 "
      },
      {
        "type": "inline-math",
        "tex": "\\text{newMinY}",
        "children": [
          {
            "type": "formatted",
            "text": "newMinY"
          }
        ]
      },
      {
        "type": "formatted",
        "text": "﻿"
      }
    ]
  },
  {
    "type": "image",
    "url": "https://blog-hostimaging.oss-cn-beijing.aliyuncs.com/offset_c1c2522b-9b0f-4192-9a2c-a465d041bbac.png",
    "pasteUploading": false,
    "children": [
      {
        "type": "formatted",
        "text": ""
      }
    ]
  },
  {
    "type": "paragraph",
    "children": [
      {
        "type": "formatted",
        "text": "考虑简单的情况，没有缩放，那么一像素等与一个 SVG 单位，那么有"
      }
    ]
  },
  {
    "type": "block-math",
    "tex": "\\begin{aligned}\nx_2 - x_1 &= (x - \\text{newMinX}) - (x - \\text{minX}) &= \\text{offsetX} \\\\\ny_2 - y_1 &= (y - \\text{newMinY}) - (y - \\text{minY}) &= \\text{offsetY}\n\\end{aligned}",
    "children": [
      {
        "type": "formatted",
        "text": ""
      }
    ]
  },
  {
    "type": "paragraph",
    "children": [
      {
        "type": "formatted",
        "text": "得到"
      }
    ]
  },
  {
    "type": "block-math",
    "tex": "\\begin{aligned}\n\\text{newMinX} &= \\text{minX} - \\text{offsetX} \\\\\n\\text{newMinY} &= \\text{minY} - \\text{offsetY}\n\\end{aligned}",
    "children": [
      {
        "type": "formatted",
        "text": ""
      }
    ]
  },
  {
    "type": "paragraph",
    "children": [
      {
        "type": "formatted",
        "text": "现在考虑缩放的情况，此时画布的缩放比例为 "
      },
      {
        "type": "inline-math",
        "tex": "\\text{zoom}",
        "children": [
          {
            "type": "formatted",
            "text": "zoom"
          }
        ]
      },
      {
        "type": "formatted",
        "text": "，也就是说一个 SVG 单位等于 "
      },
      {
        "type": "inline-math",
        "tex": "\\text{zoom}",
        "children": [
          {
            "type": "formatted",
            "text": "zoom"
          }
        ]
      },
      {
        "type": "formatted",
        "text": " 像素，换句话说，一个像素大小为 "
      },
      {
        "type": "inline-math",
        "tex": "\\dfrac{1}{\\text{zoom}}",
        "children": [
          {
            "type": "formatted",
            "text": "1/zoom"
          }
        ]
      },
      {
        "type": "formatted",
        "text": " 个 SVG 单位，那么"
      }
    ]
  },
  {
    "type": "block-math",
    "tex": "\\begin{aligned}\nx_2 - x_1 &= (x - \\text{newMinX}) - (x - \\text{minX}) &= \\cfrac{\\text{offsetX}}{\\text{zoom}} \\\\\ny_2 - y_1 &= (y - \\text{newMinY}) - (y - \\text{minY}) &= \\cfrac{\\text{offsetY}}{\\text{zoom}}\n\\end{aligned}",
    "children": [
      {
        "type": "formatted",
        "text": ""
      }
    ]
  },
  {
    "type": "paragraph",
    "children": [
      {
        "type": "formatted",
        "text": "得到"
      }
    ]
  },
  {
    "type": "block-math",
    "tex": "\\begin{aligned}\n\\text{newMinX} &= \\text{minX} - \\cfrac{\\text{offsetX}}{\\text{zoom}} \\\\\n\\text{newMinY} &= \\text{minY} - \\cfrac{\\text{offsetY}}{\\text{zoom}}\n\\end{aligned}",
    "children": [
      {
        "type": "formatted",
        "text": ""
      }
    ]
  },
  {
    "type": "paragraph",
    "children": [
      {
        "type": "formatted",
        "text": ""
      }
    ]
  },
  {
    "type": "header",
    "children": [
      {
        "type": "formatted",
        "text": "缩放"
      }
    ],
    "level": 2
  },
  {
    "type": "paragraph",
    "children": [
      {
        "type": "formatted",
        "text": "要实现缩放，只需要改变视口大小与 CSS 大小的比例关系即可。设 SVG 的 CSS 宽高为"
      },
      {
        "type": "inline-math",
        "tex": "(\\text{width}, \\text{height})",
        "children": [
          {
            "type": "formatted",
            "text": "(width, height)"
          }
        ]
      },
      {
        "type": "formatted",
        "text": "，要实现 "
      },
      {
        "type": "inline-math",
        "tex": "\\text{zoom}",
        "children": [
          {
            "type": "formatted",
            "text": "zoom"
          }
        ]
      },
      {
        "type": "formatted",
        "text": " 倍的缩放，那么只要将视口的宽度和高度设置为 "
      },
      {
        "type": "inline-math",
        "tex": "(\\dfrac{\\text{width}}{\\text{zoom}}, \\dfrac{\\text{height}}{\\text{zoom}})",
        "children": [
          {
            "type": "formatted",
            "text": "(\\frac{width}{zoom}, \\frac{height}{zoom})"
          }
        ]
      },
      {
        "type": "formatted",
        "text": "﻿即可。"
      }
    ]
  },
  {
    "type": "paragraph",
    "children": [
      {
        "type": "formatted",
        "text": "如果我们希望在进行缩放时，某个点相对于视口保持不变呢，考虑一个场景，在滚动滚动时我们缩放画布，但是希望此时鼠标所在的点相对于视口是不变的"
      }
    ]
  },
  {
    "type": "image",
    "url": "https://blog-hostimaging.oss-cn-beijing.aliyuncs.com/%E7%BC%A9%E6%94%BE_1e144945-7fad-4082-9ac4-c23f6f2b9cd5.png",
    "pasteUploading": false,
    "children": [
      {
        "type": "formatted",
        "text": ""
      }
    ]
  },
  {
    "type": "paragraph",
    "children": [
      {
        "type": "formatted",
        "text": "假设以点 "
      },
      {
        "type": "inline-math",
        "tex": "(x, y)",
        "children": [
          {
            "type": "formatted",
            "text": "(x, y)"
          }
        ]
      },
      {
        "type": "formatted",
        "text": " 进行缩放，在缩放完成后，点 "
      },
      {
        "type": "inline-math",
        "tex": "(x, y)",
        "children": [
          {
            "type": "formatted",
            "text": "(x, y)"
          }
        ]
      },
      {
        "type": "formatted",
        "text": " 相对于画布应保持不变，即该点始终距离画布左侧为 "
      },
      {
        "type": "inline-math",
        "tex": "\\text{offsetX}",
        "children": [
          {
            "type": "formatted",
            "text": "offsetX"
          }
        ]
      },
      {
        "type": "formatted",
        "text": " "
      },
      {
        "type": "formatted",
        "text": "像素",
        "color": "#e33a32",
        "darkColor": "#fa7873",
        "bold": true
      },
      {
        "type": "formatted",
        "text": "，距离画布顶部 "
      },
      {
        "type": "inline-math",
        "tex": "\\text{offsetY}",
        "children": [
          {
            "type": "formatted",
            "text": "offsetY"
          }
        ]
      },
      {
        "type": "formatted",
        "text": " "
      },
      {
        "type": "formatted",
        "text": "像素",
        "color": "#e33a32",
        "darkColor": "#fa7873",
        "bold": true
      },
      {
        "type": "formatted",
        "text": "在缩放前后都是一样的。"
      }
    ]
  },
  {
    "type": "paragraph",
    "children": [
      {
        "type": "formatted",
        "text": "设缩放前的缩放比例为 "
      },
      {
        "type": "inline-math",
        "tex": "\\text{zoom}",
        "children": [
          {
            "type": "formatted",
            "text": "zoom"
          }
        ]
      },
      {
        "type": "formatted",
        "text": "，缩放后的缩放比例为 "
      },
      {
        "type": "inline-math",
        "tex": "\\text{newZoom}",
        "children": [
          {
            "type": "formatted",
            "text": "newZoom"
          }
        ]
      },
      {
        "type": "formatted",
        "text": "，缩放前左上角的坐标为 "
      },
      {
        "type": "inline-math",
        "tex": "(\\text{minX}, \\text{minY})",
        "children": [
          {
            "type": "formatted",
            "text": "(minX, minY)"
          }
        ]
      },
      {
        "type": "formatted",
        "text": "﻿，求缩放后左上角的坐标 "
      },
      {
        "type": "inline-math",
        "tex": "(\\text{newMinX}, \\text{newMinY})",
        "children": [
          {
            "type": "formatted",
            "text": "(newMinX, newMinY)"
          }
        ]
      },
      {
        "type": "formatted",
        "text": "﻿。"
      }
    ]
  },
  {
    "type": "paragraph",
    "children": [
      {
        "type": "formatted",
        "text": "考虑 "
      },
      {
        "type": "inline-math",
        "tex": "x",
        "children": [
          {
            "type": "formatted",
            "text": "x"
          }
        ]
      },
      {
        "type": "formatted",
        "text": " 方向，可以得到两个等式"
      }
    ]
  },
  {
    "type": "block-math",
    "tex": "\\begin{aligned}\n(x - \\text{minX}) \\cdot \\text{zoom} &= \\text{offsetX} \\\\\n(x - \\text{newMinX}) \\cdot \\text{newZoom} &= \\text{offsetX} \\\\\n\\end{aligned}",
    "children": [
      {
        "type": "formatted",
        "text": ""
      }
    ]
  },
  {
    "type": "paragraph",
    "children": [
      {
        "type": "formatted",
        "text": "解此方程可以得到"
      }
    ]
  },
  {
    "type": "block-math",
    "tex": "\\text{newMinX} = \\text{offsetX} \\cdot (\\cfrac{1}{\\text{zoom}} - \\cfrac{1}{\\text{newZoom}}) + \\text{minX}",
    "children": [
      {
        "type": "formatted",
        "text": ""
      }
    ]
  },
  {
    "type": "paragraph",
    "children": [
      {
        "type": "formatted",
        "text": "同理可以得到"
      }
    ]
  },
  {
    "type": "block-math",
    "tex": "\\text{newMinY} = \\text{offsetY} \\cdot (\\cfrac{1}{\\text{zoom}} - \\cfrac{1}{\\text{newZoom}}) + \\text{minY}",
    "children": [
      {
        "type": "formatted",
        "text": ""
      }
    ]
  },
  {
    "type": "paragraph",
    "children": [
      {
        "type": "formatted",
        "text": "所以为了在缩放的过程中保持点的位置不变，除了需要将视口的大小设置为 "
      },
      {
        "type": "inline-math",
        "tex": "(\\cfrac{\\text{width}}{\\text{newZoom}}, \\cfrac{\\text{height}}{\\text{newZoom}})",
        "children": [
          {
            "type": "formatted",
            "text": "(\\cfrac{\\text{width}}{\\text{newZoom}}, \\cfrac{\\text{height}}{\\text{newZoom}})"
          }
        ]
      },
      {
        "type": "formatted",
        "text": "﻿，还需要将视口左上角坐标调整为 "
      },
      {
        "type": "inline-math",
        "tex": "(\\text{offsetX} \\cdot (\\cfrac{1}{\\text{zoom}} - \\cfrac{1}{\\text{newZoom}}) + \\text{minX}, \\text{offsetY} \\cdot (\\cfrac{1}{\\text{zoom}} - \\cfrac{1}{\\text{newZoom}}) + \\text{minY}) ",
        "children": [
          {
            "type": "formatted",
            "text": "(\\text{offsetX} \\cdot (\\cfrac{1}{\\text{zoom}} - \\cfrac{1}{\\text{newZoom}}) + \\text{minX}, \\text{offsetY} \\cdot (\\cfrac{1}{\\text{zoom}} - \\cfrac{1}{\\text{newZoom}}) + \\text{minY}) "
          }
        ]
      },
      {
        "type": "formatted",
        "text": "﻿。"
      }
    ]
  },
  {
    "type": "custom-block",
    "content": "const { useRef, useEffect } = React;\n\nlet zoom = 1;\nlet minX = 0;\nlet minY = 0;\nlet startPosition = null;\n\nconst Component = () => {\n  const containerRef = useRef(null);\n  const svgRef = useRef(null);\n  \n  useEffect(() => {\n    const boardContainer = containerRef.current;\n    const board = svgRef.current;\n    if (!boardContainer || !board) return;\n    \n    const { width, height } = boardContainer.getBoundingClientRect();\n    board.setAttribute('viewBox', `${minX} ${minY} ${width / zoom} ${height /zoom}`);\n    \n    const handlePointerDown = (e) => {\n       startPosition = {\n         x: e.clientX,\n         y: e.clientY,\n       }\n    }\n    \n    const handlePointerMove = (e) => {\n      if (!startPosition || !boardContainer || !board) return;\n      const { width, height } = boardContainer.getBoundingClientRect();\n      const endPosition = {\n          x: e.clientX,\n          y: e.clientY\n      }\n      const offsetX = endPosition.x - startPosition.x;\n      const offsetY = endPosition.y - startPosition.y;\n      const newMinX = minX - offsetX / zoom;\n      const newMinY = minY - offsetY / zoom;\n      board.setAttribute('viewBox', `${newMinX} ${newMinY} ${width / zoom} ${height /zoom}`);\n    }\n\n    const handlePointerUp = (e) => {\n      if (!startPosition || !boardContainer || !board) return;\n      const { width, height } = boardContainer.getBoundingClientRect();\n      const endPosition = {\n          x: e.clientX,\n          y: e.clientY\n      }\n      const offsetX = endPosition.x - startPosition.x;\n      const offsetY = endPosition.y - startPosition.y;\n      const newMinX = minX - offsetX / zoom;\n      const newMinY = minY - offsetY / zoom;\n      board.setAttribute('viewBox', `${newMinX} ${newMinY} ${width / zoom} ${height /zoom}`);\n      minX = newMinX;\n      minY = newMinY;\n      startPosition = null;\n    }\n    \n    const handleWheel = (e) => {\n      if (!boardContainer || !board) return;\n      e.preventDefault();\n      const { width, height, x: containerX, y: containerY } = boardContainer.getBoundingClientRect();\n\n      const x = e.clientX;\n      const y = e.clientY;\n\n      const offsetX = x - containerX;\n      const offsetY = y - containerY;\n      let newZoom;\n      if (e.deltaY < 0) {\n          newZoom = Math.min(zoom * 1.1, 10);\n      } else {\n          newZoom = Math.max(zoom * 0.9, 0.1);\n      }\n      const newMinX = minX + offsetX * (1 / zoom - 1 / newZoom);\n      const newMinY = minY + offsetY * (1 / zoom - 1 / newZoom);\n      board.setAttribute('viewBox', `${newMinX} ${newMinY} ${width / newZoom} ${height / newZoom}`);\n      zoom = newZoom;\n      minX = newMinX;\n      minY = newMinY;\n    }\n    \n    boardContainer.addEventListener('pointerdown', handlePointerDown);\n    boardContainer.addEventListener('pointermove', handlePointerMove);\n    boardContainer.addEventListener('pointerup', handlePointerUp);\n    boardContainer.addEventListener('wheel', handleWheel);\n    \n    return () => {\n      if (boardContainer) {\n        boardContainer.removeEventListener('pointerdown', handlePointerDown);\n        boardContainer.removeEventListener('pointermove', handlePointerMove);\n      \tboardContainer.removeEventListener('pointerup', handlePointerUp);\n      \tboardContainer.removeEventListener('wheel', handleWheel);\n      }\n    }\n  }, [])\n  \n  return (\n  \t<div ref={containerRef} style={{ width: '100%', height: 500, border: '2px dashed #aaa' }}>\n      <svg ref={svgRef} width=\"100%\" height=\"100%\">\n        <rect x=\"100\" y=\"100\" width=\"200\" height=\"100\" fill=\"#e77c8e\" fill-opacity=\"0.5\" />\n      </svg>\n    </div>\n  )\n}\n",
    "children": [
      {
        "type": "formatted",
        "text": ""
      }
    ]
  }
]