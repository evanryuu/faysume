# Resume Studio

用户已确认：独立新项目，截图导入生成可编辑简历；自己配置 API；AI 挖掘亮点、建议应用/撤回；多简历；多模板；完整经历素材和 JD 截图；语言/招聘市场适配。当前“开始调研并实现”授权据此推进。

## 产品与界面

中文桌面优先、响应式工作台。暖白纸张、墨绿强调色、简洁编辑界面。侧边导航：我的简历、经历素材、AI 设置。首屏以截图导入和空白创建为主要入口，有明确标记的示例可体验。编辑页：内容表单、纸张预览、AI 建议区域。用户导入图片后先校对原文，再主动选择分析。所有真实 AI 操作都通过用户指定 API，不以假响应模拟成功。

## 本地优先与边界

React/TypeScript/Vite；Dexie/IndexedDB 保存简历、素材、原始图片和修改记录；无账户、无默认后台。API Key 仅当前页面内存保存，非敏感 Base URL/model/vision 设置可本地保存。默认支持 Chat Completions 兼容接口，由用户明确配置 vision 能力；连接测试是文本测试，不谎称证明视觉能力。直接跨域请求，遇到 CORS 提供说明，用户可配置自己信任且协议兼容的网关。不建立任意目标服务端代理。业务记录 JSON 备份不含 Key。文件处理限图片、文本/Markdown和本应用备份，PDF/DOCX 解析后续开发。

## 核心对象

- ResumeDocument：id/name/revision/template/locale/market/targetRole/jobDescription/content/suggestions/history/sourceIds/createdAt/updatedAt。
- ResumeContent：name/headline/email/phone/location/website/summary（全为 string）、sections。
- Section：id/title/kind（work/project/education/skills/other）、items。
- Item：id/title/organization/location/startDate/endDate/description（全为 string）。
- Material：id/title/content/createdAt/updatedAt。素材是独立事实来源；修改素材不自动更新任何简历。
- Source：id/resumeId/name/dataUrl，图片每张≤10MB、最多5张，保留顺序供校对。
- Suggestion：id/target（基本字段或 sectionId/itemId/field）/before/after/reason/evidence/question/status。应用要求字段当前值等于 before；新事实需标注待确认。来源为用户可核对的文本。
- HistoryEntry：id/label/changes（target/before/after）/createdAt/reverted；原子批量应用；撤回检查当前值等于 after，冲突整组拒绝，不覆盖后续编辑。

## AI 流程

视觉模型提取多张图片，返回严格校验的结构化 content + warnings（可见的不确定项）；生成本地 ID，不信任模型 ID。用户能调整图片顺序、查看原图、校对字段、确认识别。内容提取保留原文，模糊处留空/警告，不润色。文本粘贴作为模型无视觉时降级路径。

分析：输入简历快照、用户选择的素材、可选 JD/语言/市场；模型输出字段级建议和追问，返回时绑定原始快照值，应用时检测冲突。批量采纳作为一笔可撤回修改；拒绝/已应用状态持久化。翻译同样通过字段级建议，不能改变事实。JD 图片先提取可编辑文本，用户校对后新建岗位版本，再分析建议，不覆盖原简历。

## 模板与打印

三种同内容模板：经典、现代、紧凑；语义 HTML 文本输出，浏览器打印保存 PDF；A4 打印样式、隐藏应用外壳、合理分页。UI 不宣称保证 ATS 通过。模板切换不改内容。浏览器间 PDF 分页需在后续更多真实内容上验证。

## 验收

单测覆盖模型输出拒绝、重复 ID、跨版本隔离、过期建议拒绝、批量原子性、撤回冲突保护、历史持久化和密钥不进入备份。适配器使用注入 fetch 测试真实请求形状、视觉开关、错误/取消/超时处理。UI 覆盖创建/编辑/复制/刷新恢复/模板/导入导出及模拟 HTTP 边界的截图提取与建议流程。实际服务商识别质量需要用户的 Key 与真实截图，未做实测则明确标注。完成类型检查、生产构建和关键浏览器验证。

## 评审补充约束

带未确认事实/指标的建议在用户明确确认前禁止单条及批量应用。所有建议 target 必须在发起请求的快照中存在，批量重复 target 拒绝。异步返回绑定发起请求时的简历 id 与快照，切换页面或简历不能错写对象。测试覆盖三项约束。
