# AWS CI/CD Setup for Clawbox

This guide covers the full CI/CD pipeline: creating the `GithubActionsRole` in AWS, configuring GitHub, and understanding the two automated workflows — Helm deployment to EKS and Docker image builds to ECR.

---

## Overview

The pipeline has two separate workflows:

| Workflow | File | Trigger | What it does |
|---|---|---|---|
| Deploy Helm | `.github/workflows/aws_eks.yml` | Push to `main` or `v*` tag | Runs `helm upgrade` against the EKS cluster |
| Build Docker | `.github/workflows/docker.yml` | `docker*` tag | Builds Docker images and pushes to ECR |

Both workflows authenticate to AWS using **OIDC federation** (no long-lived access keys stored in GitHub).

---

## Part 1: AWS Setup

### 1.1 Prerequisites

- EKS cluster named `xorbit` in `us-west-2` (or adjust env vars in the workflows)
- Private ECR repository for your Docker images
- AWS CLI configured with admin access

### 1.2 Create the GitHub OIDC Identity Provider in AWS

This allows GitHub Actions to exchange a short-lived JWT for AWS credentials without storing secrets.

```bash
# Add GitHub's OIDC provider to IAM (one-time per AWS account)
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1
```

If it already exists you'll get a `EntityAlreadyExists` error — that's fine.

### 1.3 Create the GithubActionsRole

#### 1.3a Trust policy

Replace `YOUR_GITHUB_ORG` and `YOUR_REPO_NAME` with your actual GitHub org/user and repo:

```bash
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
GITHUB_ORG=YOUR_GITHUB_ORG
GITHUB_REPO=YOUR_REPO_NAME

cat > /tmp/github-actions-trust.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::${AWS_ACCOUNT_ID}:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:${GITHUB_ORG}/${GITHUB_REPO}:*"
        }
      }
    }
  ]
}
EOF
```

#### 1.3b Create the role

```bash
aws iam create-role \
  --role-name GithubActionsRole \
  --assume-role-policy-document file:///tmp/github-actions-trust.json \
  --description "Role assumed by GitHub Actions for ECR and EKS deployments"
```

#### 1.3c Attach the permissions policy

```bash
cat > /tmp/github-actions-policy.json << 'EOF'
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "ecr:CreateRepository",
                "ecr:GetAuthorizationToken",
                "ecr:BatchCheckLayerAvailability",
                "ecr:GetDownloadUrlForLayer",
                "ecr:GetRepositoryPolicy",
                "ecr:DescribeRepositories",
                "ecr:ListImages",
                "ecr:DescribeImages",
                "ecr:BatchGetImage",
                "ecr:InitiateLayerUpload",
                "ecr:UploadLayerPart",
                "ecr:CompleteLayerUpload",
                "ecr:PutImage",
                "eks:DescribeCluster",
                "eks:ListClusters",
                "sts:GetCallerIdentity"
            ],
            "Resource": "*"
        }
    ]
}
EOF

aws iam put-role-policy \
  --role-name GithubActionsRole \
  --policy-name GithubActionsPolicy \
  --policy-document file:///tmp/github-actions-policy.json
```

#### 1.3d Note the role ARN

```bash
aws iam get-role --role-name GithubActionsRole --query Role.Arn --output text
# arn:aws:iam::867344450900:role/GithubActionsRole
```

The workflows reference this ARN directly (hardcoded as `arn:aws:iam::867344450900:role/GithubActionsRole`). If your account ID differs, update the `role-to-assume` line in both workflow files.

### 1.4 Grant the Role Access to the EKS Cluster

The `GithubActionsRole` needs `kubectl` access to deploy Helm charts. Add it to the `aws-auth` ConfigMap:

```bash
# Get the current aws-auth ConfigMap
kubectl get configmap aws-auth -n kube-system -o yaml > /tmp/aws-auth.yaml
```

Edit `/tmp/aws-auth.yaml` and add to the `mapRoles` section:

```yaml
  - rolearn: arn:aws:iam::867344450900:role/GithubActionsRole
    username: github-actions
    groups:
      - system:masters
```

> **Note:** `system:masters` grants cluster-admin. For production, create a more restrictive ClusterRole that only allows namespace-scoped Helm operations.

Apply the updated ConfigMap:

```bash
kubectl apply -f /tmp/aws-auth.yaml
```

Alternatively, use `eksctl`:

```bash
eksctl create iamidentitymapping \
  --cluster xorbit \
  --region us-west-2 \
  --arn arn:aws:iam::867344450900:role/GithubActionsRole \
  --username github-actions \
  --group system:masters
```

---

## Part 2: GitHub Setup

### 2.1 Required GitHub Permissions

The workflows use `id-token: write` to request the OIDC JWT. This is already set in both workflow files:

```yaml
permissions:
  contents: read
  id-token: write
```

No additional GitHub App permissions are needed.

### 2.2 GitHub Environment: `production`

Both workflows run under a GitHub Actions **environment** named `production`. This allows you to add deployment protection rules (e.g., manual approval, branch restrictions).

Create the environment:
1. Go to your repo on GitHub → **Settings** → **Environments**
2. Click **New environment**
3. Name it `production`
4. Optionally add protection rules (required reviewers, wait timer, branch filter)

### 2.3 No Secrets Required

Because OIDC federation is used, **no AWS access keys are stored in GitHub**. The only configuration required is the environment name matching `production` in the workflow files.

If you need to override the AWS account ID or region, you can add GitHub Actions variables (not secrets):
- `AWS_ACCOUNT_ID`
- `AWS_REGION`

These are currently hardcoded in the workflow `env` blocks.

---

## Part 3: Workflow Reference

### Helm Deploy Workflow (`.github/workflows/aws_eks.yml`)

**Triggers:** Push to `main` branch, or any tag matching `v*`

```
push to main  ─→  Configure AWS (OIDC)  ─→  helm upgrade on xorbit/agentx
push v1.2.3   ─→  Configure AWS (OIDC)  ─→  helm upgrade on xorbit/agentx
```

Key settings:

```yaml
env:
  AWS_ACCOUNT_ID: 867344450900
  AWS_REGION: us-west-2
  EKS_CLUSTER: xorbit
```

Helm deploy parameters:
- Chart: `charts/`
- Namespace: `agentx`
- Release name: `app`
- Values file: `charts/values/values.beta.yaml`

To deploy to a different environment, create a new values file and add a new workflow step or separate workflow.

### Docker Build Workflow (`.github/workflows/docker.yml`)

**Triggers:** Any tag matching `docker*` (e.g., `docker-20240315`, `docker-v2`)

```
push docker*  ─→  Configure AWS (OIDC)  ─→  ECR login  ─→  docker build.sh  ─→  push to ECR
```

The build script is `docker/build.sh`. It uses these environment variables set by the workflow:
- `REGISTRY` — ECR registry URL from the `amazon-ecr-login` step
- `REPOSITORY_NAMESPACE` — set to `public` in the workflow env

Images are pushed to:
```
867344450900.dkr.ecr.us-west-2.amazonaws.com/public/<image>:<tag>
```

---

## Part 4: Triggering Deployments

### Deploy the Helm chart (application update)

```bash
# Merge a PR or push directly to main
git push origin main

# Or create a version tag
git tag v1.2.3
git push origin v1.2.3
```

### Build and push a new Docker image

```bash
git tag docker-$(date +%Y%m%d)
git push origin docker-$(date +%Y%m%d)
```

After the Docker workflow completes, update the image tag reference in `charts/values/values.beta.yaml` (or your environment values file) and push to `main` to trigger a Helm redeploy.

---

## Troubleshooting

**`Error: credentials could not be loaded` in GitHub Actions**
- Verify the OIDC provider is registered in your AWS account (step 1.2)
- Check the trust policy `StringLike` condition matches your exact GitHub org and repo name
- Ensure the workflow has `id-token: write` permission

**`kubectl` / Helm deploy fails with `Unauthorized`**
- Verify `GithubActionsRole` is in the EKS `aws-auth` ConfigMap
- Check the role ARN in the workflow matches the one in `aws-auth`

**`helm upgrade` fails with `namespace not found`**
- Create the namespace first: `kubectl create namespace agentx`
- Or add `--create-namespace` to the helm deploy action's `values` parameter

**Docker build fails with `no such file: docker/build.sh`**
- Ensure `docker/build.sh` exists and is executable in the repo
- Check the `docker*` tag was pushed from the correct branch
