# ClawBox 安装指南

ClawBox 是一个运行在 EKS 上的云原生 AI 工作站，内置 Claude Code、OpenClaw Gateway、飞书接入和 MCP 工具链，通过 IRSA 零凭证调用 Amazon Bedrock。

**前置要求：**
- EKS 集群（已启用 OIDC Provider）
- AWS CLI（有创建 IAM Role 的权限）
- kubectl + helm v3

---

## 第一步：初始化 AWS IAM Role

一行命令完成：OIDC 关联 + IAM Role 创建 + Bedrock 权限绑定。

```bash
curl -fsSL https://raw.githubusercontent.com/nxlabs/clawbox-agentx/main/scripts/init-aws-role.sh | \
  CLUSTER_NAME=<your-eks-cluster> \
  AWS_REGION=<your-region> \
  bash
```

或者本地执行：

```bash
CLUSTER_NAME=xorbit AWS_REGION=us-west-2 bash scripts/init-aws-role.sh
```

脚本完成后会输出 `ROLE_ARN`，下一步用到。

---

## 第二步：一行 Helm 安装 ClawBox

```bash
helm upgrade --install claw ./charts \
  --namespace agentx --create-namespace \
  --set clawbox.enabled=true \
  --set clawbox.irsaRoleArn=<ROLE_ARN_FROM_STEP1> \
  --set clawbox.feishu.appId=<FEISHU_APP_ID> \
  --set clawbox.feishu.appSecret=<FEISHU_APP_SECRET> \
  --set clawbox.feishu.verificationToken=<FEISHU_VERIFICATION_TOKEN> \
  --set global.wildcardHost=<YOUR_DOMAIN> \
  --set global.gateway=<YOUR_GATEWAY_NAME> \
  --set global.gatewayNamespace=<YOUR_GATEWAY_NS>
```

> 飞书 App ID / App Secret / Verification Token 来自[飞书开放平台](https://open.feishu.cn/app)，
> 详见 [feishu-setup.md](./feishu-setup.md)。

### 用 values 文件管理（推荐用于多环境）

```yaml
# my-values.yaml
clawbox:
  enabled: true
  irsaRoleArn: "arn:aws:iam::123456789012:role/ClawboxBedrockRole"
  webtopToken: "your-webtop-token"   # 留空则 Webtop 不鉴权
  feishu:
    appId: "cli_xxxxxxxxxxxxxxxx"
    appSecret: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
    encryptKey: ""                   # 飞书加密密钥，未设置留空
    verificationToken: "xxxxxxxx"
global:
  wildcardHost: "your-domain.example.com"
  gateway: "eg"
  gatewayNamespace: "aws300"
```

```bash
helm upgrade --install claw ./charts -n agentx --create-namespace -f my-values.yaml
```

### 使用自定义 openclaw.json（高级）

当内置模板无法满足需求时，可完全覆盖配置文件：

```yaml
# my-values.yaml
clawbox:
  enabled: true
  irsaRoleArn: "arn:aws:iam::123456789012:role/ClawboxBedrockRole"
  customConfig:
    enabled: true
    json: |
      {
        "channels": { "feishu": { "appId": "cli_xxx", ... } },
        ...
      }
```

`customConfig.enabled: true` 时，`feishu.*` 字段被忽略，ConfigMap 直接使用 `customConfig.json` 的内容。

---

## 验证安装

```bash
# Pod 状态（启动约需 60s）
kubectl get pods -n agentx

# 确认 IRSA 注解正确
kubectl get sa jump-sa -n agentx -o jsonpath='{.metadata.annotations}'

# 进入 Pod 验证 Bedrock 权限
kubectl exec -n agentx deploy/claw -- aws sts get-caller-identity
kubectl exec -n agentx deploy/claw -- aws bedrock list-foundation-models --region us-west-2
```

---

## 常见问题

| 现象 | 排查 |
|---|---|
| Pod Pending | 节点资源不足（需 4Gi RAM / 2 CPU），`kubectl describe pod` 查看 |
| Bedrock 403 | OIDC Provider 未关联，或 Trust Policy 中 namespace/SA 名拼写错误 |
| 飞书无响应 | 检查 feishu.appId / appSecret 是否正确；飞书应用是否已发布 |
| SA 注解为空 | `clawbox.irsaRoleArn` 未填写，`helm upgrade` 补充后重新执行 |
