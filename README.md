# Production-Style CI/CD Pipeline with Blue-Green Deployment

![CI-CD](../../actions/workflows/cicd.yml/badge.svg)

> A pragmatic CI/CD pipeline demonstrating real-world deployment patterns for a Django application:
> **GitHub Actions → Docker (GHCR) → Ansible → Staging → Automated Testing → Blue-Green Production**

## Overview

This project implements an opinionated CI/CD pipeline that goes beyond "hello world" demos. It includes the messy, real-world complications teams encounter in production: platform mismatches, health checks, zero-downtime deploys, security scanning, and proper secret handling.

### What's Inside

* **Minimal Django app** (Employee Directory) containerized with Gunicorn
* **Staging environment**: Single container behind Nginx
* **Production environment**: Blue-green deployment with zero-downtime swaps
* **Automated testing**: Playwright UI tests, k6 load tests, OWASP ZAP security baseline
* **Infrastructure as Code**: Ansible playbooks for repeatable deployments

### Pipeline Flow

```
lint → unit tests → build & push image → deploy staging → 
acceptance tests (UI/load/security) → deploy prod (blue-green) → smoke tests
```

---

## Quick Start (15 minutes)

### Prerequisites

* GitHub repository (fork or clone this one)
* Two Ubuntu 22.04 VMs with ports **22** and **80** open:
  - One for staging
  - One for production
* SSH client with `ssh-keygen` available

> **Note**: To run CI without real servers, comment out the deploy jobs in `.github/workflows/cicd.yml`

---

## Setup Instructions

### 1. SSH Key Setup

Generate an SSH key for CI/CD automation:

```bash
ssh-keygen -t ed25519 -C "cicd-ansible" -f ~/.ssh/cicd-ansible
```

Copy the public key to both VMs (replace with your actual IPs):

```bash
ssh-copy-id -i ~/.ssh/cicd-ansible.pub ubuntu@STAGING_IP
ssh-copy-id -i ~/.ssh/cicd-ansible.pub ubuntu@PROD_IP
```

### 2. Configure Inventory

Edit `ansible/inventory.ini`:

```ini
[staging]
staging1 ansible_host=STAGING_IP ansible_user=ubuntu ansible_ssh_private_key_file=~/.ssh/cicd-ansible

[prod]
prod1 ansible_host=PROD_IP ansible_user=ubuntu ansible_ssh_private_key_file=~/.ssh/cicd-ansible
```

Configure group variables:

**`ansible/group_vars/staging.yml`**:
```yaml
app_port: 8000
domain_name: STAGING_IP
color: blue
```

**`ansible/group_vars/prod.yml`**:
```yaml
app_port_blue: 8001
app_port_green: 8002
active_symlink: /etc/nginx/conf.d/app-active.conf
domain_name: PROD_IP
```

### 3. GitHub Secrets

Navigate to **Settings → Secrets and variables → Actions → New repository secret**:

* `SSH_PRIVATE_KEY`: Paste the private key contents from `~/.ssh/cicd-ansible`
* `DJANGO_SECRET_KEY` (optional): Only if using a real secret manager

Create a production environment:
**Settings → Environments → New environment** → name it: `production env`

### 4. Trigger the Pipeline

Commit and push to trigger the workflow:

```bash
git commit --allow-empty -m "trigger CI/CD"
git push origin main
```

Navigate to the **Actions** tab to watch the pipeline execute. The ZAP security report will be available as an artifact in the run summary.

---

## Repository Structure

```
.
├── .github/
│   └── workflows/
│       └── cicd.yml                 # Main CI/CD pipeline
├── ansible/
│   ├── inventory.ini                # Server inventory
│   ├── group_vars/                  # Environment-specific vars
│   ├── staging_pull.yml             # Staging deployment playbook
│   ├── prod-bluegreen-pull.yml      # Blue-green deployment playbook
│   └── roles/
│       └── nginx/
│           └── templates/
│               ├── app-blue.conf.j2
│               └── app-green.conf.j2
├── app/
│   └── employee_directory/          # Django application
├── tests/
│   ├── ui/
│   │   └── playwright.spec.ts       # UI acceptance tests
│   └── load/
│       └── k6.js                    # Load/smoke tests
└── Dockerfile
```

---

## Pipeline Stages Explained

### Build & Test
* **Linting**: flake8 for code quality
* **Security**: Bandit for security vulnerabilities
* **Unit tests**: pytest (non-blocking if no tests exist)

### Container Build
* Builds multi-stage Docker image with Gunicorn
* Pushes to GHCR: `ghcr.io/<owner>/<repo>/employee-dir:<run_number>`
* Uses `linux/amd64` platform for consistency

### Staging Deployment
* Ansible pulls the image from GHCR
* Runs container on `127.0.0.1:8000` behind Nginx
* Performs health checks before declaring success

### Acceptance Testing
* **Playwright**: Verifies UI renders correctly ("Employee Directory" header)
* **k6**: Smoke load test ensuring HTTP 200 responses
* **OWASP ZAP**: Baseline security scan (generates HTML report artifact)

### Production Deployment (Blue-Green)
1. Determines currently inactive color (blue/green)
2. Starts new container on inactive port
3. Performs health checks on new container
4. Updates Nginx symlink to point to new upstream
5. Reloads Nginx configuration
6. Stops old container
7. **Result**: Zero-downtime deployment

### Post-Deploy Verification
* Curls production endpoint
* Verifies response contains expected content

---

## Key Features & Lessons Learned

### 1. Platform Consistency
Fixed `arm64` vs `amd64` mismatches by standardizing on `linux/amd64` in Docker builds.

### 2. Health Checks
Nginx can return 502 if the upstream isn't ready. Solution: Health checks test the container port directly before routing traffic.

### 3. Proper Image Distribution
Moved from `docker save/load` to pulling from GHCR using `community.docker.docker_image` module for reliability.

### 4. Nginx Configuration Management
Blue-green configs live in `sites-available/`. Only the active config is symlinked to `/etc/nginx/conf.d/app-active.conf` to prevent duplicate upstream errors.

### 5. SSH Troubleshooting
* Write clean `~/.ssh/config` in workflow
* Remove problematic `ansible_ssh_common_args` from inventory
* Include SSH sanity check step in pipeline

### 6. Secret Hygiene
* No secrets committed to repository
* Django SECRET_KEY managed via environment variable
* Placeholder values in code: `"<populated by secret manager>"`

### 7. Playwright in CI
```bash
npm i -D @playwright/test
npx playwright install chromium
sudo npx playwright install-deps chromium
```

### 8. Disk Space Management
Added housekeeping step: `docker system prune -af` to prevent "no space left on device" errors.

### 9. Fork Stability
Use `--forks 1` in Ansible to serialize operations and avoid worker issues in CI environments.

### 10. Dockerized k6
Avoids local installation issues by running k6 in a container for consistent test execution.

---

## Troubleshooting

### "Host key verification failed"
Ensure the workflow writes SSH config properly and that `SSH_PRIVATE_KEY` secret is set correctly.

### "No space left on device"
The pipeline includes a cleanup step, but you may need to manually prune Docker on the target servers:
```bash
docker system prune -af --volumes
```

### Container keeps restarting
Check health check configuration and ensure the app is binding to the correct interface (`0.0.0.0`).

### 502 Bad Gateway
Usually means the container isn't ready. Verify health checks are passing before Nginx routes traffic.

### Ansible "no argument after keyword -o"
Remove `ansible_ssh_common_args` from inventory if it contains empty `-o` flags.

### Playwright installation fails
Ensure all three commands run in sequence:
1. Install Playwright npm package
2. Install browser binaries
3. Install system dependencies

---

## Clean-Up

To avoid cloud charges, stop or terminate your VMs when done. The repository and Actions run history remain as proof of the working pipeline.

---

## Extending This Pipeline

Consider adding:
* **TLS/SSL**: Let's Encrypt with Certbot
* **Database migrations**: Django migrate step in deployment
* **Canary deployments**: Gradual traffic shifting
* **GitOps**: ArgoCD or Flux integration
* **Monitoring**: Prometheus/Grafana stack
* **Rollback automation**: Automatic revert on health check failures

---

## Why This Matters

Most CI/CD tutorials end at "hello world." This project tackles the real problems that slow teams down:
* SSH quirks
* Image platform mismatches
* Nginx upstream management
* Health check gating
* Test orchestration
* Secret handling

These patterns are battle-tested and directly applicable to production systems.

---

## License

MIT

---

## Contributing

Issues and pull requests welcome. This project is designed to be a learning resource, so documentation improvements are especially appreciated.
