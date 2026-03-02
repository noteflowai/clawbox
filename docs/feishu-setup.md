# OpenClaw × 飞书(Feishu) 配置指南

本文档说明如何将 OpenClaw 的 IM 渠道 切换到飞书（Feishu/Lark）。

---

OpenClaw as ClaudeNative Service

---

## 一、飞书插件能力

- ✅ 支持私信（DM）
- ✅ 支持群聊（可被拉入群组，群里任何人都能@或直接发消息）
- ✅ 支持查看群内飞书文档、Wiki、云盘文件（通过内置工具）
- ✅ 支持消息 Reaction（表情回应）
- ✅ 支持富文本卡片（Card）消息
- ✅ 支持 WebSocket 长连接（无需公网 IP）

---

## 二、在飞书开放平台创建企业自建应用

> [!abstract] 相关服务
> 
> 管理后台： `https://<your-corp-id>.feishu.cn/admin/index`
> 飞书开放平台： https://open.feishu.cn/app


### 步骤 1：新建自建应用

1. 打开 [飞书开放平台](https://open.feishu.cn/app)，点击 **"创建企业自建应用"**。
2. 填写应用名称（如 `OpenClaw Bot`），上传图标，点击确认。
3. 进入应用详情页，记录：
   - **App ID**（`cli_xxx`）
   - **App Secret**（点击"查看"）

### 步骤 2：配置权限

进入 **"权限管理"** → **"开通权限"**，至少开通以下权限：

| 权限标识 | 说明 |
|---|---|
| `im:message` | 读取消息 |
| `im:message:send_as_bot` | 发送消息 |
| `im:chat` | 获取群信息 |
| `im:chat:readonly` | 读取群成员 |
| `docx:document:readonly` | 读取飞书文档（可选，用于文档工具） |
| `wiki:wiki:readonly` | 读取知识库（可选） |
| `drive:drive:readonly` | 读取云盘（可选） |

大部分情况下，建议使用下面的权限批量开通，这些权限可以让OpenClaw 有群成员读取，文档读取能力。

```json
{
  "scopes": {
    "tenant": [
      "aily:file:read",
      "aily:file:write",
      "application:application.app_message_stats.overview:readonly",
      "application:application:self_manage",
      "application:bot.menu:write",
      "cardkit:card:write",
      "contact:contact.base:readonly",
      "contact:user.employee_id:readonly",
      "corehr:file:download",
      "docs:document.content:read",
      "docx:document:readonly",
      "event:ip_list",
      "im:chat",
      "im:chat.access_event.bot_p2p_chat:read",
      "im:chat.members:bot_access",
      "im:message",
      "im:message.group_at_msg:readonly",
      "im:message.group_msg",
      "im:message.p2p_msg:readonly",
      "im:message:readonly",
      "im:message:send_as_bot",
      "im:resource",
      "sheets:spreadsheet",
      "wiki:wiki:readonly"
    ],
    "user": [
      "aily:file:read",
      "aily:file:write",
      "docx:document:readonly",
      "im:chat.access_event.bot_p2p_chat:read"
    ]
  }
}
```


### 步骤 3：配置事件订阅（WebSocket 模式推荐）

> [!warning] 注意，如果您的服务时第一次配置时，这一步可以跳过，请服务启动后，再配置这里，否可飞书会报错服务未启动。

1. 进入 **"事件与回调"** → **"事件订阅"**。
2. **推荐选择"使用长连接接收事件"**（WebSocket，无需公网服务器）。
3. 添加以下订阅事件：
   - `im.message.receive_v1`（接收消息）
   - `im.chat.member.bot.added_v1`（机器人被拉入群）
   - `im.chat.member.bot.deleted_v1`（机器人被踢出群）

### 步骤 4：配置机器人能力

1. 进入 **"应用功能"** → **"机器人"**，开启机器人功能。
2. 进入 **"事件与回调"** → **"加密策略"**。
3. 记录或设置 **Encrypt Key** 和 **Verification Token**（事件订阅页面）。

> 这里的密钥对应对配置文件中的"verificationToken" 和 "encryptKey" 字段 

### 步骤 5：发布应用

完成配置后，点击 **"版本管理与发布"** → **"申请线上发布"**（企业内部应用审核通常立即生效）。

---

## 三、修改 OpenClaw 配置文件

编辑 `~/.openclaw/openclaw.json`，将 `channels` 和 `plugins` 部分替换为飞书配置：

```json
"channels": {
  "feishu": {
    "enabled": true,
    "appId": "cli_xxxxxxxxxxxxxxxx",
    "appSecret": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "encryptKey": "你的EncryptKey（如未设置可留空字符串）",
    "verificationToken": "你的VerificationToken",
    "domain": "feishu",
    "connectionMode": "websocket",
    "dmPolicy": "open",
    "allowFrom": ["*"],
    "groupPolicy": "open",
    "requireMention": false,
    "renderMode": "auto"
  }
},
"plugins": {
  "entries": {
    "feishu": {
      "enabled": true
    }
  }
},
"bindings": [
  { "agentId": "main", "match": { "channel": "feishu" } }
]
```


---

## 四、配置参数说明

| 参数 | 必填 | 说明 |
|---|---|---|
| `appId` | ✅ | 飞书开放平台应用的 App ID |
| `appSecret` | ✅ | 飞书开放平台应用的 App Secret |
| `encryptKey` | 可选 | 事件加密密钥（建议设置，增强安全性） |
| `verificationToken` | 可选 | 事件验证 Token |
| `domain` | ✅ | 使用飞书填 `"feishu"`，Lark 国际版填 `"lark"` |
| `connectionMode` | ✅ | 推荐 `"websocket"`（无需公网 IP）；公网环境可选 `"webhook"` |
| `dmPolicy` | ✅ | `"open"` = 任何人可私信；`"pairing"` = 需配对；`"allowlist"` = 白名单 |
| `allowFrom` | ✅ | `["*"]` = 允许所有人；也可填飞书 open_id 列表 |
| `groupPolicy` | ✅ | `"open"` = 所有群可用；`"allowlist"` = 白名单群；`"disabled"` = 禁用群聊 |
| `requireMention` | ✅ | `false` = 群里无需@机器人也能收到消息；`true` = 需要@才响应 |
| `renderMode` | 可选 | `"auto"` 自动选择；`"card"` 富文本卡片；`"raw"` 纯文本 |

---

## 五、安装插件

OpenClaw 使用插件系统加载飞书支持。飞书插件已内置在源码中：

```
extensions/feishu/
```

若你是从源码构建，插件会自动包含。若使用 npm/发布版本：

```bash
# 查看已安装插件
openclaw plugins list

# 若 feishu 插件未出现，可通过 clawhub 安装（如有发布）
openclaw plugins install feishu
```

---

## 六、重启 OpenClaw

修改配置后，重启 Gateway 服务使配置生效：

```bash
openclaw gateway restart
```

查看状态确认飞书渠道已连接：

```bash
openclaw status
```

正常应看到 `feishu: connected` 或类似输出。

---

## 七、将机器人拉入群聊

1. 在飞书客户端，打开任意群聊。
2. 点击群设置 → **"群机器人"** → **"添加机器人"**。
3. 搜索你创建的应用名称（如 `OpenClaw Bot`），添加。
4. 添加后，群里任何成员发消息，OpenClaw 都能收到（`requireMention: false` 时）。
5. 若设置了 `requireMention: true`，需要 @OpenClaw Bot 才会触发响应。

---

## 八、查看飞书文档（文档工具）

飞书插件内置了以下文档相关工具，OpenClaw 可在对话中自动调用：

| 工具 | 功能 |
|---|---|
| 飞书文档工具 | 读取飞书 Docs 文档内容 |
| Wiki 工具 | 读取知识库页面 |
| 云盘工具 | 列出云盘文件 |
| Bitable 工具 | 读取多维表格数据 |

前提是应用已开通对应权限（见步骤 2）。

---

## 九、常见问题

**Q: 使用 WebSocket 模式需要公网 IP 吗？**
A: 不需要。WebSocket 模式由飞书开放平台主动推送，OpenClaw 作为客户端连接，无需开放端口。

**Q: 机器人在群里发言但不响应？**
A: 检查 `groupPolicy` 是否为 `"open"`，以及 `requireMention` 是否符合预期。

**Q: 如何让多个用户都能给机器人发私信？**
A: 设置 `dmPolicy: "open"` + `allowFrom: ["*"]`，任何企业内部用户都可以私信机器人。

**Q: 飞书文档权限报错？**
A: 确认应用已申请 `docx:document:readonly` 等权限，并已重新发版。

---

## 十、参考资料

- [飞书开放平台文档](https://open.feishu.cn/document/home/index)
- [OpenClaw 飞书渠道文档](https://docs.openclaw.ai/channels/feishu)
- OpenClaw 飞书插件源码：`extensions/feishu/`

