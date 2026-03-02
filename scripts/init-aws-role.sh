#!/usr/bin/env bash
# init-aws-role.sh — 一键初始化 ClawBox 所需的 AWS IAM Role
#
# 用法：
#   CLUSTER_NAME=my-cluster AWS_REGION=us-west-2 bash scripts/init-aws-role.sh
#
# 可选环境变量：
#   CLUSTER_NAME    EKS 集群名称            (默认: xorbit)
#   AWS_REGION      AWS 区域                (默认: us-west-2)
#   ROLE_NAME       IAM Role 名称           (默认: ClawboxBedrockRole)
#   K8S_NAMESPACE   Pod 所在 namespace       (默认: agentx)
#   K8S_SA          ServiceAccount 名称     (默认: jump-sa)

set -euo pipefail

CLUSTER_NAME="${CLUSTER_NAME:-xorbit}"
AWS_REGION="${AWS_REGION:-us-west-2}"
ROLE_NAME="${ROLE_NAME:-ClawboxBedrockRole}"
K8S_NAMESPACE="${K8S_NAMESPACE:-agentx}"
K8S_SA="${K8S_SA:-jump-sa}"

# ── 颜色输出 ──────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

# ── 前置检查 ──────────────────────────────────────────────────────────────────
command -v aws  &>/dev/null || error "需要安装 AWS CLI"
aws sts get-caller-identity &>/dev/null || error "AWS CLI 未配置凭证，请先运行 aws configure 或设置环境变量"

info "集群: ${CLUSTER_NAME}  区域: ${AWS_REGION}  Role: ${ROLE_NAME}"

# ── Step 1: 获取账号 ID 和 OIDC 信息 ─────────────────────────────────────────
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
info "AWS Account ID: ${AWS_ACCOUNT_ID}"

OIDC_URL=$(aws eks describe-cluster \
  --name "${CLUSTER_NAME}" \
  --region "${AWS_REGION}" \
  --query "cluster.identity.oidc.issuer" \
  --output text 2>/dev/null) || error "无法获取集群 ${CLUSTER_NAME} 的 OIDC URL，请确认集群名称和区域是否正确"

OIDC_ID="${OIDC_URL#https://}"   # 去掉 https:// 前缀
info "OIDC Provider: ${OIDC_ID}"

# ── Step 2: 确保 OIDC Provider 已在 IAM 中注册 ───────────────────────────────
OIDC_ARN="arn:aws:iam::${AWS_ACCOUNT_ID}:oidc-provider/${OIDC_ID}"
if aws iam get-open-id-connect-provider --open-id-connect-provider-arn "${OIDC_ARN}" &>/dev/null; then
  info "OIDC Provider 已注册，跳过"
else
  info "注册 OIDC Provider ..."
  if command -v eksctl &>/dev/null; then
    eksctl utils associate-iam-oidc-provider \
      --cluster "${CLUSTER_NAME}" --region "${AWS_REGION}" --approve
  else
    # 手动获取 thumbprint 并注册
    THUMBPRINT=$(openssl s_client -connect "oidc.eks.${AWS_REGION}.amazonaws.com:443" \
      -servername "oidc.eks.${AWS_REGION}.amazonaws.com" </dev/null 2>/dev/null \
      | openssl x509 -fingerprint -noout -sha1 2>/dev/null \
      | sed 's/.*=//;s/://g' | tr '[:upper:]' '[:lower:]')
    aws iam create-open-id-connect-provider \
      --url "${OIDC_URL}" \
      --client-id-list "sts.amazonaws.com" \
      --thumbprint-list "${THUMBPRINT}" 2>/dev/null || warn "OIDC Provider 创建失败（可能已存在），继续..."
  fi
fi

# ── Step 3: 创建 Trust Policy ─────────────────────────────────────────────────
TRUST_POLICY=$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::${AWS_ACCOUNT_ID}:oidc-provider/${OIDC_ID}"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "${OIDC_ID}:sub": "system:serviceaccount:${K8S_NAMESPACE}:${K8S_SA}",
          "${OIDC_ID}:aud": "sts.amazonaws.com"
        }
      }
    }
  ]
}
EOF
)

# ── Step 4: 创建 IAM Role（已存在则跳过）────────────────────────────────────
if aws iam get-role --role-name "${ROLE_NAME}" &>/dev/null; then
  warn "IAM Role ${ROLE_NAME} 已存在，更新 Trust Policy ..."
  aws iam update-assume-role-policy \
    --role-name "${ROLE_NAME}" \
    --policy-document "${TRUST_POLICY}"
else
  info "创建 IAM Role: ${ROLE_NAME} ..."
  aws iam create-role \
    --role-name "${ROLE_NAME}" \
    --assume-role-policy-document "${TRUST_POLICY}" \
    --description "IRSA role for ClawBox — Amazon Bedrock access via EKS ServiceAccount"
fi

# ── Step 5: 绑定 Bedrock 权限 ─────────────────────────────────────────────────
info "绑定 Bedrock 权限..."
BEDROCK_POLICY=$(cat <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream",
        "bedrock:ListFoundationModels"
      ],
      "Resource": "*"
    }
  ]
}
EOF
)
aws iam put-role-policy \
  --role-name "${ROLE_NAME}" \
  --policy-name "ClawboxBedrockPolicy" \
  --policy-document "${BEDROCK_POLICY}"

# ── 完成 ──────────────────────────────────────────────────────────────────────
ROLE_ARN=$(aws iam get-role --role-name "${ROLE_NAME}" --query Role.Arn --output text)

echo ""
echo -e "${GREEN}✅ 初始化完成！${NC}"
echo ""
echo -e "  ROLE_ARN=${ROLE_ARN}"
echo ""
echo -e "  下一步，执行 Helm 安装："
echo -e "  ${YELLOW}helm upgrade --install claw ./charts \\${NC}"
echo -e "  ${YELLOW}    --namespace ${K8S_NAMESPACE} --create-namespace \\${NC}"
echo -e "  ${YELLOW}    --set clawbox.enabled=true \\${NC}"
echo -e "  ${YELLOW}    --set clawbox.irsaRoleArn=${ROLE_ARN} \\${NC}"
echo -e "  ${YELLOW}    --set clawbox.feishu.appId=<FEISHU_APP_ID> \\${NC}"
echo -e "  ${YELLOW}    --set clawbox.feishu.appSecret=<FEISHU_APP_SECRET> \\${NC}"
echo -e "  ${YELLOW}    --set clawbox.feishu.verificationToken=<FEISHU_TOKEN> \\${NC}"
echo -e "  ${YELLOW}    --set global.wildcardHost=<YOUR_DOMAIN>${NC}"
echo ""
