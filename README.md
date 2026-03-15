# ClawBox

A cloud-native OpenClaw environment on Kubernetes

### Deploy

1. Download [`CloudFormation.yaml`](https://raw.githubusercontent.com/aws300/clawbox/main/scripts/CloudFormation.yaml)
2. Open the [AWS CloudFormation Console](https://console.aws.amazon.com/cloudformation/home#/stacks/new) → **Create stack** → **Upload a template file**
3. Upload the downloaded YAML file, then follow the wizard to create the stack

> **Note:** CloudFormation's `templateURL` parameter only accepts S3 URLs, so the template must be uploaded manually.

## OpenClaw as Claude Native Service

OpenClaw is the runtime gateway that runs inside the clawbox pod, bridging Claude Code to MCP servers (Playwright, Google Search, and custom tools). Running it as a managed Kubernetes service on EKS gives you a reproducible, secure, and iterable AI development environment.

### Cloud-Native Architecture

The entire stack runs as a single Helm release on EKS:

- **clawbox pod** — Webtop desktop container with Claude Code, OpenClaw gateway, and MCP servers co-located
- **HTTPRoute** — Kubernetes Gateway API routes `clawbox-dev.example.com` directly to the pod
- **IRSA** — Pod assumes an IAM role via ServiceAccount annotation; no credentials stored anywhere
- **Amazon Bedrock** — Claude claude-sonnet-4-5 / claude-sonnet-4-6 served natively from AWS; no API key required

### Security

- **Zero long-lived credentials** — IRSA mounts a short-lived web identity token into the pod at runtime; AWS STS exchanges it for temporary credentials scoped to Bedrock only
- **Minimal IAM surface** — The `ClawboxBedrockRole` holds exactly three permissions: `bedrock:InvokeModel`, `bedrock:InvokeModelWithResponseStream`, `bedrock:ListFoundationModels`
- **No ECR auth needed for end users** — The container image is served from a public ECR repository; any AWS account can pull it without credentials
- **GitHub OIDC** — CI/CD uses GitHub's OIDC provider to assume `GithubActionsRole`; no AWS access keys are stored in GitHub secrets

### Development Workflow

```
git push main  →  GitHub Actions  →  helm upgrade (EKS)  →  live in ~60s
git tag docker-*  →  GitHub Actions  →  docker build  →  ECR push
```

Two separate pipelines keep application config changes (Helm values) decoupled from container image changes. Rollback is a single `helm rollback` command.

### AWS Graviton Advantages

Clawbox is built as a multi-arch image (`linux/amd64`, `linux/arm64`). Running on Graviton (EKS `m8g` / `c8g` nodes) provides:

- Up to 40% better price/performance vs. x86 for long-running AI workloads
- Native ARM execution — no emulation overhead for the Claude Code process
- Lower per-hour cost for the 4 GiB RAM / 2 vCPU baseline request

### Iterability

Because the full environment is defined in `charts/`, every change — adding an MCP server, tuning resource limits, updating the OpenClaw config — is a reviewed, versioned pull request. The `production` GitHub environment gate enforces approval before any change reaches the cluster.

## Quick Start

After the CloudFormation stack reaches **CREATE_COMPLETE**, open the **Outputs** tab in the CloudFormation console:

1. **Open ClawBox** — Copy the `CloudFrontDomain` value and open `https://<CloudFrontDomain>` in your browser.
2. **Login** — Use the credentials from the Outputs tab:
   - **Username**: `CognitoAdminUsername` (default `admin@cnf.local`)
   - **Password**: `CognitoAdminPassword` (auto-generated, shown only once — save it immediately)

> ⚠️ The admin password is generated at stack creation time and displayed only in the Outputs tab. If you lose it, delete and recreate the stack or reset the password via the Cognito console.

## Docs

- [AWS IRSA Setup](docs/aws-irsa-setup.md) — Create the Bedrock IAM role and deploy with Helm
- [AWS CI/CD Setup](docs/aws-cicd-setup.md) — Configure GithubActionsRole and GitHub workflows
- [Architecture Diagram](docs/architecture.drawio) — Full system diagram (open in draw.io)
