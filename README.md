# Faysume · 简历工作室

Faysume 的名字由 Fay 和 resume 组合而成。

本地优先的 AI 简历工作台：从 PDF、截图或文字开始，提取并校对内容，再通过有依据的建议整理表达和准备岗位版本。

## 运行

Node.js 22.13+（推荐 Node 22 LTS），npm。

```bash
npm ci
npm run dev
```

打开终端显示的本机地址。Vite 前端和 Hono 后端由 Cloudflare Vite 插件在同一个本地服务中运行，仅监听 127.0.0.1。无需凭证即可编辑简历、打印和备份。

对话助手使用 **Vercel AI SDK 7**：前端 `useChat` / `DefaultChatTransport`，后端 `streamText` / `toolApproval`。使用 SDK 的流式协议、工具状态和签名审批，不自行实现工具通信协议。

前端基础组件使用 [shadcn/ui](https://ui.shadcn.com/docs/installation/vite)，源码位于 `src/components/ui/`，配置位于 `components.json`。按钮、输入框、多行文本、复选框、下拉框和弹窗通过这些组件统一；按文件直接导入，只添加实际使用的组件。Tailwind v4 提供组件样式，现有绿色主题通过 CSS 变量映射；不启用全局 preflight，以保留简历模板和打印排版。`src/components/ui.tsx` 保留业务层的字段保存、图片选择和弹窗组合，不再自行实现焦点锁定。

要启用 AI，将 `.dev.vars.example` 复制为 `.dev.vars` 并填写：

| 配置                                    | 用途                                                                                    |
| --------------------------------------- | --------------------------------------------------------------------------------------- |
| `AI_BASE_URL`、`AI_MODEL`、`AI_API_KEY` | 兼容 Chat Completions 的模型服务；对话助手要求模型支持流式工具调用                      |
| `APP_ACCESS_TOKEN`                      | 自己设置的站点访问口令，在页面「AI 设置」填写；未配置时付费接口拒绝请求                 |
| `TOOL_APPROVAL_SECRET`                  | 独立的随机审批签名密钥，至少 32 字节，可用 `openssl rand -base64 32` 生成；不要填到页面 |
| `TAVILY_API_KEY`                        | 可选，启用公开资料搜索；未配置时助手仍可对话和修改                                      |
| `AI_VISION`、`AI_JSON_MODE`             | 按模型能力填写 `true` / `false`；图片输入默认关闭                                       |

修改 `.dev.vars` 后重启开发服务。`.dev.vars` 不进入 Git，真实密钥仅由 Worker 读取。前端只接收服务是否配置等状态。

生产构建和本地预览：

```bash
npm run build
npm run preview
```

## Cloudflare 部署

生产域名为 `https://faysume.evanryuu.me`，通过 `wrangler.jsonc` 的自定义域名绑定到 `resume-studio` Worker，前端和 API 使用同一域名。

同一个 Worker 托管前端静态资源和 `/api/*`，无需独立后端域名。构建产物位于 `dist/client` 和 `dist/resume_studio`，Wrangler 使用 Vite 插件生成的配置。只有静态部署 Pages 时，对话助手接口不可用。

准备部署时，通过 `npx wrangler secret put <名称>` 配置上述服务端参数，然后执行 `npm run deploy`。首次使用需登录 Cloudflare。部署不自动完成，本地构建不会发布站点。

目前使用一个站点访问口令，适合个人或受信任的小范围试用；未实现多用户账号、按用户限流或计费。简历和会话保存在浏览器，Worker 不存储简历，也不会跨设备同步。

## 使用流程

1. 在 **AI 设置** 选择「站点 AI 服务」，填写站点访问口令并测试。已有用户仍可选择「浏览器直连」，填写 Base URL、API Key 和模型，继续使用原有基础分析；完整对话助手通过站点后端运行。
2. 点击 **上传简历 PDF / 截图**。PDF 每份最多 5 页、10MB、提取文字不超过 10 万字，通过 [Mozilla PDF.js](https://mozilla.github.io/pdf.js/getting_started/) 在浏览器本地解析，支持多页预览和文字校对。文字版默认只发送文字，不需要视觉模型；文字不足的页面会提示可能为扫描页，要求启用视觉模型并发送页面图片，避免静默漏页。文字版也可勾选图片识别。PDF 与截图分开导入，加密 PDF 请先解除保护；失败或取消不替换已有导入草稿。截图仍支持最多 5 张 PNG/JPEG/WebP，每张不超过 10MB，可调整顺序或粘贴；也可直接粘贴文字。
3. 识别后的内容会建立新的简历。对照 **识别原稿** 检查原图和模糊项，修改字段，再确认已校对。
4. 在 **经历素材** 维护所有公司、项目经历及证据，支持粘贴和导入 TXT/Markdown（2MB）以及文字版 PDF（10MB、5 页）。文件在本地提取为可编辑草稿，核对后保存；扫描或文字不足的 PDF 会明确拒绝整份导入，请先转成文字。分析时可选择素材，也可把素材原文加入简历再整理。
5. 在 **AI 建议** 设置语言、市场、岗位并选择素材。在对话中说明目标，回答必要追问。助手展示修改方向、补充事实和可选搜索词，你可以确认或拒绝；拒绝后继续对话调整。确认后才搜索并生成建议，不会自动改写简历。外部资料显示链接、发布日期（若有）和检索日期，与个人经历证据分开。
6. 每项修改都有原文/建议对照。确认事实准确后逐条或批量采纳。**修改记录** 可撤回整笔采纳；如果字段之后被修改，将拒绝冲突撤回，避免覆盖新内容。
7. **针对岗位定制** 可识别 JD 截图，校对后创建独立版本。新版本需要重新说明目标；不会继承旧版本的对话审批。语言切换是分析条件，不会静默翻译或改写原文。
8. 选择经典、现代或紧凑模板，再 **导出 PDF**。在浏览器打印界面选择“保存为 PDF”，建议关闭浏览器页眉页脚；有色模板可启用背景图形。

无需 AI 时，创建、编辑、多份简历、模板、打印和备份仍可使用。虚构示例单独标明，不会自动当作个人经历。

## 数据与隐私

- 页面位置由 TanStack Router 管理：`/` 为简历列表，`/materials` 为经历素材，`/settings` 为 AI 设置，`/resumes/:resumeId` 为简历编辑页。刷新、浏览器前进后退和直接打开链接都会恢复对应页面；编辑标签使用 `tab=content|ai|sources|history`，手机预览使用 `preview=true`，列表搜索使用 `q`。Zod 4 校验查询参数，无效标签回到内容页。路由只记录位置与筛选条件，不携带简历正文或凭证。简历链接只有在当前浏览器存在该文档时才可打开；删除或缺失时显示明确提示。未提交的弹窗草稿不会因路由而自动保存。

- IndexedDB 保存简历、原图、素材、对话和 AI 修改记录，属于当前浏览器和当前域名。刷新可继续已完成的对话和待审批方案；生成中刷新不支持断点续传。清除站点数据会清除它们。
- PDF 原文件不上传、不保存。只有点击识别后，提取文字和选中的页面图片才发往已配置的 AI；简历导入后的页面图片保存在本机供核对。PDF.js 按需加载，其 Worker、中文字符映射、字体和图片解码资源随站点一起部署，不依赖第三方 CDN。复杂多栏阅读顺序、扫描质量仍需人工核对；自动扫描页判断是根据文字量作出的提示，不是准确的页面分类。
- 使用 **导出全部备份** 定期备份。恢复是追加副本，不覆盖已有文档；重复导入会产生重复副本。备份包含经历和原图，请自行妥善保管。
- 站点 API Key 和审批签名密钥保存在 Worker Secrets。浏览器直连的 API Key、站点访问口令只在页面内存中，刷新后重新输入，不写入数据库、localStorage 或备份。
- 连接测试、识别、发送对话和确认工具调用才发起相应请求。模型收到当前简历、岗位描述、对话和选中素材；Tavily 只收到用户确认卡片上的搜索词。搜索摘要是参考资料，不能用来证明个人经历。不要在对话中粘贴密钥。
- 简历、岗位或素材变化后，旧方案不可继续执行；请求期间变化的结果不保存。复制不继承会话；恢复备份保留目标草稿，但清除对话和审批。审批签名依赖 AI SDK 的实验性 `experimental_toolApprovalSecret` API，升级 SDK 时需要回归测试。
- 浏览器直连依赖服务端 CORS。任意 Base URL 不保证可用。可以使用自己的可信兼容网关；应用不会偷偷换服务商。
- 模型生成不能保证事实准确，即使引用了素材，也需要用户核对。所有 AI 替换都需要确认事实后才可采纳。新数字会额外提示。

## 当前范围与限制

- 图片识别、文本解析、建议生成和 JD 识别接入真实兼容 API；没有 Key 时不会模拟成功。
- 文本连接测试不能证明视觉或工具调用能力；JSON 输出模式需服务商支持，默认关闭。基础 AI 请求 90 秒超时，对话每轮最多 2 步、一次修改分析和 3 个搜索词，总超时 150 秒，可停止。搜索失败会明确报错，不会伪装成已检索成功。
- 不含 DOCX 解析、经历素材扫描 PDF 的 OCR、像素级版式复刻、云同步、账户或 ATS 通过率保证。联网检索只提供参考，不保证搜索结果是最新、准确或适用于所有市场。
- 日本语/English 是 AI 分析的目标语言，模板固定标题有中英文区分。中文简历与岗位版本需人工校对；地区适配来自所选模型，不是实时核验的法规或招聘规范。
- 字段离开焦点后自动保存。AI 修改历史覆盖 AI 采纳；手动编辑/删除不提供完整 undo 栈，重要修改前请另存副本或备份。
- 模板预览是连续文档；最终分页以浏览器打印为准。超长单条经历可能跨页，更多浏览器/语言组合仍需实测。

## 验证

```bash
npm test
npm run build
npm run test:e2e
```

E2E 默认使用已安装的 macOS Google Chrome；可用 `CHROME_PATH` 指定其他路径。没有 Chrome 时运行 `npx playwright install chromium` 后设置 `USE_PLAYWRIGHT_CHROMIUM=1`。测试会启动 127.0.0.1:4175。

测试覆盖 SDK 工具审批/拒绝/签名篡改、过期快照、搜索来源隔离，以及原有原子采纳/撤回、事务和备份。对话浏览器测试通过真实 Hono 路由与 AI SDK 消息流连接模拟模型，验证追问、刷新、确认、检索、采纳和撤回；**不代表真实模型质量或真实搜索连通性**，这些需要配置凭证后验证。

调研依据与决策见 [docs/research.md](docs/research.md)，产品边界见 [设计说明](docs/superpowers/specs/2026-09-17-resume-studio-design.md)。

## 代码结构

- `src/domain.ts`：结构校验、简历构建、字段编辑、建议和撤回。
- `src/router.tsx` / `src/navigation.ts`：TanStack Router 页面路由、编辑器位置和 Zod 查询参数校验。使用[官方代码式路由](https://tanstack.com/router/latest/docs/routing/code-based-routing)，Zod 4 可直接作为[参数校验器](https://tanstack.com/router/latest/docs/how-to/validate-search-params)。
- `src/db.ts`：IndexedDB 事务、原图关联、备份恢复。
- `src/ai.ts`：兼容接口、输入/输出校验、截图提取和建议生成。
- `src/pdf.ts`：PDF.js 本地文字提取、页面渲染、限制检查和取消清理。
- `worker/index.ts`：Hono 路由、AI SDK 流式助手、工具审批、模型及 Tavily 调用。
- `src/chat.ts` / `src/workflow.ts`：工具输入输出、会话与确认快照。
- `src/components/AgentChat.tsx`：SDK 对话界面、审批卡片、本地持久化。
- `src/components`：工作台各页面、编辑器、模板、导入与岗位流程。
- `tests` / `e2e`：核心与浏览器测试。

实现依据：[AI SDK 工具审批](https://ai-sdk.dev/docs/agents/tool-approvals)、[React 工具交互](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-tool-usage)、[Hono 接入](https://ai-sdk.dev/cookbook/api-servers/hono)、[Cloudflare Vite 插件](https://developers.cloudflare.com/workers/vite-plugin/get-started/)、[Tavily Search](https://docs.tavily.com/documentation/api-reference/endpoint/search)。
