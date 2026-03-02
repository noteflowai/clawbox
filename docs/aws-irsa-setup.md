# AWS IRSA Setup for Clawbox

This guide covers how to create the IAM role for IRSA (IAM Roles for Service Accounts), attach the required Bedrock permissions, and deploy clawbox using `helm install`.

The ECR image is **public** — no ECR credentials or special IAM permissions are needed to pull it.

---

## Prerequisites

- An existing EKS cluster with the OIDC provider enabled
- AWS CLI configured with admin-level access
- `kubectl` configured for your cluster
- `helm` v3+

---

## 1. Get Your EKS OIDC Provider URL

```bash
CLUSTER_NAME=xorbit
AWS_REGION=us-west-2

OIDC_URL=$(aws eks describe-cluster \
  --name $CLUSTER_NAME \
  --region $AWS_REGION \
  --query "cluster.identity.oidc.issuer" \
  --output text)

echo $OIDC_URL
# https://oidc.eks.us-west-2.amazonaws.com/id/EXAMPLED539D4633E53DE1B71EXAMPLE
```

If the OIDC provider is not yet registered in IAM:

```bash
eksctl utils associate-iam-oidc-provider \
  --cluster $CLUSTER_NAME \
  --region $AWS_REGION \
  --approve
```

---

## 2. Create the IAM Role for Bedrock Access

The role needs a trust policy that allows the `jump-sa` ServiceAccount in the `agentx` namespace to assume it.

### 2a. Get your AWS account ID and OIDC provider ID

```bash
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
OIDC_ID=$(echo $OIDC_URL | sed 's|https://||')
echo "Account: $AWS_ACCOUNT_ID"
echo "OIDC ID: $OIDC_ID"
```

### 2b. Create the trust policy document

```bash
cat > /tmp/clawbox-trust-policy.json << EOF
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
          "${OIDC_ID}:sub": "system:serviceaccount:agentx:jump-sa",
          "${OIDC_ID}:aud": "sts.amazonaws.com"
        }
      }
    }
  ]
}
EOF
```

### 2c. Create the IAM role

```bash
ROLE_NAME=ClawboxBedrockRole

aws iam create-role \
  --role-name $ROLE_NAME \
  --assume-role-policy-document file:///tmp/clawbox-trust-policy.json \
  --description "IRSA role for Clawbox — grants Amazon Bedrock model invocation access"
```

### 2d. Create and attach the Bedrock permissions policy

```bash
cat > /tmp/clawbox-bedrock-policy.json << EOF
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

aws iam put-role-policy \
  --role-name $ROLE_NAME \
  --policy-name ClawboxBedrockPolicy \
  --policy-document file:///tmp/clawbox-bedrock-policy.json
```

### 2e. Note the role ARN

```bash
ROLE_ARN=$(aws iam get-role --role-name $ROLE_NAME --query Role.Arn --output text)
echo $ROLE_ARN
# arn:aws:iam::123456789012:role/ClawboxBedrockRole
```

---

## 3. Deploy with Helm

### 3a. Create the namespace

```bash
kubectl create namespace agentx
```

### 3b. Create a values override file

Create a file `my-values.yaml` (do not commit secrets to git):

```yaml
global:
  wildcardHost: your-domain.example.com   # domain for the HTTPRoute hostname
  gateway: eg                             # name of your Gateway resource
  gatewayNamespace: your-gateway-ns       # namespace where the Gateway lives
  repository: 867344450900.dkr.ecr.us-west-2.amazonaws.com/

clawbox:
  enabled: true
  webtopToken: "your-secret-token"        # URL auth token, or leave "" to disable
  irsaRoleArn: "arn:aws:iam::123456789012:role/ClawboxBedrockRole"
```

Replace placeholder values with your own. The `irsaRoleArn` is the ARN you noted in step 2e.

### 3c. Install with Helm

```bash
helm install claw ./charts \
  -n agentx \
  -f charts/values/values.beta.yaml \
  -f my-values.yaml
```

Or upgrade an existing release:

```bash
helm upgrade claw ./charts \
  -n agentx \
  -f charts/values/values.beta.yaml \
  -f my-values.yaml
```

### 3d. Verify the pod is running

```bash
kubectl get pods -n agentx
kubectl describe pod -n agentx -l app=claw
```

Check that the ServiceAccount annotation is correct:

```bash
kubectl get serviceaccount jump-sa -n agentx -o yaml
```

The output should show:

```yaml
metadata:
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::123456789012:role/ClawboxBedrockRole
```

---

## 4. Verify Bedrock Access from Inside the Pod

```bash
kubectl exec -n agentx -it deploy/claw -- bash

# Inside the pod — verify the IRSA token is mounted
ls /var/run/secrets/eks.amazonaws.com/serviceaccount/

# Verify the assumed identity
aws sts get-caller-identity

# Test Bedrock access
aws bedrock list-foundation-models --region us-west-2 | head -20
```

---

## Bedrock Permissions Reference

| Permission | Purpose |
|---|---|
| `bedrock:InvokeModel` | Synchronous model invocation |
| `bedrock:InvokeModelWithResponseStream` | Streaming model invocation (used by Claude Code) |
| `bedrock:ListFoundationModels` | List available models |

No additional permissions are needed. The ECR image is public and does not require ECR IAM permissions.

---

## Troubleshooting

**Pod cannot assume role / 403 on Bedrock calls**
- Verify the OIDC provider is registered: `aws iam list-open-id-connect-providers`
- Check the trust policy `StringEquals` conditions match the exact namespace and service account name
- Ensure `CLAUDE_CODE_USE_BEDROCK=1` is set in the pod (it is set by the Helm chart)

**ServiceAccount annotation is empty**
- Make sure `clawbox.irsaRoleArn` is set in your values file and is not an empty string
- Re-run `helm upgrade` after updating values

**Pod stuck in Pending**
- Check node capacity: `kubectl describe nodes`
- The pod requests `4Gi` memory and `2` CPU — ensure a node can satisfy this
