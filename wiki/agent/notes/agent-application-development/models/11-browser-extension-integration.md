---
type: synthesis
status: active
tags:
  - agent
  - browser
  - browser-automation
  - extension
  - web
  - comparative-analysis
updated_at: 2026-09-02
---

# 浏览器插件作为 Agent 的浏览器执行端

## 1. 当前结论

如果 Agent 的主要任务是“理解并操作用户当前打开的网页”，可以把浏览器右侧的 Side Panel 作为 Agent 的交互入口，把插件中的 Content Script 作为页面内的执行端。

这条路径的核心思想是：

```text
浏览器插件负责看见网页、执行网页动作
Agent 后端负责模型调用、Turn、工具编排、策略和审批
```

它可以明显减少远程 Chromium、CDP 地址、浏览器实例和浏览器服务商的管理工作，但不会消除权限、标签页生命周期、动态 DOM、跨域 iframe 和隐私保护等问题。

这是一种可以单独记录的集成形态，不代表现在就要把 AI Manus 改造成浏览器插件。后续如果要做浏览器自动化，可以把它作为 Host / Browser Executor 的候选实现。

## 2. 整体形态：右侧面板 + 页面脚本 + Agent 后端

![Agent 浏览器插件：右侧面板与当前网页](../diagrams/browser-extension-architecture.svg)

附件：[SVG 矢量图](../diagrams/browser-extension-architecture.svg) · [HTML 交互图](../diagrams/browser-extension-architecture.html)

可以把插件想成右侧的遥控器，Content Script 是伸进左侧网页里的“手和眼睛”：

```text
右侧 Side Panel
  ├─ 展示对话、执行状态和审批
  └─ 发送用户请求
        ↕ runtime message
Extension Worker / Service Worker
  ├─ 维护 session_id、tab_id、frame_id
  ├─ 连接 Agent 后端
  └─ 把动作转发给页面脚本
        ↕ message
Content Script
  ├─ 读取页面 DOM 和可见内容
  ├─ 生成 Snapshot 和元素 ref
  └─ 执行点击、输入、滚动等动作
        ↕
当前网页
```

### 2.1 Side Panel

Side Panel 是用户始终可以打开的右侧界面，比点击后自动关闭的 Popup 更适合 Agent。它负责：

- 显示当前页面和 Agent 对话；
- 展示 Agent 正在执行的动作；
- 显示截图、网页摘要和工具结果；
- 在删除、提交、购买等副作用操作前请求审批；
- 让用户切换“只读当前页面”和“允许操作页面”等模式。

### 2.2 Extension Worker

它是插件的通信和生命周期协调层，不直接负责解析复杂页面。它通常维护：

- 当前窗口和活动标签页；
- `session_id` 与 `tab_id` 的绑定；
- Agent 后端的 SSE 或 WebSocket 连接；
- 执行动作时的 `action_id` 和超时；
- 页面刷新、标签页关闭、断线重连等状态。

### 2.3 Content Script

Content Script 在网页上下文中运行，因此能读取用户当前可以看到的 DOM，也能调用页面元素的点击、聚焦和滚动方法。它不应该承担 LLM 调用、策略判断或长期数据存储。

## 3. 左侧网页数据怎样回到 Agent

一次“分析当前页面”的路径可以是：

```text
用户打开右侧面板
  ↓
插件查询当前活动标签页，取得 tab_id
  ↓
Content Script 读取页面标题、URL、选中文本和可见结构
  ↓
生成 Snapshot，并为按钮、链接、输入框分配 ref
  ↓
Extension Worker 附带 session_id / tab_id / snapshot_id 发给后端
  ↓
Agent Runtime 将页面信息作为本次 Turn 的上下文
  ↓
模型决定回答，或发起 browser_* 动作
```

不建议默认把整个原始 HTML 上传给模型。更适合传递：

- 页面标题和 URL；
- 用户明确选中的内容；
- 当前可见文本；
- 可交互元素的语义信息；
- 必要时的局部 DOM 或截图。

页面 Snapshot 可以类似这样：

```text
页面标题：订单详情
  ├─ heading：订单详情
  ├─ button [ref=1]：确认收货
  ├─ textbox [ref=2]：备注
  └─ link [ref=3]：查看物流
```

相比让模型猜 CSS 选择器，`ref + snapshot_id` 更容易检查页面是否已经发生变化。

## 4. 六类浏览器动作怎样执行

| 动作 | 插件中的实现 | 需要注意什么 |
| --- | --- | --- |
| 点击 | 根据 Snapshot 中的 `ref` 找到元素，聚焦并调用点击事件 | 页面变化后旧 `ref` 可能失效；删除、提交等动作应先审批 |
| 输入 | 找到 `input`、`textarea` 或 `contenteditable`，设置值并触发 `input/change` 事件 | React/Vue 只改 DOM 可能不更新内部状态；密码框不应回传原值 |
| 滚动 | 调用 `window.scrollBy` 或 `element.scrollIntoView` | 滚动可能触发懒加载，需要等待并重新 Snapshot |
| 页面跳转 | 由标签页 API 更新 URL，或由页面设置 `location` | 跳转后旧 DOM、`frame_id` 和 `snapshot_id` 都需要重新确认 |
| 截图 | 调用浏览器的可见区域截图接口，把 PNG 返回给面板或 Agent | 默认是当前视口；整页截图需要分段滚动或更高权限接口 |
| 文件上传 | 用户选择文件后，将文件交给网页的 file input，或使用专门的自动化接口 | 受本地文件和用户手势限制，通常需要明确确认，不能静默读取电脑文件 |

统一的动作请求可以保持成一个简单协议：

```json
{
  "action_id": "act_123",
  "session_id": "session_456",
  "tab_id": 12,
  "frame_id": 0,
  "snapshot_id": "snap_789",
  "action": "click",
  "args": { "ref": 1 }
}
```

执行前，插件至少检查 `tab_id`、当前 URL 和 `snapshot_id`。执行后返回成功、失败、超时或需要重新读取页面，并尽量附带新的 Snapshot。

## 5. 五个必须提前理解的边界

### 5.1 权限：插件能不能看这个页面

浏览器不会默认允许插件访问所有网站。扩展需要声明读取标签页、注入脚本、截图和访问域名等权限。

常见选择是：

- `activeTab`：用户主动触发后，临时访问当前页；
- `scripting`：允许向页面注入 Content Script；
- `host_permissions`：允许自动访问指定网站或多个网站。

权限越宽，Agent 越方便，但插件一旦被滥用，能看到和操作的数据也越多。因此应从最小权限开始，并把“当前页只读”和“允许执行动作”分开。

### 5.2 跨域 iframe：页面里还有另一个网站

例如：

```text
shop.example.com
  └─ iframe：payment.example.net
```

主页面的脚本不能直接读取另一个域名 iframe 的内部 DOM。要处理它，插件可能需要：

- 对 iframe 所属域名也申请权限；
- 在所有 frame 中注入 Content Script；
- 使用 `frame_id` 区分主页面和 iframe；
- 如果对方配合，则通过 `postMessage` 通信。

没有对应权限时，插件最多只能看见 iframe 外壳，不能点击内部按钮。

### 5.3 动态页面：刚读完，页面又变了

现代网页经常由 React、Vue 或其他前端框架局部更新。点击、滚动、切换选项后，原来的元素可能已经被替换。

因此动作通常是：

```text
读取 Snapshot
  ↓
执行动作
  ↓
等待页面变化或网络空闲
  ↓
重新读取 Snapshot
```

可以使用 `MutationObserver` 观察变化，也可以只在动作完成后按需重新读取，避免把整页 DOM 持续上传。

### 5.4 标签页绑定：不能点错页面

右侧面板可能一直开着，但用户会在左侧切换标签页。每次请求都应该绑定：

```text
session_id + window_id + tab_id + frame_id + page_url + snapshot_id
```

插件需要监听标签页激活、URL 更新、页面刷新和标签页关闭。如果 Agent 还在处理淘宝页面，而用户已经切到了 GitHub，插件应该暂停或拒绝旧动作，而不是把点击发到新页面。

### 5.5 隐私：当前页面可能包含秘密

当前页面可能含有密码、私人聊天、公司内部数据和登录后的业务信息。最低限度应做到：

- 默认只发送可见、必要和用户选择的内容；
- 对密码、支付信息和敏感输入框做脱敏；
- 不把原始 DOM 当作长期存储；
- 限制可访问的域名和 frame；
- 敏感动作经过 Policy / Approval；
- 传输和持久化使用加密；
- 把网页内容当作不可信数据，而不是系统指令。

插件实际上拥有用户当前网页的登录态，因此它的安全等级不能按普通 UI 插件来处理。

## 6. 浏览器读取能否替代 Web Search 和 Web Fetch

不能完全替代，但可以把职责分清：

```text
当前页面已经打开，需要理解或操作
  → 浏览器插件读取 DOM / Snapshot

需要发现互联网上有哪些网页
  → web_search

需要后台、批量或定时抓取网页正文
  → web_fetch
```

插件当然也可以打开搜索引擎再读取搜索结果，但这条路径通常更慢、更容易遇到验证码和页面结构变化。后端 Search / Fetch 仍然适合做发现、批处理和定时任务。

因此比较合理的是保留三类能力：

```text
browser_*  → 当前页面的看与做
web_search → 互联网发现
web_fetch  → 后台内容获取
```

## 7. 放回 QM、Omnigent 和 DSH 看

### QM

QM 当前的 `browse` Skill 依赖远程 Chromium、`browser-use` 和 CDP。插件形态可以把远程浏览器替换成当前用户浏览器，但需要重新处理标签页绑定、浏览器权限、文件上传和插件断线。

### Omnigent

Omnigent 最容易迁移。它已经有 `browser_navigate`、`browser_snapshot`、`browser_click`、`browser_type` 和 `browser_screenshot`，也已经存在“Server 发动作请求、浏览器执行、返回结果”的 Relay 思路。现在的 Electron WebContentsView 可以被浏览器插件 Relay 替换。

### DSH

DSH 已经通过 `ctx.web` 把搜索和抓取 Provider 解耦，但当前没有发现通用的模型浏览器控制能力。若增加插件，需要新增类似 `ctx.browser` 的能力 seam，以及浏览器动作协议、页面 Snapshot 和 Host 权限管理。

## 8. 适合逐步验证的最小路径

这不是立即改造方案，而是后续验证浏览器 Host 时可以按顺序确认的能力：

1. Side Panel 连接后端，并能读取当前页标题、URL、选中文本和可见 Snapshot。
2. 实现点击、输入、滚动和可见区域截图，并验证 `tab_id + snapshot_id` 不会误操作。
3. 增加页面跳转、动态页面等待、标签页切换和断线重连。
4. 最后处理文件上传、跨域 iframe、敏感操作审批和隐私脱敏。

相关模块：

- [交互入口与实时通信](./01-interaction-realtime.md)：Side Panel、SSE / WebSocket 和断线重连。
- [应用核心与 Session / Turn 生命周期](./02-session-turn-lifecycle.md)：浏览器动作属于哪个 Session 和 Turn。
- [Tools、MCP、Policy 与 Approval](./05-tools-mcp-policy-approval.md)：动作注册、策略和审批。
- [状态、事件、持久化与恢复](./07-state-events-persistence-recovery.md)：动作结果、Snapshot 和标签页恢复。
- [部署、可观测性、安全与测试](./10-deployment-observability-security-testing.md)：插件权限、隐私和跨边界测试。

## 9. 观察依据

- QM：`skills-seed/browse/SKILL.md`、`src/harness/codex-harness.ts`、`src/connectors/browser-session-store.ts`
- Omnigent：`omnigent/tools/builtins/browser.py`、`omnigent/runner/tool_dispatch.py`、`web/src/hooks/useBrowserAgentRelay.ts`
- DSH：`packages/web/tool-web/src/search.ts`、`packages/web/tool-web/src/fetch.ts`、`packages/web/web/src/index.ts`

[返回模块分析导航](../architecture.md#模块分析导航)
