# 产品与技术调研

查询日期：2026-09-17。此文为面向首版实现的技术与产品调研，不是穷尽竞品报告。

## 结论

采用本地优先 Web 工作台，以“截图→结构化原文→人工校对→建议→采纳/撤回→导出”为核心。用常规请求工作流即可，无需 Agent 框架或向量数据库。事实素材独立保存，岗位简历是复制出来的稳定文档。

## 已核验与决策

1. [OpenAI 官方视觉文档](https://developers.openai.com/api/docs/guides/images-vision)：视觉输入支持图片，文字小、旋转、准确度都有局限。决策：保留原图、识别警告、人工确认，不承诺完美 OCR；要求用户明确配置支持视觉的模型。其他兼容服务商的能力仍需其自身验证。
2. [MDN CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS)：浏览器跨域 fetch 依赖服务端许可。决策：BYOK 直连不能保证任意地址可用；解释网络/CORS失败，支持用户自己的兼容网关，不默默转发到开发者服务。
3. [Dexie React 文档](https://dexie.org/docs/Tutorial/React)：可在 React 中通过 IndexedDB 保存与观察数据；数据与浏览器和源绑定。决策：用事务持久化文档/历史，提供 JSON 备份。换浏览器/域名不会自动带走数据。
4. [JSON Resume Schema](https://jsonresume.org/schema)：内容语义可独立于显示模板。借鉴结构化内容思路，但不宣称完整兼容该标准；用稳定 ID 和变更记录扩展本项目领域模型。
5. [MDN 打印样式](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Media_queries/Printing)：print media 和 @page 控制打印布局。决策：语义 HTML + 浏览器保存 PDF，不截图生成整页 PDF；实际可提取文本与分页要单独验证。

## 参考产品

[Reactive Resume 官方文档](https://docs.rxresu.me/getting-started)提供模板、实时预览、导出、AI builder、版本历史等功能入口；其公布技术栈含服务端和 PostgreSQL。已验证的是官方文档描述，未在本调研登录体验，也未验证截图→校对或证据级撤回的行为。不据此宣称竞争产品缺少某项功能。本项目以更小的本地优先数据层实现明确的截图导入路径，暂不复制完整平台能力。

## 首版范围与后续

首版：兼容 Chat Completions 的用户自带接口；图片/文本导入；多简历；三个模板；素材文本/Markdown导入；JD截图提取与独立岗位版本；有来源说明的 AI 建议、追问及事务撤回；市场/语言作为分析条件；JSON备份与PDF打印。

后续：PDF/DOCX解析、OCR本地降级、更多服务商协议、云同步、区域规则的版本化证据库。海外建议当前由用户设置的模型结合地区/语言给出，属于模型建议，不能声称是实时核验的地区规范或 ATS 保证。

## 首要风险与验证

- 真实图片识别准确度：需用户提供模型与图片验证，自动测试只能验证请求和校验流程。
- 撤回不能覆盖后续编辑：before/after 比较与原子批量测试。
- 异步响应与并发编辑：建议绑定请求时快照，写入时进行 revision 检查。
- 本地存储失败：错误可见，失败不报告已保存；备份恢复校验后原子提交。
- 密钥：只在内存，页面刷新需重新输入；非敏感模型配置可持久化。
