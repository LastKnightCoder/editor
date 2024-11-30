import{u as p,j as t,D as n,H as d,I as o,c}from"./index-a214538e.js";import{d as h}from"./mermaid-5603ff64.js";import{E as y}from"./index-2739238e.js";import{r as g}from"./react-51129ece.js";import"./react-dom-d9a25264.js";import"./katex-3eb4982e.js";const a=[{type:"header",children:[{type:"formatted",text:"软件理念"}],level:2},{type:"paragraph",children:[{type:"formatted",text:"笔记的理念大部分来自于《笔记卡片写作法》和《打造第二大脑》这两本书，经过一年多的实践之后，我发展出了一套自己的理念，同时也在不断的调整这款软件，以下是我对打造自己的知识体系的思考。"}]},{type:"paragraph",children:[{type:"formatted",text:"如何打造自己的知识体系。"}]},{type:"image",url:"http://blog-hostimaging.oss-cn-beijing.aliyuncs.com/%E7%AC%94%E8%AE%B0%E7%B3%BB%E7%BB%9F_0fadf10f-5dfc-490d-8d58-f1070a07a522.png",pasteUploading:!1,children:[{type:"formatted",text:""}]},{type:"paragraph",children:[{type:"formatted",text:"以项目为分界点，分为两个部分："}]},{type:"bulleted-list",children:[{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"输入，项目之前的流程为输入部分，以正在进行的项目为导向，广泛收集与该项目有关的所有信息，包括但不限于书本、论文、视频、博客、音频等等渠道，在这一步仅作收集，可以是直接对文章的摘录、课堂笔记、突然的灵感，不追求形式，收集的资料可以是一张截图，一个链接，一段话，但是要注意标明出处，方便后续追溯。"}]},{type:"paragraph",children:[{type:"formatted",text:"这一步最重要的是记，不要追求完美，对自己有帮助，能引发自己的思考就可以记录下来。"}]}]},{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"输出，输入代表的仅仅是别人的想法，是未经我们思考加工的资料，无法进一步形成我们的知识体系，内化为我们的学问，为了构建知识体系，首先我们需要对项目中收集的资料进行提炼和总结，形成一张张包含我们思考的卡片。"}]},{type:"paragraph",children:[{type:"formatted",text:"在形成卡片时，我们可以为卡片打上标签分类，或者在卡片中引用其它卡片，通过这两种方式，可以聚类相似的卡片，久而久之，这些卡片会"},{type:"formatted",text:"自下而上",color:"#e33a32",darkColor:"#fa7873"},{type:"formatted",text:"自动地形成一些主题，通过梳理主题下的卡片，便可以形成系统阐述这一主题的文章。"}]},{type:"paragraph",children:[{type:"formatted",text:"这些文章可以认为是我们对某个领域局部的认知，就像盲人摸象，是局部的、片面的，如果要全面、深入且系统的构建该领域的体系结构，我们还需要在卡片和文章的基础上形成知识库，知识库是对该领域一个系统的梳理，知识库可以认为是知识体系在该领域的外在表现，当我们根据已有的文章和卡片打造出一个知识库时，我们的知识体系就已经构建起来了。"}]}]}]},{type:"callout",calloutType:"note",title:"注意",children:[{type:"numbered-list",children:[{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"项目和知识库不是一一对应的关系，一个知识库可以由多个项目沉淀的内容形成，一个项目也可以同时为多个知识库提供内容，二者时多对多的关系。"}]}]},{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"形成知识库并不是终点，只是初步形成了知识体系，这个知识体系还需要不断的补充和完善，甚至随着认知的深入，知识体系的结构也会随之发生调整"}]}]}]}]},{type:"paragraph",children:[{type:"formatted",text:"有两种学习方式，自上而下和自下而上："}]},{type:"bulleted-list",children:[{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"自上而下是先有一个目标，并且有一个知识框架，然后去收集资料补充框架内容，优点是目的性强，主动性高；缺点是因为是初学者的身份，定的框架不合理，不系统。"}]}]},{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"自下而上，先不定框架，自然而然的等待知识点形成网络，优点是框架自然而然生长出来，知识体系系统且合理，缺点是缺乏主动性，知识连接过程缓慢，笔记系统在前期充斥着大量无关的知识点。"}]}]}]},{type:"paragraph",children:[{type:"formatted",text:"以上知识体系构建流程很好的结合了自上而下和自下而上的学习方式，对于输入是自上而下的，我们以项目为导向去广泛"},{type:"formatted",text:"主动地",color:"#e33a32",darkColor:"#fa7873",bold:!0},{type:"formatted",text:"收集资料，有很强的目的性，而形成知识体系的过程是自下而上，根据形成的一张张卡片，知识体系自然生长。"}]},{type:"header",children:[{type:"formatted",text:"编辑器能力"}],level:2},{type:"header",children:[{type:"formatted",text:"Markdown 语法"}],level:3},{type:"paragraph",children:[{type:"formatted",text:"软件开发的初衷是为了开发一套开源的所见即所得的 Markdown 编辑器，类似于 Typora，因此支持 Markdown 语法和所见即所得的富文本编辑"}]},{type:"image",url:"https://blog-hostimaging.oss-cn-beijing.aliyuncs.com/Markdown_17fdcb00-1eca-434e-827f-a4e96d757eb1.gif",pasteUploading:!1,children:[{type:"formatted",text:""}]},{type:"header",children:[{type:"formatted",text:"支持的块"}],level:3},{type:"paragraph",children:[{type:"formatted",text:"除了支持一些基本 Markdown 块，还支持很多其他的富文本块，可以通过输入 "},{type:"styled-text",color:"blue",children:[{type:"formatted",text:"/"}]},{type:"formatted",text:" 唤出面板"}]},{type:"image",url:"https://blog-hostimaging.oss-cn-beijing.aliyuncs.com/slash_ab2bd2e0-d4f1-41d6-90f9-c3d78d1abd22.gif",pasteUploading:!1,children:[{type:"formatted",text:""}]},{type:"paragraph",children:[{type:"formatted",text:"支持的块包括："}]},{type:"bulleted-list",children:[{type:"list-item",allContent:[{type:"paragraph",children:[{type:"formatted",text:"标题"}]},{type:"paragraph",children:[{type:"formatted",text:"支持六级标题"}]}],isFold:!1,children:[{type:"paragraph",children:[{type:"formatted",text:"标题"}]},{type:"paragraph",children:[{type:"formatted",text:"支持六级标题"}]}]},{type:"list-item",allContent:[{type:"paragraph",children:[{type:"formatted",text:"引用"}]},{type:"blockquote",children:[{type:"paragraph",children:[{type:"formatted",text:"这是一个引用！"}]}]}],isFold:!1,children:[{type:"paragraph",children:[{type:"formatted",text:"引用"}]},{type:"blockquote",children:[{type:"paragraph",children:[{type:"formatted",text:"这是一个引用！"}]}]}]},{type:"list-item",allContent:[{type:"paragraph",children:[{type:"formatted",text:"列表"}]},{type:"bulleted-list",children:[{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"无序列表"}]}]},{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"有序列表"}]}]},{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"任务列表"}]}]}]},{type:"paragraph",children:[{type:"formatted",text:"当列表包含不止一个块的内容时，可以进行收起。"}]}],isFold:!1,children:[{type:"paragraph",children:[{type:"formatted",text:"列表"}]},{type:"bulleted-list",children:[{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"无序列表"}]}]},{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"有序列表"}]}]},{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"任务列表"}]}]}]},{type:"paragraph",children:[{type:"formatted",text:"当列表包含不止一个块的内容时，可以进行收起。"}]}]},{type:"list-item",allContent:[{type:"paragraph",children:[{type:"formatted",text:"表格"}]},{type:"paragraph",children:[{type:"formatted",text:"支持简单的表格，表格中仅支持简单的纯文本，不支持嵌套的块"}]},{type:"table",children:[{type:"table-row",children:[{type:"table-cell",children:[{type:"formatted",text:"学科"}]},{type:"table-cell",children:[{type:"formatted",text:"成绩"}]},{type:"table-cell",children:[{type:"formatted",text:"老师"}]}]},{type:"table-row",children:[{type:"table-cell",children:[{type:"formatted",text:"语文"}]},{type:"table-cell",children:[{type:"formatted",text:"88"}]},{type:"table-cell",children:[{type:"formatted",text:"不不不"}]}]},{type:"table-row",children:[{type:"table-cell",children:[{type:"formatted",text:"数学"}]},{type:"table-cell",children:[{type:"formatted",text:"98"}]},{type:"table-cell",children:[{type:"formatted",text:"啊啊啊"}]}]}]},{type:"paragraph",children:[{type:"formatted",text:"后续考虑支持列的类型，如日期，Checkbox，链接等等。"}]}],isFold:!1,children:[{type:"paragraph",children:[{type:"formatted",text:"表格"}]},{type:"paragraph",children:[{type:"formatted",text:"支持简单的表格，表格中仅支持简单的纯文本，不支持嵌套的块"}]},{type:"table",children:[{type:"table-row",children:[{type:"table-cell",children:[{type:"formatted",text:"学科"}]},{type:"table-cell",children:[{type:"formatted",text:"成绩"}]},{type:"table-cell",children:[{type:"formatted",text:"老师"}]}]},{type:"table-row",children:[{type:"table-cell",children:[{type:"formatted",text:"语文"}]},{type:"table-cell",children:[{type:"formatted",text:"88"}]},{type:"table-cell",children:[{type:"formatted",text:"不不不"}]}]},{type:"table-row",children:[{type:"table-cell",children:[{type:"formatted",text:"数学"}]},{type:"table-cell",children:[{type:"formatted",text:"98"}]},{type:"table-cell",children:[{type:"formatted",text:"啊啊啊"}]}]}]},{type:"paragraph",children:[{type:"formatted",text:"后续考虑支持列的类型，如日期，Checkbox，链接等等。"}]}]},{type:"list-item",allContent:[{type:"paragraph",children:[{type:"formatted",text:"Callout"}]},{type:"bulleted-list",children:[{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"提示"}]},{type:"callout",calloutType:"tip",title:"",children:[{type:"paragraph",children:[{type:"formatted",text:"这是提示块。"}]}]}]},{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"注意"}]},{type:"callout",calloutType:"note",title:"",children:[{type:"paragraph",children:[{type:"formatted",text:"这是注意块。"}]}]}]},{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"信息"}]},{type:"callout",calloutType:"info",title:"",children:[{type:"paragraph",children:[{type:"formatted",text:"这是信息块。"}]}]}]},{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"警告"}]},{type:"callout",calloutType:"warning",title:"",children:[{type:"paragraph",children:[{type:"formatted",text:"这是警告块。"}]}]}]},{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"危险"}]},{type:"callout",calloutType:"danger",title:"",children:[{type:"paragraph",children:[{type:"formatted",text:"这是危险块。"}]}]}]}]}],isFold:!1,children:[{type:"paragraph",children:[{type:"formatted",text:"Callout"}]},{type:"bulleted-list",children:[{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"提示"}]},{type:"callout",calloutType:"tip",title:"",children:[{type:"paragraph",children:[{type:"formatted",text:"这是提示块。"}]}]}]},{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"注意"}]},{type:"callout",calloutType:"note",title:"",children:[{type:"paragraph",children:[{type:"formatted",text:"这是注意块。"}]}]}]},{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"信息"}]},{type:"callout",calloutType:"info",title:"",children:[{type:"paragraph",children:[{type:"formatted",text:"这是信息块。"}]}]}]},{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"警告"}]},{type:"callout",calloutType:"warning",title:"",children:[{type:"paragraph",children:[{type:"formatted",text:"这是警告块。"}]}]}]},{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"危险"}]},{type:"callout",calloutType:"danger",title:"",children:[{type:"paragraph",children:[{type:"formatted",text:"这是危险块。"}]}]}]}]}]},{type:"list-item",allContent:[{type:"paragraph",children:[{type:"formatted",text:"详情块"}]},{type:"paragraph",children:[{type:"formatted",text:"详情块可以进行展开收起"}]},{type:"detail",title:"如何开发一款软件",open:!0,children:[{type:"numbered-list",children:[{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"第一步：xxxx"}]}]},{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"第二步：xxxx"}]}]}]}]}],isFold:!1,children:[{type:"paragraph",children:[{type:"formatted",text:"详情块"}]},{type:"paragraph",children:[{type:"formatted",text:"详情块可以进行展开收起"}]},{type:"detail",title:"如何开发一款软件",open:!0,children:[{type:"numbered-list",children:[{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"第一步：xxxx"}]}]},{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"第二步：xxxx"}]}]}]}]}]},{type:"list-item",allContent:[{type:"paragraph",children:[{type:"formatted",text:"高亮块"}]},{type:"paragraph",children:[{type:"formatted",text:"高亮块即带有背景和边框颜色的块，共内置有六种颜色"}]},{type:"highlight-block",color:"red",children:[{type:"paragraph",children:[{type:"formatted",text:""}]}]},{type:"highlight-block",color:"blue",children:[{type:"paragraph",children:[{type:"formatted",text:""}]}]},{type:"highlight-block",color:"green",children:[{type:"paragraph",children:[{type:"formatted",text:""}]}]},{type:"highlight-block",color:"orange",children:[{type:"paragraph",children:[{type:"formatted",text:""}]}]},{type:"highlight-block",color:"purple",children:[{type:"paragraph",children:[{type:"formatted",text:""}]}]},{type:"highlight-block",color:"yellow",children:[{type:"paragraph",children:[{type:"formatted",text:""}]}]}],isFold:!1,children:[{type:"paragraph",children:[{type:"formatted",text:"高亮块"}]},{type:"paragraph",children:[{type:"formatted",text:"高亮块即带有背景和边框颜色的块，共内置有六种颜色"}]},{type:"highlight-block",color:"red",children:[{type:"paragraph",children:[{type:"formatted",text:""}]}]},{type:"highlight-block",color:"blue",children:[{type:"paragraph",children:[{type:"formatted",text:""}]}]},{type:"highlight-block",color:"green",children:[{type:"paragraph",children:[{type:"formatted",text:""}]}]},{type:"highlight-block",color:"orange",children:[{type:"paragraph",children:[{type:"formatted",text:""}]}]},{type:"highlight-block",color:"purple",children:[{type:"paragraph",children:[{type:"formatted",text:""}]}]},{type:"highlight-block",color:"yellow",children:[{type:"paragraph",children:[{type:"formatted",text:""}]}]}]},{type:"list-item",allContent:[{type:"paragraph",children:[{type:"formatted",text:"图片"}]},{type:"image",url:"",children:[{type:"formatted",text:""}]},{type:"paragraph",children:[{type:"formatted",text:"支持选择本地文件上传，或者粘贴图片的网络地址。"}]},{type:"paragraph",children:[{type:"formatted",text:"在使用图片之前，需要在设置页先配置图床，目前有三个选项："}]},{type:"bulleted-list",children:[{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"本地，不需要进行任何设置，图片存在在本地电脑中"}]},{type:"image",url:"C:\\Users\\pc\\.editor\\resources\\image_ec800cae-0214-49fd-bc67-9661a841aec1.png",pasteUploading:!1,children:[{type:"formatted",text:""}]},{type:"bulleted-list",children:[{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"优点，是数据离线，无网也可以使用，省心"}]}]},{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"缺点，如果有迁移笔记的需要，比较折腾"}]}]}]}]},{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"Github"}]},{type:"image",url:"https://blog-hostimaging.oss-cn-beijing.aliyuncs.com/image_d373d63d-78b2-4a5f-a3dd-34a7128faa07.png",pasteUploading:!1,children:[{type:"formatted",text:""}]},{type:"bulleted-list",children:[{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"优点，免费，数据放在云端，同步数据方便"}]}]},{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"缺点，由于墙的原因，慢"}]}]}]}]},{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"阿里云 OSS"}]},{type:"image",url:"https://blog-hostimaging.oss-cn-beijing.aliyuncs.com/image_886a5445-fe51-49b3-ba82-515a08353358.png",pasteUploading:!1,children:[{type:"formatted",text:""}]},{type:"bulleted-list",children:[{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"优点，国内访问速度快，以及迁移笔记也方便"}]}]},{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"缺点，需要付费，但是很便宜，一年十几块钱"}]}]}]}]}]},{type:"paragraph",children:[{type:"formatted",text:""}]}],isFold:!1,children:[{type:"paragraph",children:[{type:"formatted",text:"图片"}]},{type:"image",url:"",children:[{type:"formatted",text:""}]},{type:"paragraph",children:[{type:"formatted",text:"支持选择本地文件上传，或者粘贴图片的网络地址。"}]},{type:"paragraph",children:[{type:"formatted",text:"在使用图片之前，需要在设置页先配置图床，目前有三个选项："}]},{type:"bulleted-list",children:[{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"本地，不需要进行任何设置，图片存在在本地电脑中"}]},{type:"image",url:"https://blog-hostimaging.oss-cn-beijing.aliyuncs.com/image_200ef0ed-b934-4c57-a1ff-826c725cb86c.png",pasteUploading:!1,children:[{type:"formatted",text:""}]},{type:"bulleted-list",children:[{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"优点，是数据离线，无网也可以使用，省心"}]}]},{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"缺点，如果有迁移笔记的需要，比较折腾"}]}]}]}]},{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"Github"}]},{type:"image",url:"https://blog-hostimaging.oss-cn-beijing.aliyuncs.com/image_d373d63d-78b2-4a5f-a3dd-34a7128faa07.png",pasteUploading:!1,children:[{type:"formatted",text:""}]},{type:"bulleted-list",children:[{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"优点，免费，数据放在云端，同步数据方便"}]}]},{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"缺点，由于墙的原因，慢"}]}]}]}]},{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"阿里云 OSS"}]},{type:"image",url:"https://blog-hostimaging.oss-cn-beijing.aliyuncs.com/image_886a5445-fe51-49b3-ba82-515a08353358.png",pasteUploading:!1,children:[{type:"formatted",text:""}]},{type:"bulleted-list",children:[{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"优点，国内访问速度快，以及迁移笔记也方便"}]}]},{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"缺点，需要付费，但是很便宜，一年十几块钱"}]}]}]}]}]}]},{type:"list-item",allContent:[{type:"paragraph",children:[{type:"formatted",text:"图册"}]},{type:"paragraph",children:[{type:"formatted",text:"可以上传多张图片作为图集，目前支持三种模式"}]},{type:"bulleted-list",children:[{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"轮播"}]},{type:"image-gallery",mode:3,images:[{id:"99029469-bea2-42f5-a7bd-93e42680541e",url:"https://jsd.cdn.zzko.cn/gh/LastKnightCoder/image-for-2023@master/wallhaven-zm9qeo_ddc67b02-ba78-41a3-a2bb-85d44ab4493e.jpg"},{id:"ba9db275-985a-418e-97fb-795772d0d140",url:"https://jsd.cdn.zzko.cn/gh/LastKnightCoder/image-for-2023@master/wallhaven-kwm2r6_c9dcc79e-2abd-4ac4-bde9-12fd01794cbf.jpg"},{id:"20a47a3c-9c4b-460c-9a0b-355183a6564b",url:"https://jsd.cdn.zzko.cn/gh/LastKnightCoder/image-for-2023@master/wallhaven-j33p25_32ffaf42-3d49-4846-bf95-2a7850df7a5e.jpg"}],children:[{type:"formatted",text:""}],height:200,wider:!1,columnCount:3}]},{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"横向"}]},{type:"image-gallery",mode:1,images:[{id:"99029469-bea2-42f5-a7bd-93e42680541e",url:"https://jsd.cdn.zzko.cn/gh/LastKnightCoder/image-for-2023@master/wallhaven-zm9qeo_ddc67b02-ba78-41a3-a2bb-85d44ab4493e.jpg"},{id:"ba9db275-985a-418e-97fb-795772d0d140",url:"https://jsd.cdn.zzko.cn/gh/LastKnightCoder/image-for-2023@master/wallhaven-kwm2r6_c9dcc79e-2abd-4ac4-bde9-12fd01794cbf.jpg"},{id:"20a47a3c-9c4b-460c-9a0b-355183a6564b",url:"https://jsd.cdn.zzko.cn/gh/LastKnightCoder/image-for-2023@master/wallhaven-j33p25_32ffaf42-3d49-4846-bf95-2a7850df7a5e.jpg"}],children:[{type:"formatted",text:""}],height:200,wider:!1,columnCount:3}]},{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"纵向"}]},{type:"image-gallery",mode:2,images:[{id:"99029469-bea2-42f5-a7bd-93e42680541e",url:"https://jsd.cdn.zzko.cn/gh/LastKnightCoder/image-for-2023@master/wallhaven-zm9qeo_ddc67b02-ba78-41a3-a2bb-85d44ab4493e.jpg"},{id:"ba9db275-985a-418e-97fb-795772d0d140",url:"https://jsd.cdn.zzko.cn/gh/LastKnightCoder/image-for-2023@master/wallhaven-kwm2r6_c9dcc79e-2abd-4ac4-bde9-12fd01794cbf.jpg"},{id:"20a47a3c-9c4b-460c-9a0b-355183a6564b",url:"https://jsd.cdn.zzko.cn/gh/LastKnightCoder/image-for-2023@master/wallhaven-j33p25_32ffaf42-3d49-4846-bf95-2a7850df7a5e.jpg"}],children:[{type:"formatted",text:""}],height:200,wider:!1,columnCount:3}]}]}],isFold:!1,children:[{type:"paragraph",children:[{type:"formatted",text:"图册"}]},{type:"paragraph",children:[{type:"formatted",text:"可以上传多张图片作为图集，目前支持三种模式"}]},{type:"bulleted-list",children:[{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"轮播"}]},{type:"image-gallery",mode:3,images:[{id:"99029469-bea2-42f5-a7bd-93e42680541e",url:"https://jsd.cdn.zzko.cn/gh/LastKnightCoder/image-for-2023@master/wallhaven-zm9qeo_ddc67b02-ba78-41a3-a2bb-85d44ab4493e.jpg"},{id:"ba9db275-985a-418e-97fb-795772d0d140",url:"https://jsd.cdn.zzko.cn/gh/LastKnightCoder/image-for-2023@master/wallhaven-kwm2r6_c9dcc79e-2abd-4ac4-bde9-12fd01794cbf.jpg"},{id:"20a47a3c-9c4b-460c-9a0b-355183a6564b",url:"https://jsd.cdn.zzko.cn/gh/LastKnightCoder/image-for-2023@master/wallhaven-j33p25_32ffaf42-3d49-4846-bf95-2a7850df7a5e.jpg"}],children:[{type:"formatted",text:""}],height:200,wider:!1,columnCount:3}]},{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"横向"}]},{type:"image-gallery",mode:1,images:[{id:"99029469-bea2-42f5-a7bd-93e42680541e",url:"https://jsd.cdn.zzko.cn/gh/LastKnightCoder/image-for-2023@master/wallhaven-zm9qeo_ddc67b02-ba78-41a3-a2bb-85d44ab4493e.jpg"},{id:"ba9db275-985a-418e-97fb-795772d0d140",url:"https://jsd.cdn.zzko.cn/gh/LastKnightCoder/image-for-2023@master/wallhaven-kwm2r6_c9dcc79e-2abd-4ac4-bde9-12fd01794cbf.jpg"},{id:"20a47a3c-9c4b-460c-9a0b-355183a6564b",url:"https://jsd.cdn.zzko.cn/gh/LastKnightCoder/image-for-2023@master/wallhaven-j33p25_32ffaf42-3d49-4846-bf95-2a7850df7a5e.jpg"}],children:[{type:"formatted",text:""}],height:200,wider:!1,columnCount:3}]},{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"纵向"}]},{type:"image-gallery",mode:2,images:[{id:"99029469-bea2-42f5-a7bd-93e42680541e",url:"https://jsd.cdn.zzko.cn/gh/LastKnightCoder/image-for-2023@master/wallhaven-zm9qeo_ddc67b02-ba78-41a3-a2bb-85d44ab4493e.jpg"},{id:"ba9db275-985a-418e-97fb-795772d0d140",url:"https://jsd.cdn.zzko.cn/gh/LastKnightCoder/image-for-2023@master/wallhaven-kwm2r6_c9dcc79e-2abd-4ac4-bde9-12fd01794cbf.jpg"},{id:"20a47a3c-9c4b-460c-9a0b-355183a6564b",url:"https://jsd.cdn.zzko.cn/gh/LastKnightCoder/image-for-2023@master/wallhaven-j33p25_32ffaf42-3d49-4846-bf95-2a7850df7a5e.jpg"}],children:[{type:"formatted",text:""}],height:200,wider:!1,columnCount:3}]}]}]},{type:"list-item",allContent:[{type:"paragraph",children:[{type:"formatted",text:"代码块"}]},{type:"code-block",code:`int main() {
  printf("Hello World\\n");
  return;
}`,language:"C",uuid:"d1eb7756-5b30-4a7a-aabd-485fd243cd24",children:[{type:"formatted",text:""}]}],isFold:!1,children:[{type:"paragraph",children:[{type:"formatted",text:"代码块"}]},{type:"code-block",code:`int main() {
  printf("Hello World\\n");
  return;
}`,language:"C",uuid:"d1eb7756-5b30-4a7a-aabd-485fd243cd24",children:[{type:"formatted",text:""}]}]},{type:"list-item",allContent:[{type:"paragraph",children:[{type:"formatted",text:"Tabs"}]},{type:"paragraph",children:[{type:"formatted",text:"在不同的 Tab 下显示不同的内容，比如对于不同的操作系统有不同的安装命令"}]},{type:"tabs",activeKey:"782316b9-96bc-41c5-a671-87fae7af84f8",tabsContent:[{key:"782316b9-96bc-41c5-a671-87fae7af84f8",title:"Windows",content:[{type:"paragraph",children:[{type:"formatted",text:"使用 scope 安装"}]}]},{key:"c419153e-1789-4bc5-be84-b814cfbf1413",content:[{type:"paragraph",children:[{type:"formatted",text:"使用 brew 安装"}]}],title:"Mac"},{key:"d5217f34-de48-4c31-b304-ab878dc6efe2",content:[{type:"paragraph",children:[{type:"formatted",text:"使用 apt 安装"}]}],title:"Linux"}],children:[{type:"paragraph",children:[{type:"formatted",text:"使用 scope 安装"}]}]}],isFold:!1,children:[{type:"paragraph",children:[{type:"formatted",text:"Tabs"}]},{type:"paragraph",children:[{type:"formatted",text:"在不同的 Tab 下显示不同的内容，比如对于不同的操作系统有不同的安装命令"}]},{type:"tabs",activeKey:"782316b9-96bc-41c5-a671-87fae7af84f8",tabsContent:[{key:"782316b9-96bc-41c5-a671-87fae7af84f8",title:"Windows",content:[{type:"paragraph",children:[{type:"formatted",text:"使用 scope 安装"}]}]},{key:"c419153e-1789-4bc5-be84-b814cfbf1413",content:[{type:"paragraph",children:[{type:"formatted",text:"使用 brew 安装"}]}],title:"Mac"},{key:"d5217f34-de48-4c31-b304-ab878dc6efe2",content:[{type:"paragraph",children:[{type:"formatted",text:"使用 apt 安装"}]}],title:"Linux"}],children:[{type:"paragraph",children:[{type:"formatted",text:"使用 scope 安装"}]}]}]},{type:"list-item",allContent:[{type:"paragraph",children:[{type:"formatted",text:"Mermaid"}]},{type:"paragraph",children:[{type:"formatted",text:"支持使用 Mermaid 绘制图表，支持的图表类型非常多"}]},{type:"bulleted-list",children:[{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"时序图"}]},{type:"mermaid",chart:`sequenceDiagram
    Alice->>John: Hello John, how are you?
    John-->>Alice: Great!
    Alice-)John: See you later!`,children:[{type:"formatted",text:""}]}]},{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"类图"}]},{type:"mermaid",chart:`---
title: Animal example
---
classDiagram
    note "From Duck till Zebra"
    Animal <|-- Duck
    note for Duck "can fly\\ncan swim\\ncan dive\\ncan help in debugging"
    Animal <|-- Fish
    Animal <|-- Zebra
    Animal : +int age
    Animal : +String gender
    Animal: +isMammal()
    Animal: +mate()
    class Duck{
        +String beakColor
        +swim()
        +quack()
    }
    class Fish{
        -int sizeInFeet
        -canEat()
    }
    class Zebra{
        +bool is_wild
        +run()
    }
`,children:[{type:"formatted",text:""}]}]},{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"甘特图"}]},{type:"mermaid",chart:`gantt
    title A Gantt Diagram
    dateFormat YYYY-MM-DD
    section Section
        A task          :a1, 2014-01-01, 30d
        Another task    :after a1, 20d
    section Another
        Task in Another :2014-01-12, 12d
        another task    :24d`,children:[{type:"formatted",text:""}]}]},{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"时间线"}]},{type:"mermaid",chart:`timeline
    title History of Social Media Platform
    2002 : LinkedIn
    2004 : Facebook
         : Google
    2005 : Youtube
    2006 : Twitter`,children:[{type:"formatted",text:""}]}]},{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"等等"}]}]}]},{type:"paragraph",children:[{type:"formatted",text:"具体跟多的用法可参考"},{type:"link",url:"https://mermaid.js.org/",openEdit:!1,children:[{type:"formatted",text:"官网"}]},{type:"formatted",text:"。"}]}],isFold:!1,children:[{type:"paragraph",children:[{type:"formatted",text:"Mermaid"}]},{type:"paragraph",children:[{type:"formatted",text:"支持使用 Mermaid 绘制图表，支持的图表类型非常多"}]},{type:"bulleted-list",children:[{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"时序图"}]},{type:"mermaid",chart:`sequenceDiagram
    Alice->>John: Hello John, how are you?
    John-->>Alice: Great!
    Alice-)John: See you later!`,children:[{type:"formatted",text:""}]}]},{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"类图"}]},{type:"mermaid",chart:`---
title: Animal example
---
classDiagram
    note "From Duck till Zebra"
    Animal <|-- Duck
    note for Duck "can fly\\ncan swim\\ncan dive\\ncan help in debugging"
    Animal <|-- Fish
    Animal <|-- Zebra
    Animal : +int age
    Animal : +String gender
    Animal: +isMammal()
    Animal: +mate()
    class Duck{
        +String beakColor
        +swim()
        +quack()
    }
    class Fish{
        -int sizeInFeet
        -canEat()
    }
    class Zebra{
        +bool is_wild
        +run()
    }
`,children:[{type:"formatted",text:""}]}]},{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"甘特图"}]},{type:"mermaid",chart:`gantt
    title A Gantt Diagram
    dateFormat YYYY-MM-DD
    section Section
        A task          :a1, 2014-01-01, 30d
        Another task    :after a1, 20d
    section Another
        Task in Another :2014-01-12, 12d
        another task    :24d`,children:[{type:"formatted",text:""}]}]},{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"时间线"}]},{type:"mermaid",chart:`timeline
    title History of Social Media Platform
    2002 : LinkedIn
    2004 : Facebook
         : Google
    2005 : Youtube
    2006 : Twitter`,children:[{type:"formatted",text:""}]}]},{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"等等"}]}]}]},{type:"paragraph",children:[{type:"formatted",text:"具体更多的用法可参考"},{type:"link",url:"https://mermaid.js.org/",openEdit:!1,children:[{type:"formatted",text:"官网"}]},{type:"formatted",text:"。"}]}]},{type:"list-item",allContent:[{type:"paragraph",children:[{type:"formatted",text:"Graphviz"}]},{type:"paragraph",children:[{type:"formatted",text:"Graphviz 也是一种通过文本来生成图形的图形语法"}]},{type:"graphviz",dot:`digraph g {
  fontname="Helvetica,Arial,sans-serif"
  node [fontname="Helvetica,Arial,sans-serif"]
  edge [fontname="Helvetica,Arial,sans-serif"]
  graph [fontsize=30 labelloc="t" label="" splines=true overlap=false rankdir = "LR"];
  ratio = auto;
  "state0" [ style = "filled, bold" penwidth = 5 fillcolor = "white" fontname = "Courier New" shape = "Mrecord" label =<<table border="0" cellborder="0" cellpadding="3" bgcolor="white"><tr><td bgcolor="black" align="center" colspan="2"><font color="white">State #0</font></td></tr><tr><td align="left" port="r0">&#40;0&#41; s -&gt; &bull;e $ </td></tr><tr><td align="left" port="r1">&#40;1&#41; e -&gt; &bull;l '=' r </td></tr><tr><td align="left" port="r2">&#40;2&#41; e -&gt; &bull;r </td></tr><tr><td align="left" port="r3">&#40;3&#41; l -&gt; &bull;'*' r </td></tr><tr><td align="left" port="r4">&#40;4&#41; l -&gt; &bull;'n' </td></tr><tr><td align="left" port="r5">&#40;5&#41; r -&gt; &bull;l </td></tr></table>> ];
  "state1" [ style = "filled" penwidth = 1 fillcolor = "white" fontname = "Courier New" shape = "Mrecord" label =<<table border="0" cellborder="0" cellpadding="3" bgcolor="white"><tr><td bgcolor="black" align="center" colspan="2"><font color="white">State #1</font></td></tr><tr><td align="left" port="r3">&#40;3&#41; l -&gt; &bull;'*' r </td></tr><tr><td align="left" port="r3">&#40;3&#41; l -&gt; '*' &bull;r </td></tr><tr><td align="left" port="r4">&#40;4&#41; l -&gt; &bull;'n' </td></tr><tr><td align="left" port="r5">&#40;5&#41; r -&gt; &bull;l </td></tr></table>> ];
  "state2" [ style = "filled" penwidth = 1 fillcolor = "white" fontname = "Courier New" shape = "Mrecord" label =<<table border="0" cellborder="0" cellpadding="3" bgcolor="white"><tr><td bgcolor="black" align="center" colspan="2"><font color="white">State #2</font></td></tr><tr><td align="left" port="r4">&#40;4&#41; l -&gt; 'n' &bull;</td><td bgcolor="grey" align="right">=$</td></tr></table>> ];
  "state3" [ style = "filled" penwidth = 1 fillcolor = "white" fontname = "Courier New" shape = "Mrecord" label =<<table border="0" cellborder="0" cellpadding="3" bgcolor="white"><tr><td bgcolor="black" align="center" colspan="2"><font color="white">State #3</font></td></tr><tr><td align="left" port="r5">&#40;5&#41; r -&gt; l &bull;</td><td bgcolor="grey" align="right">=$</td></tr></table>> ];
  "state4" [ style = "filled" penwidth = 1 fillcolor = "white" fontname = "Courier New" shape = "Mrecord" label =<<table border="0" cellborder="0" cellpadding="3" bgcolor="white"><tr><td bgcolor="black" align="center" colspan="2"><font color="white">State #4</font></td></tr><tr><td align="left" port="r3">&#40;3&#41; l -&gt; '*' r &bull;</td><td bgcolor="grey" align="right">=$</td></tr></table>> ];
  "state5" [ style = "filled" penwidth = 1 fillcolor = "black" fontname = "Courier New" shape = "Mrecord" label =<<table border="0" cellborder="0" cellpadding="3" bgcolor="black"><tr><td bgcolor="black" align="center" colspan="2"><font color="white">State #5</font></td></tr><tr><td align="left" port="r0"><font color="white">&#40;0&#41; s -&gt; e &bull;$ </font></td></tr></table>> ];
  "state6" [ style = "filled" penwidth = 1 fillcolor = "white" fontname = "Courier New" shape = "Mrecord" label =<<table border="0" cellborder="0" cellpadding="3" bgcolor="white"><tr><td bgcolor="black" align="center" colspan="2"><font color="white">State #6</font></td></tr><tr><td align="left" port="r1">&#40;1&#41; e -&gt; l &bull;'=' r </td></tr><tr><td align="left" port="r5">&#40;5&#41; r -&gt; l &bull;</td><td bgcolor="grey" align="right">$</td></tr></table>> ];
  "state7" [ style = "filled" penwidth = 1 fillcolor = "white" fontname = "Courier New" shape = "Mrecord" label =<<table border="0" cellborder="0" cellpadding="3" bgcolor="white"><tr><td bgcolor="black" align="center" colspan="2"><font color="white">State #7</font></td></tr><tr><td align="left" port="r1">&#40;1&#41; e -&gt; l '=' &bull;r </td></tr><tr><td align="left" port="r3">&#40;3&#41; l -&gt; &bull;'*' r </td></tr><tr><td align="left" port="r4">&#40;4&#41; l -&gt; &bull;'n' </td></tr><tr><td align="left" port="r5">&#40;5&#41; r -&gt; &bull;l </td></tr></table>> ];
  "state8" [ style = "filled" penwidth = 1 fillcolor = "white" fontname = "Courier New" shape = "Mrecord" label =<<table border="0" cellborder="0" cellpadding="3" bgcolor="white"><tr><td bgcolor="black" align="center" colspan="2"><font color="white">State #8</font></td></tr><tr><td align="left" port="r1">&#40;1&#41; e -&gt; l '=' r &bull;</td><td bgcolor="grey" align="right">$</td></tr></table>> ];
  "state9" [ style = "filled" penwidth = 1 fillcolor = "white" fontname = "Courier New" shape = "Mrecord" label =<<table border="0" cellborder="0" cellpadding="3" bgcolor="white"><tr><td bgcolor="black" align="center" colspan="2"><font color="white">State #9</font></td></tr><tr><td align="left" port="r2">&#40;2&#41; e -&gt; r &bull;</td><td bgcolor="grey" align="right">$</td></tr></table>> ];
  state0 -> state5 [ penwidth = 5 fontsize = 28 fontcolor = "black" label = "e" ];
  state0 -> state6 [ penwidth = 5 fontsize = 28 fontcolor = "black" label = "l" ];
  state0 -> state9 [ penwidth = 5 fontsize = 28 fontcolor = "black" label = "r" ];
  state0 -> state1 [ penwidth = 1 fontsize = 14 fontcolor = "grey28" label = "'*'" ];
  state0 -> state2 [ penwidth = 1 fontsize = 14 fontcolor = "grey28" label = "'n'" ];
  state1 -> state1 [ penwidth = 1 fontsize = 14 fontcolor = "grey28" label = "'*'" ];
  state1 -> state4 [ penwidth = 5 fontsize = 28 fontcolor = "black" label = "r" ];
  state1 -> state2 [ penwidth = 1 fontsize = 14 fontcolor = "grey28" label = "'n'" ];
  state1 -> state3 [ penwidth = 5 fontsize = 28 fontcolor = "black" label = "l" ];
  state6 -> state7 [ penwidth = 1 fontsize = 14 fontcolor = "grey28" label = "'='" ];
  state7 -> state8 [ penwidth = 5 fontsize = 28 fontcolor = "black" label = "r" ];
  state7 -> state1 [ penwidth = 1 fontsize = 14 fontcolor = "grey28" label = "'*'" ];
  state7 -> state2 [ penwidth = 1 fontsize = 14 fontcolor = "grey28" label = "'n'" ];
  state7 -> state3 [ penwidth = 5 fontsize = 28 fontcolor = "black" label = "l" ];
}`,children:[{type:"formatted",text:""}]},{type:"paragraph",children:[{type:"formatted",text:"具体语法和能力可参考"},{type:"link",url:"https://graphviz.org/",openEdit:!1,children:[{type:"formatted",text:"官网"}]},{type:"formatted",text:"。"}]}],isFold:!1,children:[{type:"paragraph",children:[{type:"formatted",text:"Graphviz"}]},{type:"paragraph",children:[{type:"formatted",text:"Graphviz 也是一种通过文本来生成图形的图形语法"}]},{type:"graphviz",dot:`digraph g {
  fontname="Helvetica,Arial,sans-serif"
  node [fontname="Helvetica,Arial,sans-serif"]
  edge [fontname="Helvetica,Arial,sans-serif"]
  graph [fontsize=30 labelloc="t" label="" splines=true overlap=false rankdir = "LR"];
  ratio = auto;
  "state0" [ style = "filled, bold" penwidth = 5 fillcolor = "white" fontname = "Courier New" shape = "Mrecord" label =<<table border="0" cellborder="0" cellpadding="3" bgcolor="white"><tr><td bgcolor="black" align="center" colspan="2"><font color="white">State #0</font></td></tr><tr><td align="left" port="r0">&#40;0&#41; s -&gt; &bull;e $ </td></tr><tr><td align="left" port="r1">&#40;1&#41; e -&gt; &bull;l '=' r </td></tr><tr><td align="left" port="r2">&#40;2&#41; e -&gt; &bull;r </td></tr><tr><td align="left" port="r3">&#40;3&#41; l -&gt; &bull;'*' r </td></tr><tr><td align="left" port="r4">&#40;4&#41; l -&gt; &bull;'n' </td></tr><tr><td align="left" port="r5">&#40;5&#41; r -&gt; &bull;l </td></tr></table>> ];
  "state1" [ style = "filled" penwidth = 1 fillcolor = "white" fontname = "Courier New" shape = "Mrecord" label =<<table border="0" cellborder="0" cellpadding="3" bgcolor="white"><tr><td bgcolor="black" align="center" colspan="2"><font color="white">State #1</font></td></tr><tr><td align="left" port="r3">&#40;3&#41; l -&gt; &bull;'*' r </td></tr><tr><td align="left" port="r3">&#40;3&#41; l -&gt; '*' &bull;r </td></tr><tr><td align="left" port="r4">&#40;4&#41; l -&gt; &bull;'n' </td></tr><tr><td align="left" port="r5">&#40;5&#41; r -&gt; &bull;l </td></tr></table>> ];
  "state2" [ style = "filled" penwidth = 1 fillcolor = "white" fontname = "Courier New" shape = "Mrecord" label =<<table border="0" cellborder="0" cellpadding="3" bgcolor="white"><tr><td bgcolor="black" align="center" colspan="2"><font color="white">State #2</font></td></tr><tr><td align="left" port="r4">&#40;4&#41; l -&gt; 'n' &bull;</td><td bgcolor="grey" align="right">=$</td></tr></table>> ];
  "state3" [ style = "filled" penwidth = 1 fillcolor = "white" fontname = "Courier New" shape = "Mrecord" label =<<table border="0" cellborder="0" cellpadding="3" bgcolor="white"><tr><td bgcolor="black" align="center" colspan="2"><font color="white">State #3</font></td></tr><tr><td align="left" port="r5">&#40;5&#41; r -&gt; l &bull;</td><td bgcolor="grey" align="right">=$</td></tr></table>> ];
  "state4" [ style = "filled" penwidth = 1 fillcolor = "white" fontname = "Courier New" shape = "Mrecord" label =<<table border="0" cellborder="0" cellpadding="3" bgcolor="white"><tr><td bgcolor="black" align="center" colspan="2"><font color="white">State #4</font></td></tr><tr><td align="left" port="r3">&#40;3&#41; l -&gt; '*' r &bull;</td><td bgcolor="grey" align="right">=$</td></tr></table>> ];
  "state5" [ style = "filled" penwidth = 1 fillcolor = "black" fontname = "Courier New" shape = "Mrecord" label =<<table border="0" cellborder="0" cellpadding="3" bgcolor="black"><tr><td bgcolor="black" align="center" colspan="2"><font color="white">State #5</font></td></tr><tr><td align="left" port="r0"><font color="white">&#40;0&#41; s -&gt; e &bull;$ </font></td></tr></table>> ];
  "state6" [ style = "filled" penwidth = 1 fillcolor = "white" fontname = "Courier New" shape = "Mrecord" label =<<table border="0" cellborder="0" cellpadding="3" bgcolor="white"><tr><td bgcolor="black" align="center" colspan="2"><font color="white">State #6</font></td></tr><tr><td align="left" port="r1">&#40;1&#41; e -&gt; l &bull;'=' r </td></tr><tr><td align="left" port="r5">&#40;5&#41; r -&gt; l &bull;</td><td bgcolor="grey" align="right">$</td></tr></table>> ];
  "state7" [ style = "filled" penwidth = 1 fillcolor = "white" fontname = "Courier New" shape = "Mrecord" label =<<table border="0" cellborder="0" cellpadding="3" bgcolor="white"><tr><td bgcolor="black" align="center" colspan="2"><font color="white">State #7</font></td></tr><tr><td align="left" port="r1">&#40;1&#41; e -&gt; l '=' &bull;r </td></tr><tr><td align="left" port="r3">&#40;3&#41; l -&gt; &bull;'*' r </td></tr><tr><td align="left" port="r4">&#40;4&#41; l -&gt; &bull;'n' </td></tr><tr><td align="left" port="r5">&#40;5&#41; r -&gt; &bull;l </td></tr></table>> ];
  "state8" [ style = "filled" penwidth = 1 fillcolor = "white" fontname = "Courier New" shape = "Mrecord" label =<<table border="0" cellborder="0" cellpadding="3" bgcolor="white"><tr><td bgcolor="black" align="center" colspan="2"><font color="white">State #8</font></td></tr><tr><td align="left" port="r1">&#40;1&#41; e -&gt; l '=' r &bull;</td><td bgcolor="grey" align="right">$</td></tr></table>> ];
  "state9" [ style = "filled" penwidth = 1 fillcolor = "white" fontname = "Courier New" shape = "Mrecord" label =<<table border="0" cellborder="0" cellpadding="3" bgcolor="white"><tr><td bgcolor="black" align="center" colspan="2"><font color="white">State #9</font></td></tr><tr><td align="left" port="r2">&#40;2&#41; e -&gt; r &bull;</td><td bgcolor="grey" align="right">$</td></tr></table>> ];
  state0 -> state5 [ penwidth = 5 fontsize = 28 fontcolor = "black" label = "e" ];
  state0 -> state6 [ penwidth = 5 fontsize = 28 fontcolor = "black" label = "l" ];
  state0 -> state9 [ penwidth = 5 fontsize = 28 fontcolor = "black" label = "r" ];
  state0 -> state1 [ penwidth = 1 fontsize = 14 fontcolor = "grey28" label = "'*'" ];
  state0 -> state2 [ penwidth = 1 fontsize = 14 fontcolor = "grey28" label = "'n'" ];
  state1 -> state1 [ penwidth = 1 fontsize = 14 fontcolor = "grey28" label = "'*'" ];
  state1 -> state4 [ penwidth = 5 fontsize = 28 fontcolor = "black" label = "r" ];
  state1 -> state2 [ penwidth = 1 fontsize = 14 fontcolor = "grey28" label = "'n'" ];
  state1 -> state3 [ penwidth = 5 fontsize = 28 fontcolor = "black" label = "l" ];
  state6 -> state7 [ penwidth = 1 fontsize = 14 fontcolor = "grey28" label = "'='" ];
  state7 -> state8 [ penwidth = 5 fontsize = 28 fontcolor = "black" label = "r" ];
  state7 -> state1 [ penwidth = 1 fontsize = 14 fontcolor = "grey28" label = "'*'" ];
  state7 -> state2 [ penwidth = 1 fontsize = 14 fontcolor = "grey28" label = "'n'" ];
  state7 -> state3 [ penwidth = 5 fontsize = 28 fontcolor = "black" label = "l" ];
}`,children:[{type:"formatted",text:""}]},{type:"paragraph",children:[{type:"formatted",text:"具体语法和能力可参考"},{type:"link",url:"https://graphviz.org/",openEdit:!1,children:[{type:"formatted",text:"官网"}]},{type:"formatted",text:"。"}]}]},{type:"list-item",allContent:[{type:"paragraph",children:[{type:"formatted",text:"数学公式"}]},{type:"paragraph",children:[{type:"formatted",text:"使用 KaTex 来渲染数学公式"}]},{type:"block-math",tex:"\\int_{0}^{\\frac{\\pi}{2}} \\sin x \\text{dx} = 1",children:[{type:"formatted",text:""}]},{type:"block-math",tex:"\\sum_{i = 1}^{n} i = \\frac{n(n + 1)}{2}",children:[{type:"formatted",text:""}]},{type:"paragraph",children:[{type:"formatted",text:"其支持的语法见 "},{type:"link",url:"https://katex.org/docs/supported",openEdit:!1,children:[{type:"formatted",text:"Support Functions"}]},{type:"formatted",text:"。"}]}],isFold:!1,children:[{type:"paragraph",children:[{type:"formatted",text:"数学公式"}]},{type:"paragraph",children:[{type:"formatted",text:"使用 KaTex 来渲染数学公式"}]},{type:"block-math",tex:"\\int_{0}^{\\frac{\\pi}{2}} \\sin x \\text{dx} = 1",children:[{type:"formatted",text:""}]},{type:"block-math",tex:"\\sum_{i = 1}^{n} i = \\frac{n(n + 1)}{2}",children:[{type:"formatted",text:""}]},{type:"paragraph",children:[{type:"formatted",text:"其支持的语法见 "},{type:"link",url:"https://katex.org/docs/supported",openEdit:!1,children:[{type:"formatted",text:"Support Functions"}]},{type:"formatted",text:"。"}]}]},{type:"list-item",allContent:[{type:"paragraph",children:[{type:"formatted",text:"Tikz"}]},{type:"paragraph",children:[{type:"formatted",text:"Tikz 是 "},{type:"inline-math",tex:"\\LaTeX",children:[{type:"formatted",text:"LaTeX"}]},{type:"formatted",text:" 中用来绘制图形的一个包，如"}]},{type:"tikz",content:`\\begin{document}
  \\begin{tikzpicture}[domain=0:4]
    \\draw[very thin,color=gray] (-0.1,-1.1) grid (3.9,3.9);
    \\draw[->] (-0.2,0) -- (4.2,0) node[right] {$x$};
    \\draw[->] (0,-1.2) -- (0,4.2) node[above] {$f(x)$};
    \\draw[color=red]    plot (\\x,\\x)             node[right] {$f(x) =x$};
    \\draw[color=blue]   plot (\\x,{sin(\\x r)})    node[right] {$f(x) = \\sin x$};
    \\draw[color=orange] plot (\\x,{0.05*exp(\\x)}) node[right] {$f(x) = \\frac{1}{20} \\mathrm e^x$};
  \\end{tikzpicture}
\\end{document}`,children:[{type:"formatted",text:""}]},{type:"tikz",content:`\\usepackage{circuitikz}
\\begin{document}

\\begin{circuitikz}[american, voltage shift=0.5]
\\draw (0,0)
to[isource, l=$I_0$, v=$V_0$] (0,3)
to[short, -*, i=$I_0$] (2,3)
to[R=$R_1$, i>_=$i_1$] (2,0) -- (0,0);
\\draw (2,3) -- (4,3)
to[R=$R_2$, i>_=$i_2$]
(4,0) to[short, -*] (2,0);
\\end{circuitikz}

\\end{document}`,children:[{type:"formatted",text:""}]},{type:"tikz",content:`\\usepackage{pgfplots}
\\pgfplotsset{compat=1.16}

\\begin{document}

\\begin{tikzpicture}
\\begin{axis}[colormap/viridis]
\\addplot3[
	surf,
	samples=18,
	domain=-3:3
]
{exp(-x^2-y^2)*x};
\\end{axis}
\\end{tikzpicture}

\\end{document}`,children:[{type:"formatted",text:""}]},{type:"tikz",content:`\\usepackage{tikz-cd}

\\begin{document}
\\begin{tikzcd}

    T
    \\arrow[drr, bend left, "x"]
    \\arrow[ddr, bend right, "y"]
    \\arrow[dr, dotted, "{(x,y)}" description] & & \\\\
    K & X \\times_Z Y \\arrow[r, "p"] \\arrow[d, "q"]
    & X \\arrow[d, "f"] \\\\
    & Y \\arrow[r, "g"]
    & Z

\\end{tikzcd}

\\quad \\quad

\\begin{tikzcd}[row sep=2.5em]

A' \\arrow[rr,"f'"] \\arrow[dr,swap,"a"] \\arrow[dd,swap,"g'"] &&
  B' \\arrow[dd,swap,"h'" near start] \\arrow[dr,"b"] \\\\
& A \\arrow[rr,crossing over,"f" near start] &&
  B \\arrow[dd,"h"] \\\\
C' \\arrow[rr,"k'" near end] \\arrow[dr,swap,"c"] && D' \\arrow[dr,swap,"d"] \\\\
& C \\arrow[rr,"k"] \\arrow[uu,<-,crossing over,"g" near end]&& D

\\end{tikzcd}

\\end{document}`,children:[{type:"formatted",text:""}]},{type:"tikz",content:`\\usepackage{chemfig}
\\begin{document}

\\chemfig{[:-90]HN(-[::-45](-[::-45]R)=[::+45]O)>[::+45]*4(-(=O)-N*5(-(<:(=[::-60]O)-[::+60]OH)-(<[::+0])(<:[::-108])-S>)--)}

\\end{document}`,children:[{type:"formatted",text:""}]},{type:"tikz",content:`\\usepackage{chemfig}
\\begin{document}

\\definesubmol\\fragment1{

    (-[:#1,0.85,,,draw=none]
    -[::126]-[::-54](=_#(2pt,2pt)[::180])
    -[::-70](-[::-56.2,1.07]=^#(2pt,2pt)[::180,1.07])
    -[::110,0.6](-[::-148,0.60](=^[::180,0.35])-[::-18,1.1])
    -[::50,1.1](-[::18,0.60]=_[::180,0.35])
    -[::50,0.6]
    -[::110])
    }

\\chemfig{
!\\fragment{18}
!\\fragment{90}
!\\fragment{162}
!\\fragment{234}
!\\fragment{306}
}

\\end{document}`,children:[{type:"formatted",text:""}]},{type:"paragraph",children:[{type:"formatted",text:"上述的图形都是通过 Tikz 进行绘制的，可支持使用的包有"}]},{type:"bulleted-list",children:[{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"chemfig"}]}]}]},{type:"bulleted-list",children:[{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"tikz-cd"}]}]}]},{type:"bulleted-list",children:[{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"circuitikz"}]}]}]},{type:"bulleted-list",children:[{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"pgfplots"}]}]}]},{type:"bulleted-list",children:[{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"array"}]}]}]},{type:"bulleted-list",children:[{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"amsmath"}]}]}]},{type:"bulleted-list",children:[{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"amstext"}]}]}]},{type:"bulleted-list",children:[{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"amsfonts"}]}]}]},{type:"bulleted-list",children:[{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"amssymb"}]}]}]},{type:"bulleted-list",children:[{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"tikz-3dplot"}]}]}]}],isFold:!1,children:[{type:"paragraph",children:[{type:"formatted",text:"Tikz"}]},{type:"paragraph",children:[{type:"formatted",text:"Tikz 是 "},{type:"inline-math",tex:"\\LaTeX",children:[{type:"formatted",text:"LaTeX"}]},{type:"formatted",text:" 中用来绘制图形的一个包，如"}]},{type:"tikz",content:`\\begin{document}
  \\begin{tikzpicture}[domain=0:4]
    \\draw[very thin,color=gray] (-0.1,-1.1) grid (3.9,3.9);
    \\draw[->] (-0.2,0) -- (4.2,0) node[right] {$x$};
    \\draw[->] (0,-1.2) -- (0,4.2) node[above] {$f(x)$};
    \\draw[color=red]    plot (\\x,\\x)             node[right] {$f(x) =x$};
    \\draw[color=blue]   plot (\\x,{sin(\\x r)})    node[right] {$f(x) = \\sin x$};
    \\draw[color=orange] plot (\\x,{0.05*exp(\\x)}) node[right] {$f(x) = \\frac{1}{20} \\mathrm e^x$};
  \\end{tikzpicture}
\\end{document}`,children:[{type:"formatted",text:""}]},{type:"tikz",content:`\\usepackage{circuitikz}
\\begin{document}

\\begin{circuitikz}[american, voltage shift=0.5]
\\draw (0,0)
to[isource, l=$I_0$, v=$V_0$] (0,3)
to[short, -*, i=$I_0$] (2,3)
to[R=$R_1$, i>_=$i_1$] (2,0) -- (0,0);
\\draw (2,3) -- (4,3)
to[R=$R_2$, i>_=$i_2$]
(4,0) to[short, -*] (2,0);
\\end{circuitikz}

\\end{document}`,children:[{type:"formatted",text:""}]},{type:"tikz",content:`\\usepackage{pgfplots}
\\pgfplotsset{compat=1.16}

\\begin{document}

\\begin{tikzpicture}
\\begin{axis}[colormap/viridis]
\\addplot3[
	surf,
	samples=18,
	domain=-3:3
]
{exp(-x^2-y^2)*x};
\\end{axis}
\\end{tikzpicture}

\\end{document}`,children:[{type:"formatted",text:""}]},{type:"tikz",content:`\\usepackage{tikz-cd}

\\begin{document}
\\begin{tikzcd}

    T
    \\arrow[drr, bend left, "x"]
    \\arrow[ddr, bend right, "y"]
    \\arrow[dr, dotted, "{(x,y)}" description] & & \\\\
    K & X \\times_Z Y \\arrow[r, "p"] \\arrow[d, "q"]
    & X \\arrow[d, "f"] \\\\
    & Y \\arrow[r, "g"]
    & Z

\\end{tikzcd}

\\quad \\quad

\\begin{tikzcd}[row sep=2.5em]

A' \\arrow[rr,"f'"] \\arrow[dr,swap,"a"] \\arrow[dd,swap,"g'"] &&
  B' \\arrow[dd,swap,"h'" near start] \\arrow[dr,"b"] \\\\
& A \\arrow[rr,crossing over,"f" near start] &&
  B \\arrow[dd,"h"] \\\\
C' \\arrow[rr,"k'" near end] \\arrow[dr,swap,"c"] && D' \\arrow[dr,swap,"d"] \\\\
& C \\arrow[rr,"k"] \\arrow[uu,<-,crossing over,"g" near end]&& D

\\end{tikzcd}

\\end{document}`,children:[{type:"formatted",text:""}]},{type:"tikz",content:`\\usepackage{chemfig}
\\begin{document}

\\chemfig{[:-90]HN(-[::-45](-[::-45]R)=[::+45]O)>[::+45]*4(-(=O)-N*5(-(<:(=[::-60]O)-[::+60]OH)-(<[::+0])(<:[::-108])-S>)--)}

\\end{document}`,children:[{type:"formatted",text:""}]},{type:"tikz",content:`\\usepackage{chemfig}
\\begin{document}

\\definesubmol\\fragment1{

    (-[:#1,0.85,,,draw=none]
    -[::126]-[::-54](=_#(2pt,2pt)[::180])
    -[::-70](-[::-56.2,1.07]=^#(2pt,2pt)[::180,1.07])
    -[::110,0.6](-[::-148,0.60](=^[::180,0.35])-[::-18,1.1])
    -[::50,1.1](-[::18,0.60]=_[::180,0.35])
    -[::50,0.6]
    -[::110])
    }

\\chemfig{
!\\fragment{18}
!\\fragment{90}
!\\fragment{162}
!\\fragment{234}
!\\fragment{306}
}

\\end{document}`,children:[{type:"formatted",text:""}]},{type:"paragraph",children:[{type:"formatted",text:"上述的图形都是通过 Tikz 进行绘制的，可支持使用的包有"}]},{type:"bulleted-list",children:[{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"chemfig"}]}]}]},{type:"bulleted-list",children:[{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"tikz-cd"}]}]}]},{type:"bulleted-list",children:[{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"circuitikz"}]}]}]},{type:"bulleted-list",children:[{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"pgfplots"}]}]}]},{type:"bulleted-list",children:[{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"array"}]}]}]},{type:"bulleted-list",children:[{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"amsmath"}]}]}]},{type:"bulleted-list",children:[{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"amstext"}]}]}]},{type:"bulleted-list",children:[{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"amsfonts"}]}]}]},{type:"bulleted-list",children:[{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"amssymb"}]}]}]},{type:"bulleted-list",children:[{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"tikz-3dplot"}]}]}]}]},{type:"list-item",allContent:[{type:"paragraph",children:[{type:"formatted",text:"HTML"}]},{type:"paragraph",children:[{type:"formatted",text:"支持 HTML 块，如果已有的块不能满足样式或布局需要，可以通过 HTML 块来自定义样式和布局"}]},{type:"html-block",html:'<p>Hello <span style="font-size: 2em; color: red;">World!</span></p>',children:[{type:"formatted",text:""}]}],isFold:!1,children:[{type:"paragraph",children:[{type:"formatted",text:"HTML"}]},{type:"paragraph",children:[{type:"formatted",text:"支持 HTML 块，如果已有的块不能满足样式或布局需要，可以通过 HTML 块来自定义样式和布局"}]},{type:"html-block",html:'<p>Hello <span style="font-size: 2em; color: red;">World!</span></p>',children:[{type:"formatted",text:""}]}]},{type:"list-item",allContent:[{type:"paragraph",children:[{type:"formatted",text:"React 自定义块"}]},{type:"paragraph",children:[{type:"formatted",text:"除了通过 HTML 显示自定义内容，还为前端开发者提供了基于 React 组件来自定义渲染内容，只需要定义一个 Component 组件即可，这个组件将会被编辑器渲染，可以使用注入的组件库，如：antd。"}]},{type:"paragraph",children:[{type:"formatted",text:"支持 ES6+ 和 TypeScript，异步方法"}]},{type:"code-block",code:`const { useState } = React;
const { Skeleton } = antd;

const containerStyle = {
  padding: 24,
}

const titleStyle = {
  cursor: 'pointer',
  userSelect: 'none',
  lineHeight: '30px',
}

const gridContainerStyle = {
  display: 'grid',
  gridTemplateRows: '1fr',
  overflow: 'hidden',
  transition: 'grid-template-rows 1s ease-in-out',
}

const gridHideStyle = {
  gridTemplateRows: '0fr',
}

const contentStyle = {
  minHeight: 0,
}

const Component = () => {
  const [isHide, setIsHide] = useState(false);

  const gridStyle = isHide ? { ...gridContainerStyle, ...gridHideStyle } : gridContainerStyle;

  return (
    <div style={containerStyle}>
      <div style={titleStyle} onClick={() => { setIsHide(!isHide) }}>点击{ isHide ? '显示' : '隐藏' }内容</div>
      <div style={gridStyle}>
        <div style={contentStyle}>
          <Skeleton active paragraph={{ rows: 4 }} />
        </div>
      </div>
    </div>
  )
}`,language:"TSX",uuid:"f0b10831-3e54-457a-b386-6cd50c95ddc3",children:[{type:"formatted",text:""}]},{type:"custom-block",content:`const { useState } = React;
const { Skeleton } = antd;

const containerStyle = {
  padding: 24,
}

const titleStyle = {
  cursor: 'pointer',
  userSelect: 'none',
  lineHeight: '30px',
}

const gridContainerStyle = {
  display: 'grid',
  gridTemplateRows: '1fr',
  overflow: 'hidden',
  transition: 'grid-template-rows 1s ease-in-out',
}

const gridHideStyle = {
  gridTemplateRows: '0fr',
}

const contentStyle = {
  minHeight: 0,
}

const Component = () => {
  const [isHide, setIsHide] = useState(false);

  const gridStyle = isHide ? { ...gridContainerStyle, ...gridHideStyle } : gridContainerStyle;

  return (
    <div style={containerStyle}>
      <div style={titleStyle} onClick={() => { setIsHide(!isHide) }}>点击{ isHide ? '显示' : '隐藏' }内容</div>
      <div style={gridStyle}>
        <div style={contentStyle}>
          <Skeleton active paragraph={{ rows: 4 }} />
        </div>
      </div>
    </div>
  )
}`,children:[{type:"formatted",text:""}]}],isFold:!1,children:[{type:"paragraph",children:[{type:"formatted",text:"React 自定义块"}]},{type:"paragraph",children:[{type:"formatted",text:"除了通过 HTML 显示自定义内容，还为前端开发者提供了基于 React 组件来自定义渲染内容，只需要定义一个 Component 组件即可，这个组件将会被编辑器渲染，可以使用注入的组件库，如：antd。"}]},{type:"paragraph",children:[{type:"formatted",text:"支持 ES6+ 和 TypeScript，异步方法"}]},{type:"code-block",code:`const { useState } = React;
const { Skeleton } = antd;

const containerStyle = {
  padding: 24,
}

const titleStyle = {
  cursor: 'pointer',
  userSelect: 'none',
  lineHeight: '30px',
}

const gridContainerStyle = {
  display: 'grid',
  gridTemplateRows: '1fr',
  overflow: 'hidden',
  transition: 'grid-template-rows 1s ease-in-out',
}

const gridHideStyle = {
  gridTemplateRows: '0fr',
}

const contentStyle = {
  minHeight: 0,
}

const Component = () => {
  const [isHide, setIsHide] = useState(false);

  const gridStyle = isHide ? { ...gridContainerStyle, ...gridHideStyle } : gridContainerStyle;

  return (
    <div style={containerStyle}>
      <div style={titleStyle} onClick={() => { setIsHide(!isHide) }}>点击{ isHide ? '显示' : '隐藏' }内容</div>
      <div style={gridStyle}>
        <div style={contentStyle}>
          <Skeleton active paragraph={{ rows: 4 }} />
        </div>
      </div>
    </div>
  )
}`,language:"TSX",uuid:"f0b10831-3e54-457a-b386-6cd50c95ddc3",children:[{type:"formatted",text:""}]},{type:"custom-block",content:`const { useState } = React;
const { Skeleton } = antd;

const containerStyle = {
  padding: 24,
}

const titleStyle = {
  cursor: 'pointer',
  userSelect: 'none',
  lineHeight: '30px',
}

const gridContainerStyle = {
  display: 'grid',
  gridTemplateRows: '1fr',
  overflow: 'hidden',
  transition: 'grid-template-rows 1s ease-in-out',
}

const gridHideStyle = {
  gridTemplateRows: '0fr',
}

const contentStyle = {
  minHeight: 0,
}

const Component = () => {
  const [isHide, setIsHide] = useState(false);

  const gridStyle = isHide ? { ...gridContainerStyle, ...gridHideStyle } : gridContainerStyle;

  return (
    <div style={containerStyle}>
      <div style={titleStyle} onClick={() => { setIsHide(!isHide) }}>点击{ isHide ? '显示' : '隐藏' }内容</div>
      <div style={gridStyle}>
        <div style={contentStyle}>
          <Skeleton active paragraph={{ rows: 4 }} />
        </div>
      </div>
    </div>
  )
}`,children:[{type:"formatted",text:""}]}]},{type:"list-item",allContent:[{type:"paragraph",children:[{type:"formatted",text:"多列布局"}]},{type:"paragraph",children:[{type:"formatted",text:"可以在一行内显示多个列，使用快捷键 "},{type:"formatted",text:"Ctrl + ->",code:!0},{type:"formatted",text:"向右添加一列，"},{type:"formatted",text:"Ctrl + <-",code:!0},{text:"向左添加一列， ",type:"formatted"},{type:"formatted",text:"Ctrl + Shift + ->",code:!0},{type:"formatted",text:" 删除右边一列，"},{type:"formatted",text:"Ctrl + Shift + <-",code:!0},{type:"formatted",text:" 删除左边一列"}]},{type:"multi-column-container",children:[{type:"multi-column-item",children:[{type:"paragraph",children:[{type:"formatted",text:"第一列"}]},{type:"paragraph",children:[{type:"formatted",text:"哈哈哈哈哈哈哈"}]}]},{type:"multi-column-item",children:[{type:"paragraph",children:[{type:"formatted",text:"第二列，哈哈哈哈哈哈哈哈哈哈哈"}]}]},{type:"multi-column-item",children:[{type:"paragraph",children:[{type:"formatted",text:"第三列，我滴乖乖"}]},{type:"blockquote",children:[{type:"paragraph",children:[{type:"formatted",text:"我是谁，哈哈哈哈"}]}]}]}]}],isFold:!1,children:[{type:"paragraph",children:[{type:"formatted",text:"多列布局"}]},{type:"paragraph",children:[{type:"formatted",text:"可以在一行内显示多个列，使用快捷键 "},{type:"formatted",text:"Ctrl + ->",code:!0},{type:"formatted",text:"向右添加一列，"},{type:"formatted",text:"Ctrl + <-",code:!0},{text:"向左添加一列， ",type:"formatted"},{type:"formatted",text:"Ctrl + Shift + ->",code:!0},{type:"formatted",text:" 删除右边一列，"},{type:"formatted",text:"Ctrl + Shift + <-",code:!0},{type:"formatted",text:" 删除左边一列"}]},{type:"multi-column-container",children:[{type:"multi-column-item",children:[{type:"paragraph",children:[{type:"formatted",text:"第一列"}]},{type:"paragraph",children:[{type:"formatted",text:"哈哈哈哈哈哈哈"}]}]},{type:"multi-column-item",children:[{type:"paragraph",children:[{type:"formatted",text:"第二列，哈哈哈哈哈哈哈哈哈哈哈"}]}]},{type:"multi-column-item",children:[{type:"paragraph",children:[{type:"formatted",text:"第三列，我滴乖乖"}]},{type:"blockquote",children:[{type:"paragraph",children:[{type:"formatted",text:"我是谁，哈哈哈哈"}]}]}]}]}]},{type:"list-item",allContent:[{type:"paragraph",children:[{type:"formatted",text:"视频"}]},{type:"video",src:"",uploading:!1,children:[{type:"formatted",text:""}]},{type:"paragraph",children:[{type:"formatted",text:"和图床使用同样的配置。"}]}],isFold:!1,children:[{type:"paragraph",children:[{type:"formatted",text:"视频"}]},{type:"video",src:"",uploading:!1,children:[{type:"formatted",text:""}]},{type:"paragraph",children:[{type:"formatted",text:"和图床使用同样的配置。"}]}]},{type:"list-item",allContent:[{type:"paragraph",children:[{type:"formatted",text:"音频"}]},{type:"audio",src:"https://blog-hostimaging.oss-cn-beijing.aliyuncs.com/1732950601254_69366b60-8143-4bf0-a4a7-1f14c0fa82ca.mp3",uploading:!1,children:[{type:"formatted",text:""}],isFromGenerate:!0,audioText:"笔记的理念大部分来自于《笔记卡片写作法》和《打造第二大脑》这两本书，经过一年多的实践之后，我发展出了一套自己的理念，同时也在不断的调整这款软件，以下是我对打造自己的知识体系的思考。"},{type:"paragraph",children:[{type:"formatted",text:"与图床使用同样的配置。"}]},{type:"callout",calloutType:"note",title:"",children:[{type:"paragraph",children:[{type:"formatted",text:"文本转语音功能需要在配置面板中配置"}]},{type:"image",url:"https://blog-hostimaging.oss-cn-beijing.aliyuncs.com/image_40b92d8c-7265-424a-b8d3-b62cdd5a548f.png",pasteUploading:!1,children:[{type:"formatted",text:""}]},{type:"paragraph",children:[{type:"formatted",text:"目前仅支持豆包的语音复刻模型。"}]},{type:"image",url:"https://blog-hostimaging.oss-cn-beijing.aliyuncs.com/audio_7cf15e88-526e-4b36-8df7-4ee8a0852ac8.gif",pasteUploading:!1,children:[{type:"formatted",text:""}]}]}],isFold:!1,children:[{type:"paragraph",children:[{type:"formatted",text:"音频"}]},{type:"audio",src:"https://blog-hostimaging.oss-cn-beijing.aliyuncs.com/1732950601254_69366b60-8143-4bf0-a4a7-1f14c0fa82ca.mp3",uploading:!1,children:[{type:"formatted",text:""}],isFromGenerate:!0,audioText:"笔记的理念大部分来自于《笔记卡片写作法》和《打造第二大脑》这两本书，经过一年多的实践之后，我发展出了一套自己的理念，同时也在不断的调整这款软件，以下是我对打造自己的知识体系的思考。"},{type:"paragraph",children:[{type:"formatted",text:"与图床使用同样的配置。"}]},{type:"callout",calloutType:"note",title:"",children:[{type:"paragraph",children:[{type:"formatted",text:"文本转语音功能需要在配置面板中配置"}]},{type:"image",url:"https://blog-hostimaging.oss-cn-beijing.aliyuncs.com/image_40b92d8c-7265-424a-b8d3-b62cdd5a548f.png",pasteUploading:!1,children:[{type:"formatted",text:""}]},{type:"paragraph",children:[{type:"formatted",text:"目前仅支持豆包的语音复刻模型。"}]},{type:"image",url:"https://blog-hostimaging.oss-cn-beijing.aliyuncs.com/audio_7cf15e88-526e-4b36-8df7-4ee8a0852ac8.gif",pasteUploading:!1,children:[{type:"formatted",text:""}]}]}]},{type:"list-item",allContent:[{type:"paragraph",children:[{type:"formatted",text:"文件附件"}]},{type:"paragraph",children:[{type:"formatted",text:"可选择本地文件作为附件，点击时在资源管理器中打开（仅支持 Windows 和 Mac）"}]},{type:"image",url:"https://blog-hostimaging.oss-cn-beijing.aliyuncs.com/file_7f74a570-5226-4e49-a59c-c0e3cce76794.gif",pasteUploading:!1,children:[{type:"formatted",text:""}]}],isFold:!1,children:[{type:"paragraph",children:[{type:"formatted",text:"文件附件"}]},{type:"paragraph",children:[{type:"formatted",text:"可选择本地文件作为附件，点击时在资源管理器中打开（仅支持 Windows 和 Mac）"}]},{type:"image",url:"https://blog-hostimaging.oss-cn-beijing.aliyuncs.com/file_7f74a570-5226-4e49-a59c-c0e3cce76794.gif",pasteUploading:!1,children:[{type:"formatted",text:""}]}]}]},{type:"header",children:[{type:"formatted",text:"嵌套和拖拽"}],level:3},{type:"paragraph",children:[{type:"formatted",text:"所有的可编辑的自定义块都是可以互相嵌套的（除表格）"}]},{type:"highlight-block",color:"red",children:[{type:"paragraph",children:[{type:"formatted",text:"我是高亮块"}]},{type:"callout",calloutType:"note",title:"",children:[{type:"paragraph",children:[{type:"formatted",text:"我是笔记块。"}]},{type:"blockquote",children:[{type:"paragraph",children:[{type:"formatted",text:"我是引用块！"}]}]},{type:"highlight-block",color:"red",children:[{type:"paragraph",children:[{type:"formatted",text:"我也是高亮块"}]}]}]},{type:"block-math",tex:"f(x) = ax^2 + bx + c",children:[{type:"formatted",text:""}]}]},{type:"paragraph",children:[{type:"formatted",text:"所有的块也是可以拖拽的，并且可以跨越层级拖拽"}]},{type:"image",url:"https://blog-hostimaging.oss-cn-beijing.aliyuncs.com/drag_98fd4643-9330-47ef-8e1d-7c3654908add.gif",pasteUploading:!1,children:[{type:"formatted",text:""}]},{type:"header",children:[{type:"formatted",text:"行内样式"}],level:3},{type:"paragraph",children:[{type:"formatted",text:"编辑器支持多种行内样式，鼠标选中文本即可设置"}]},{type:"image",url:"https://blog-hostimaging.oss-cn-beijing.aliyuncs.com/image_8f0742ea-40fb-4bd9-bb13-fa6cf832f2e6.png",pasteUploading:!1,children:[{type:"formatted",text:""}]},{type:"bulleted-list",children:[{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"加粗",bold:!0}]}]},{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"倾斜",italic:!0}]}]},{type:"list-item",children:[{type:"paragraph",children:[{text:"",type:"formatted"},{type:"underline",color:"red",lineType:"solid",colorSelectOpen:!1,children:[{type:"formatted",text:"下划线"}]},{type:"formatted",text:""}]}]},{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"删除线",strikethrough:!0}]}]},{type:"list-item",children:[{type:"paragraph",children:[{text:"样式文本，一般用于",type:"formatted"},{type:"styled-text",color:"blue",children:[{type:"formatted",text:"高亮"}]},{type:"formatted",text:"某些概念"}]}]},{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"代码，"},{type:"formatted",text:"rm -rf /*",code:!0}]}]},{type:"list-item",children:[{type:"paragraph",children:[{text:"链接，例如点击",type:"formatted"},{type:"link",url:"https://bilibili.com",openEdit:!1,children:[{type:"formatted",text:"这里"}]},{type:"formatted",text:"跳转 B 站"}]}]},{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"行内数学公式，可与文字在一行，如 "},{type:"inline-math",tex:"f(x) = ax^2 + bx + c",children:[{type:"formatted",text:"f(x) = ax^2 + bx + c"}]},{type:"formatted",text:"\uFEFF"}]}]},{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"文",color:"#e33a32",darkColor:"#fa7873"},{type:"formatted",text:"本",color:"#e57d05",darkColor:"#f5a54a"},{type:"formatted",text:"颜",color:"#dc9b04",darkColor:"#fcd456"},{type:"formatted",text:"色",color:"#2ea121",darkColor:"#6dd162"}]}]},{type:"list-item",children:[{type:"paragraph",children:[{text:"背景高亮",type:"formatted",highlight:"red"}]}]}]},{type:"header",children:[{type:"formatted",text:"功能介绍"}],level:2},{type:"header",children:[{type:"formatted",text:"卡片"}],level:3},{type:"header",children:[{type:"formatted",text:"概念"}],level:4},{type:"paragraph",children:[{type:"formatted",text:"卡片的概念来自于《卡片笔记写作法》这本书，节选一段我的读后感"}]},{type:"blockquote",children:[{type:"paragraph",children:[{type:"formatted",text:"写作的困难是什么，是你对着一张白纸难以下手，不知道写什么，或是写的过程很困难，因为你在绞尽脑汁靠记忆在写作。此时想象如果你有一个素材库，里面包含了文章的观点、论点，你要做的只是对素材的组织，那是不是很容易呢，这本书的内容就是在讲如何构建这么一个素材库，即卡片笔记盒。"}]},{type:"paragraph",children:[{type:"formatted",text:"似乎听起来很简单，就是做笔记然后放入到卡片盒中，但是卡片盒中的笔记与一般的笔记不同，它强调"},{type:"formatted",text:"笔记只有在一定的上下文才有意义",bold:!0,color:"#245bdb",darkColor:"#70a0ff"},{type:"formatted",text:"，因此特别重视笔记与笔记之间的联系，只是将笔记堆积起来没有意义，一个个孤立的知识点无法内化为我们的学问。在我们每次向笔记盒中插入一条笔记时，我们都需要去思考这条新的笔记与已有笔记系统之间的联系，并且建立这种联系，随着笔记盒中的笔记随来越多，笔记的联系形成了一个威力巨大的知识系统，它将成为你的第二大脑。"}]},{type:"paragraph",children:[{type:"formatted",text:"为什么要这么强调联系，因为单独的看一个东西没有意义，除非是参加竞答比赛。只有当我们的知识形成系统的时候，我们对事物的理解才会深刻，并且很难遗忘，甚至当我们学习新知识时，在我们的知识体系下，我们可以很快的接受并理解这些新知识。"}]},{type:"paragraph",children:[{type:"formatted",text:"因此在学习新知识时，我们一定要学会去理解它，只有理解了才能将它纳入到我们的知识体系中，这就强调我们在学习时要思考，而不是死记硬背，死记硬背只能应付临时的测验。因此一些学习的习惯也是毫无意义的，比如在书中划线，这种行为并不能促进我们进一步的思考；上课时抄板书，真不如上课时认真听讲，下课后凭借自己的理解尽可能的写一遍。"}]}]},{type:"paragraph",children:[{type:"formatted",text:"更加详细的理念可阅读这本书或者搜索相关资料，B 站上有很多相关的解读。"}]},{type:"callout",calloutType:"note",title:"",children:[{type:"paragraph",children:[{type:"formatted",text:"读完这本书后我本人收到了很大的启发，甚至这个软件对于笔记的管理理念一开始也是基于这个理念，但是经过一年多的实践，发现这套理论并不适用于我自己，所以尽信书不如无书，还是要结合自己的实际情况去看。"}]}]},{type:"paragraph",children:[{type:"formatted",text:"在这本书中，把卡片分为了四类："}]},{type:"bulleted-list",children:[{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"闪念笔记"}]},{type:"paragraph",children:[{type:"formatted",text:"一些临时的灵感"}]}]},{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"文献笔记"}]},{type:"paragraph",children:[{type:"formatted",text:"读论文，文章，文献的一些个人记录或摘抄"}]}]},{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"永久笔记"}]},{type:"paragraph",children:[{type:"formatted",text:"由闪念笔记、文献笔记转化而来，经过个人思考的笔记，当然也可以不是由闪念笔记和文献笔记转化而来，如果时间足够的话，你也可以直接写一个永久笔记"}]}]},{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"索引（主题）笔记"}]},{type:"paragraph",children:[{type:"formatted",text:"用以索引一系列相关的卡片"}]}]}]},{type:"paragraph",children:[{type:"formatted",text:"我认为文献笔记也是闪念笔记的一种，最终的目标都是成为永久笔记，因此就把文献笔记的这个分类去掉了"}]},{type:"image",url:"https://blog-hostimaging.oss-cn-beijing.aliyuncs.com/image_710a4ef8-4c02-44c1-bba4-16aa1e5d8daf.png",pasteUploading:!1,children:[{type:"formatted",text:""}]},{type:"header",children:[{type:"formatted",text:"关联卡片"}],level:4},{type:"paragraph",children:[{type:"formatted",text:"卡片笔记写作法特别强调笔记与笔记之间的关系，我提供了两种能力来关联相关的卡片"}]},{type:"bulleted-list",children:[{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"在卡片内容中直接提及某张卡片"}]},{type:"image",url:"https://blog-hostimaging.oss-cn-beijing.aliyuncs.com/link_863ba1c2-5a51-4211-8e87-fd20823e1e74.gif",pasteUploading:!1,children:[{type:"formatted",text:""}]}]},{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"直接关联相关卡片"}]},{type:"image",url:"https://blog-hostimaging.oss-cn-beijing.aliyuncs.com/link_e4f92fc3-f6db-4d41-acad-32917b0ee1eb.gif",pasteUploading:!1,children:[{type:"formatted",text:""}]}]}]},{type:"paragraph",children:[{type:"formatted",text:"那如何去查看卡片的关联关系呢，也有两种："}]},{type:"bulleted-list",children:[{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"所有卡片的总览"}]},{type:"image",url:"https://blog-hostimaging.oss-cn-beijing.aliyuncs.com/look_1d46c362-897e-4727-a1e3-c5ad1cc8895b.gif",pasteUploading:!1,children:[{type:"formatted",text:""}]}]},{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"右下角关联图谱查看和当前卡片相关的所有卡片"}]}]}]},{type:"header",children:[{type:"formatted",text:"标签管理"}],level:4},{type:"paragraph",children:[{type:"formatted",text:"在原始的卡片管理法中，只能通过索引卡片去整理卡片，为了方便卡片的管理，借鉴了 Flomo 的标签，可以为卡片打上标签，通过标签来为卡片分类。"}]},{type:"paragraph",children:[{type:"formatted",text:"与文件夹管理卡片的方式不同，一张卡片可以有多个标签，这意味着卡片可以在多个标签下，而文件只能在一个文件夹下。同时也避免了写卡片需要考虑分类的问题，如果通过文件夹的方式管理，有的时候会纠结这张到底是放在这个文件夹下好还是放在另一个文件夹下好，如果是标签的话就不需要考虑这个问题，既然和这两个概念都有关系，那么都打上标签好了，在两个标签都会这张卡片。"}]},{type:"paragraph",children:[{type:"formatted",text:"标签支持使用 "},{type:"styled-text",color:"blue",children:[{type:"formatted",text:"/"}]},{type:"formatted",text:" 进行分类管理"}]},{type:"image",url:"https://blog-hostimaging.oss-cn-beijing.aliyuncs.com/image_585d7595-a152-4d5e-a9ba-a251f454950e.png",pasteUploading:!1,children:[{type:"formatted",text:""}]},{type:"header",children:[{type:"formatted",text:"白板"}],level:3},{type:"paragraph",children:[{type:"formatted",text:"白板就是一个无限大的画布，一般用于整理思绪，例如整理文章思路，梳理代码流程，或者记一些零散的笔记。"}]},{type:"paragraph",children:[{type:"formatted",text:"目前白板上支持的元素有："}]},{type:"bulleted-list",children:[{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"几何图形"}]},{type:"bulleted-list",children:[{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"矩形"}]}]},{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"圆形"}]}]},{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"三角形"}]}]}]}]},{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"箭头"}]}]},{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"富文本，编辑器的所有能力都支持"}]}]},{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"卡片"}]}]},{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"图片"}]}]},{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"视频"}]}]}]},{type:"image",url:"https://blog-hostimaging.oss-cn-beijing.aliyuncs.com/o_351d8afb-d09e-4a99-ba96-9d2c74f59029.gif",pasteUploading:!1,children:[{type:"formatted",text:""}]},{type:"paragraph",children:[{type:"formatted",text:"基本操作："}]},{type:"bulleted-list",children:[{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"右键拖动画布"}]}]},{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"双击创建富文本"}]}]},{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"按住 Shift 调整大小时保证宽高比"}]}]},{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"按住 Ctrl 鼠标滚动缩放"}]}]}]},{type:"paragraph",children:[{type:"formatted",text:"目前白板的基本能力已经支持，包括拖拽、缩放、复制、粘贴、撤销等基本能力，但是还有很多想做的，包括思维导图等，白板的能力正在逐步建设中，敬请期待。"}]},{type:"header",children:[{type:"formatted",text:"项目"}],level:3},{type:"paragraph",children:[{type:"formatted",text:"项目这一理念来自于《打造第二大脑》，作者提议以当前正在进行的项目对笔记进行整理，经过一段时间对"},{type:"styled-text",color:"blue",children:[{type:"formatted",text:"卡片笔记"}]},{text:"的实践，我发现这个方法实在是太被动了，我需要等待卡片自然而然的进行连接，形成主题，这个过程太慢了，而且是不连贯的，而项目正是为了解决这个问题。",type:"formatted"}]},{type:"paragraph",children:[{type:"formatted",text:"项目要求你主动的收集所有和项目相关的所有资料，包括但不限于书籍，视频，音频等等所有对你项目有帮助的东西，这个过程的主动性很强，随着项目进展，可以沉淀出很有有关联的卡片，极大的加快了卡片连接的速度。"}]},{type:"paragraph",children:[{type:"formatted",text:"项目就像是一颗传统的文档树"}]},{type:"image",url:"https://blog-hostimaging.oss-cn-beijing.aliyuncs.com/image_3399f5c8-716a-4315-959d-2b6e9f67a285.png",pasteUploading:!1,children:[{type:"formatted",text:""}]},{type:"paragraph",children:[{type:"formatted",text:"为了方便的从项目建立卡片，提供了直接根据将项目中的文档建立一张卡片的操作"}]},{type:"image",url:"https://blog-hostimaging.oss-cn-beijing.aliyuncs.com/image_84913c82-e92e-4f9c-858d-831ea42b0c3f.png",pasteUploading:!1,children:[{type:"formatted",text:""}]},{type:"paragraph",children:[{type:"formatted",text:"建立成功后二者的内容是同步的，修改卡片项目文档的内容也是进行修改，反之同理。"}]},{type:"paragraph",children:[{type:"formatted",text:"在新建文档时，也可以根据已有卡片进行创建"}]},{type:"image",url:"https://blog-hostimaging.oss-cn-beijing.aliyuncs.com/image_28f92b4f-9611-441f-890e-278cad167601.png",pasteUploading:!1,children:[{type:"formatted",text:""}]},{type:"paragraph",children:[{type:"formatted",text:"创建成功后二者的内容也是同步的。"}]},{type:"paragraph",children:[{type:"formatted",text:"项目中的文档可以拖拽进行排序或者嵌套"}]},{type:"image",url:"https://blog-hostimaging.oss-cn-beijing.aliyuncs.com/drag_e2ca8ee6-8be1-416a-9bb1-966521eea36b.gif",pasteUploading:!1,children:[{type:"formatted",text:""}]},{type:"header",children:[{type:"formatted",text:"文章"}],level:3},{type:"paragraph",children:[{type:"formatted",text:"一般情况下，当卡片积累到一定程度后，相互关联的卡片就自然而然的形成了一个主题，我们就可以基于已有的卡片去输出一篇文章了。"}]},{type:"paragraph",children:[{type:"formatted",text:"当然也不必等到卡片就绪后才开始写文章，完全可以把写一篇文章当作是一个项目，然后去主动的收集所有相关的资料，有可能的话将通用或和已有卡片相关联的内容沉淀为一张卡片。"}]},{type:"header",children:[{type:"formatted",text:"知识库"}],level:3},{type:"paragraph",children:[{type:"formatted",text:"知识库是对知识系统化的总结，例如你输出的文章都是一系列的，是你对某个专题的总结，那么这些文章就可以形成一个知识库了"}]},{type:"image",url:"https://blog-hostimaging.oss-cn-beijing.aliyuncs.com/image_3452e2ed-d734-45ec-9564-f9dc36da5bbb.png",pasteUploading:!1,children:[{type:"formatted",text:""}]},{type:"paragraph",children:[{type:"formatted",text:"知识库的界面和项目基本相同，不同的是知识库的文档还可以直接从文章直接创建，也可以关联当前知识库或其他知识库的文档"}]},{type:"image",url:"https://blog-hostimaging.oss-cn-beijing.aliyuncs.com/image_a2792996-0bff-44aa-89ca-c79e88627753.png",pasteUploading:!1,children:[{type:"formatted",text:""}]},{type:"header",children:[{type:"formatted",text:"PDF"}],level:3},{type:"paragraph",children:[{type:"formatted",text:"支持对 PDF 进行标注的能力"}]},{type:"image",url:"https://blog-hostimaging.oss-cn-beijing.aliyuncs.com/pdf_802d04be-105f-4fbe-a051-42e21bf7df92.gif",pasteUploading:!1,children:[{type:"formatted",text:""}]},{type:"paragraph",children:[{type:"formatted",text:"有两种选择方式："}]},{type:"bulleted-list",children:[{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"选择文字"}]}]},{type:"list-item",children:[{type:"paragraph",children:[{type:"formatted",text:"圈选区域，按住 Alt 键然后选择就是圈选区域"}]}]}]},{type:"header",children:[{type:"formatted",text:"日记 & 时间统计"}],level:3},{type:"paragraph",children:[{type:"formatted",text:"日记即可以按照日期去创建笔记，实际上我开发的初衷仅仅是为了记日记，而不是记笔记，所以它和笔记的管理系统没有任何的关系。"}]},{type:"image",url:"https://blog-hostimaging.oss-cn-beijing.aliyuncs.com/image_46d05107-03ae-4003-a5e4-4fe94f425d25.png",pasteUploading:!1,children:[{type:"formatted",text:""}]},{type:"paragraph",children:[{type:"formatted",text:"时间统计的灵感来自于柳比歇夫时间管理法"}]},{type:"blockquote",children:[{type:"paragraph",children:[{type:"formatted",text:"柳比歇夫是前苏联科学家。他用一生的时间做出了大多数人一生无法完成的事情。作家格列宁在柳比歇夫传记《奇特的一生》中说，柳比歇夫一生完成了70多部著作，因为这些著作众所周知的价值，所以被翻译成多种语言。"}]},{type:"paragraph",children:[{type:"formatted",text:"柳比歇夫涉猎的范围也很广，包括科学史、农业、昆虫学、哲学、动物学、进化论等等。他收集的有关跳蚤的标本，竟然比动物研究所还要多出5倍。"}]},{type:"paragraph",children:[{type:"formatted",text:"柳比歇夫是怎么做到的呢？格列宁在《奇特的一生》总结说，柳比歇夫的秘诀好像很简单，那就是："}]},{type:"paragraph",children:[{type:"formatted",text:"记录时间。"}]}]},{type:"paragraph",children:[{type:"formatted",text:"基于这一灵感，我特意拎出来一个模块特意用来记录自己的时间分布"}]},{type:"image",url:"https://blog-hostimaging.oss-cn-beijing.aliyuncs.com/image_549b8804-19e4-4352-a437-a0a8579432dd.png",pasteUploading:!1,children:[{type:"formatted",text:""}]},{type:"header",children:[{type:"formatted",text:"AI"}],level:3},{type:"paragraph",children:[{type:"formatted",text:"目前有四处提供了 AI 的能力"}]},{type:"numbered-list",children:[{type:"list-item",allContent:[{type:"paragraph",children:[{type:"formatted",text:"AI 对话，在右侧侧边栏，提供了 AI 对话的窗口，通过右上角可以控制右侧边栏的展开和收起"}]},{type:"image",url:"https://blog-hostimaging.oss-cn-beijing.aliyuncs.com/image_89a948f7-4f43-4b33-99c6-fc3e0bcee887.png",pasteUploading:!1,children:[{type:"formatted",text:""}]}],isFold:!1,children:[{type:"paragraph",children:[{type:"formatted",text:"AI 对话，在右侧侧边栏，提供了 AI 对话的窗口，通过右上角可以控制右侧边栏的展开和收起"}]},{type:"image",url:"https://blog-hostimaging.oss-cn-beijing.aliyuncs.com/image_89a948f7-4f43-4b33-99c6-fc3e0bcee887.png",pasteUploading:!1,children:[{type:"formatted",text:""}]}]},{type:"list-item",allContent:[{type:"paragraph",children:[{type:"formatted",text:"AI 搜索"}]},{type:"paragraph",children:[{type:"formatted",text:"借助大模型把卡片内容向量化，在进行搜索时，把搜索的问题也向量化，然后通过向量的相似度匹配来进行搜索，该种方式的搜索不同于关键字的搜索，而是语义化的搜索，该种搜索方式得到的结果与问的问题语义相似度高"}]},{type:"image",url:"https://blog-hostimaging.oss-cn-beijing.aliyuncs.com/o_a0c49a20-e25b-4a2e-bfda-eedf1fa79754.gif",pasteUploading:!1,children:[{type:"formatted",text:""}]},{type:"highlight-block",color:"purple",children:[{type:"paragraph",children:[{type:"formatted",text:"默认不是所有的卡片都是可以搜索的，为了可以被搜索到，你需要在"},{type:"styled-text",color:"blue",children:[{type:"formatted",text:"向量数据库"}]},{text:"对卡片进行嵌入，只有已经嵌入的卡片才可以被搜索到",type:"formatted"}]},{type:"image",url:"https://blog-hostimaging.oss-cn-beijing.aliyuncs.com/image_5f4507af-4bc9-4971-99db-25302f9eca24.png",pasteUploading:!1,children:[{type:"formatted",text:""}]}]}],isFold:!1,children:[{type:"paragraph",children:[{type:"formatted",text:"AI 搜索"}]},{type:"paragraph",children:[{type:"formatted",text:"借助大模型把卡片内容向量化，在进行搜索时，把搜索的问题也向量化，然后通过向量的相似度匹配来进行搜索，该种方式的搜索不同于关键字的搜索，而是语义化的搜索，该种搜索方式得到的结果与问的问题语义相似度高"}]},{type:"image",url:"https://blog-hostimaging.oss-cn-beijing.aliyuncs.com/o_a0c49a20-e25b-4a2e-bfda-eedf1fa79754.gif",pasteUploading:!1,children:[{type:"formatted",text:""}]},{type:"highlight-block",color:"purple",children:[{type:"paragraph",children:[{type:"formatted",text:"默认不是所有的卡片都是可以搜索的，为了可以被搜索到，你需要在"},{type:"styled-text",color:"blue",children:[{type:"formatted",text:"向量数据库"}]},{text:"对卡片进行嵌入，只有已经嵌入的卡片才可以被搜索到",type:"formatted"}]},{type:"image",url:"https://blog-hostimaging.oss-cn-beijing.aliyuncs.com/image_5f4507af-4bc9-4971-99db-25302f9eca24.png",pasteUploading:!1,children:[{type:"formatted",text:""}]}]}]},{type:"list-item",allContent:[{type:"paragraph",children:[{type:"formatted",text:"AI 续写"}]},{type:"paragraph",children:[{type:"formatted",text:"基于已有的内容进行续写，个人认为比较鸡肋，可能对于写材料比较有用"}]},{type:"image",url:"https://blog-hostimaging.oss-cn-beijing.aliyuncs.com/AI_6daec116-d769-4abd-933f-f16f4d588e48.gif",pasteUploading:!1,children:[{type:"formatted",text:""}]}],isFold:!1,children:[{type:"paragraph",children:[{type:"formatted",text:"AI 续写"}]},{type:"paragraph",children:[{type:"formatted",text:"基于已有的内容进行续写，个人认为比较鸡肋，可能对于写材料比较有用"}]},{type:"image",url:"https://blog-hostimaging.oss-cn-beijing.aliyuncs.com/AI_6daec116-d769-4abd-933f-f16f4d588e48.gif",pasteUploading:!1,children:[{type:"formatted",text:""}]}]},{type:"list-item",allContent:[{type:"paragraph",children:[{type:"formatted",text:"网页剪藏"}]},{type:"paragraph",children:[{type:"formatted",text:"在项目中新建文档时可以选择网页剪藏，根据已有的网页生成符合编辑器格式的数据，比如剪藏一篇微信公众号文章。由于实现方式的原因，剪藏一篇文章需要花费两到三分钟，在这里不做演示。"}]}],isFold:!1,children:[{type:"paragraph",children:[{type:"formatted",text:"网页剪藏"}]},{type:"paragraph",children:[{type:"formatted",text:"在项目中新建文档时可以选择网页剪藏，根据已有的网页生成符合编辑器格式的数据，比如剪藏一篇微信公众号文章。由于实现方式的原因，剪藏一篇文章需要花费两到三分钟，在这里不做演示。"}]}]}]},{type:"callout",calloutType:"note",title:"",children:[{type:"paragraph",children:[{type:"formatted",text:"如果要使用 AI 能力，则必须在设置中配置大语音模型"}]},{type:"image",url:"https://blog-hostimaging.oss-cn-beijing.aliyuncs.com/image_4d2c6284-a0fb-4f7c-8111-352ea6c9e7db.png",pasteUploading:!1,children:[{type:"formatted",text:""}]},{type:"paragraph",children:[{type:"formatted",text:"分为 Open AI 和其他和 Open AI 接口兼容的厂商，比如豆包、通义千问，他们的接口都是和 Open AI 兼容的。"}]},{type:"paragraph",children:[{type:"formatted",text:"由于 AI 搜索使用 Open AI 的向量化接口，因此要"},{type:"formatted",text:"使用搜索的功能必须要配置 Open AI",color:"#e33a32",darkColor:"#fa7873"},{type:"formatted",text:"，其他三个功能与厂商无关。"}]}]},{type:"header",children:[{type:"formatted",text:"数据和同步"}],level:2},{type:"paragraph",children:[{type:"formatted",text:"数据使用 sqlite 保存在本地，地址为 "},{type:"formatted",text:"~/.editor/xxx.db",code:!0},{type:"formatted",text:"，如果需要跨设备转移笔记，只需要拷贝这一个文件就可以了。"}]},{type:"paragraph",children:[{type:"formatted",text:"所有的设置，包括字体、大模型等等，都保存在"},{type:"formatted",text:" ~/.editor/setting.json",code:!0},{type:"formatted",text:" 中，如果在不同的设备中需要有相同的配置，也可以将此文件拷贝走。"}]},{type:"callout",calloutType:"warning",title:"",children:[{type:"paragraph",children:[{type:"formatted",text:"如果没有配置线上的图床，图片、音视频等资源保存在本地，统一放置在 "},{type:"formatted",text:"~/.editor/resources",code:!0},{type:"formatted",text:" 目录下，虽然也可以拷贝走这一目录，但是因为新设备的家路径当前设备的家路径不同，所以导致无法找到资源，即使拷贝过去也没用。"}]}]},{type:"paragraph",children:[{type:"formatted",text:"为了方便了在不同的设备之间进行同步，内置了同步功能，目前仅支持通过阿里 OSS 进行数据库的同步"}]},{type:"image",url:"https://blog-hostimaging.oss-cn-beijing.aliyuncs.com/image_d8cbb296-d16a-425e-afa2-f1e981af410b.png",pasteUploading:!1,children:[{type:"formatted",text:""}]},{type:"paragraph",children:[{type:"formatted",text:"同步功能做了版本的管理，如果远程的版本比本地的版本大，则说明远程的数据是最新的，则无法把本地的数据同步过去。如果你在两个设备对同一版本进行了修改，那么只有一个设备上的内容被推送上去，因为当一个设备把内容推送上去后，版本增加，另一台设备的版本就低于远程版本，此时本地的修改只能废弃了。"}]}],s="_container_1epbn_9",f="_content_1epbn_13",m="_editor_1epbn_23",b="_outlineContainer_1epbn_27",x="_outline_1epbn_27",e={container:s,content:f,editor:m,outlineContainer:b,outline:x},u=()=>{const r=g.useRef(null),l=p(i=>{r.current&&r.current.scrollHeaderIntoView(i)});return t.jsx(n,{backend:d,children:t.jsx("div",{className:e.container,children:t.jsxs("div",{className:e.content,children:[t.jsx("div",{className:e.editor,children:t.jsx(o,{ref:r,readonly:!0,initValue:a})}),t.jsx("div",{className:e.outlineContainer,children:t.jsx(y,{className:e.outline,content:a,show:!0,onClickHeader:l})})]})})})};h.locale("zh-cn");c.createRoot(document.getElementById("root")).render(t.jsx(u,{}));
