# Employee Directory

A production-ready Django application demonstrating enterprise-grade CI/CD practices with automated testing, blue-green deployments, and zero-downtime releases.

## Overview

This project implements a complete continuous integration and delivery pipeline for a Django-based employee directory application. The infrastructure features automated builds, comprehensive testing suites, and sophisticated deployment strategies across staging and production environments.

### Key Features

- **Automated CI/CD Pipeline**: GitHub Actions orchestrates the entire build, test, and deployment lifecycle
- **Blue-Green Deployment**: Zero-downtime production releases with instant rollback capability
- **Multi-Stage Testing**: UI automation (Playwright), load testing (k6), and security scanning (OWASP ZAP)
- **Containerized Architecture**: Docker-based deployments with multi-architecture support
- **Infrastructure as Code**: Ansible playbooks manage server configuration and deployments
- **Reverse Proxy Configuration**: Nginx handles traffic routing and load distribution

## Architecture

### System Components

```
┌─────────────┐
│   GitHub    │
│  Repository │
└──────┬──────┘
       │
       ├─────────────► GitHub Actions (CI/CD)
       │                      │
       │                      ├─► Build & Test
       │                      ├─► Push to GHCR
       │                      ├─► Deploy Staging
       │                      ├─► Run Test Suites
       │                      └─► Deploy Production
       │
       ▼
┌─────────────────────────────────────┐
│  GitHub Container Registry (GHCR)   │
└─────────────────┬───────────────────┘
                  │
         ┌────────┴────────┐
         ▼                 ▼
┌──────────────┐   ┌──────────────┐
│   Staging    │   │  Production  │
│   Server     │   │   Server     │
│              │   │              │
│  Nginx :80   │   │  Nginx :80   │
│     │        │   │     │        │
│     ├─► :8000   │   │     ├─► :8001 (Blue)
│                │   │     └─► :8002 (Green)
└──────────────┘   └──────────────┘
```

### Deployment Strategy

**Staging Environment**
- Single container deployment on port 8000
- Nginx reverse proxy on port 80
- Automatic deployment on successful builds

**Production Environment**
- Dual container setup (Blue/Green)
- Active container receives traffic via Nginx symlink
- New deployments target inactive container
- Traffic cutover after health checks pass
- Instant rollback by toggling active symlink

## Repository Structure

```
CI-CD/
├── app/                          # Django application source
├── docker/
│   └── Dockerfile               # Container image definition
├── ansible/
│   ├── inventory.ini            # Server inventory
│   ├── group_vars/
│   │   ├── staging.yml         # Staging configuration
│   │   └── prod.yml            # Production configuration
│   ├── staging_pull.yml        # Staging deployment playbook
│   ├── prod-bluegreen-pull.yml # Blue-green deployment playbook
│   └── roles/nginx/templates/
│       ├── app-blue.conf.j2    # Blue environment Nginx config
│       └── app-green.conf.j2   # Green environment Nginx config
├── tests/
│   ├── ui/playwright.spec.js   # UI automation tests
│   └── load/k6.js              # Load testing scenarios
├── .github/workflows/
│   └── cicd.yml                # CI/CD pipeline definition
├── requirements.txt             # Python dependencies
├── playwright.config.ts         # Playwright configuration
└── zap.conf                     # OWASP ZAP security scan config
```

## Pipeline Workflow

The CI/CD pipeline executes automatically on push or pull request to the `main` branch.

### Stage 1: Build & Test
- Installs Python dependencies
- Runs code quality checks (flake8)
- Executes static security analysis (bandit)
- Builds multi-architecture Docker image
- Pushes tagged image to GitHub Container Registry

### Stage 2: Staging Deployment
- Connects to staging server via SSH
- Executes Ansible playbook to pull and deploy image
- Configures Nginx reverse proxy
- Verifies container health

### Stage 3: Automated Testing
- **UI Tests**: Playwright validates critical user paths
- **Load Tests**: k6 simulates concurrent user traffic
- **Security Scan**: OWASP ZAP performs passive vulnerability assessment

### Stage 4: Production Deployment
- Identifies inactive environment (Blue or Green)
- Deploys new version to inactive environment
- Executes health checks on new deployment
- Updates Nginx configuration to route traffic to new version
- Generates deployment artifacts for audit trail

### Stage 5: Verification
- Smoke tests validate production accessibility
- Deployment status logged for monitoring

## Prerequisites

### Local Development
- Python 3.9+
- Docker and Docker Compose
- Node.js 16+ (for Playwright tests)

### Infrastructure
- Two Linux servers (Ubuntu 20.04+ recommended)
- SSH access with sudo privileges
- Docker and Nginx installed on target servers

### GitHub Configuration
- GitHub Container Registry enabled
- Repository secrets configured:
  - `SSH_PRIVATE_KEY`: Private key for server access
  - Additional secrets as needed for your environment

## Setup Instructions

### 1. Server Preparation

Generate SSH key pair for CI/CD automation:
```bash
ssh-keygen -t ed25519 -f ~/.ssh/cicd-ansible -C "cicd-deployment"
```

Add public key to target servers:
```bash
cat ~/.ssh/cicd-ansible.pub | ssh -i <your-key> ubuntu@<server-ip> \
  'mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys'
```

### 2. GitHub Secrets Configuration

Navigate to repository Settings → Secrets and variables → Actions:
- Add `SSH_PRIVATE_KEY`: Contents of `~/.ssh/cicd-ansible` private key

### 3. Ansible Inventory Configuration

Update `ansible/inventory.ini` with your server IPs:
```ini
[staging]
staging-server ansible_host=<STAGING_IP> ansible_user=ubuntu

[prod]
prod-server ansible_host=<PROD_IP> ansible_user=ubuntu
```

### 4. Pipeline Activation

Push to `main` branch to trigger the pipeline:
```bash
git add .
git commit -m "Initial deployment"
git push origin main
```

## Operational Procedures

### Monitoring Deployments

**Check Staging Status**
```bash
curl -fsS http://<STAGING_IP>/ | grep "Employee Directory"
ssh ubuntu@<STAGING_IP> 'docker ps'
```

**Check Production Status**
```bash
curl -fsS http://<PROD_IP>/ | grep "Employee Directory"
ssh ubuntu@<PROD_IP> 'readlink -f /etc/nginx/conf.d/app-active.conf'
ssh ubuntu@<PROD_IP> 'docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"'
```

### Rollback Procedure

**Option 1: Re-run Deployment (Automatic Toggle)**
```bash
# Trigger the production deployment playbook again
# It will automatically switch to the previous environment
ansible-playbook ansible/prod-bluegreen-pull.yml -i ansible/inventory.ini
```

**Option 2: Manual Nginx Reconfiguration**
```bash
ssh ubuntu@<PROD_IP>
sudo ln -sf /etc/nginx/sites-available/app-blue.conf /etc/nginx/conf.d/app-active.conf
sudo nginx -t && sudo systemctl reload nginx
```

### Manual Deployment

Trigger deployment of specific image tag:
```bash
ansible-playbook ansible/prod-bluegreen-pull.yml \
  -i ansible/inventory.ini \
  -e "image=ghcr.io/<org>/employee-directory" \
  -e "tag=123"
```

## Testing

### Run Tests Locally

**Unit Tests**
```bash
pip install -r requirements.txt
pytest
```

**UI Tests**
```bash
npm install -D @playwright/test
npx playwright install --with-deps
npx playwright test tests/ui/playwright.spec.js
```

**Load Tests**
```bash
k6 run tests/load/k6.js
```

**Security Scan**
```bash
docker run -t ghcr.io/zaproxy/zaproxy:stable zap-baseline.py \
  -t http://<target-url> -c zap.conf
```

## Troubleshooting

### Common Issues

**Connection Refused on Container Port**
- Verify Docker platform matches host architecture (`linux/amd64`)
- Check container logs: `docker logs <container-name>`

**Nginx Configuration Errors**
- Validate configuration: `sudo nginx -t`
- Check for duplicate upstream definitions
- Verify symlink target: `readlink -f /etc/nginx/conf.d/app-active.conf`

**SSH Authentication Failures**
- Verify private key format (no extra spaces/newlines)
- Ensure public key is in `authorized_keys`
- Check file permissions: private key should be `600`

**Pipeline Failures**
- Review GitHub Actions logs for detailed error messages
- Verify all required secrets are configured
- Check Ansible playbook syntax: `ansible-playbook --syntax-check <playbook.yml>`

## Security Considerations

- Secrets are stored in GitHub encrypted secrets, never in code
- SSH keys use modern ED25519 algorithm
- OWASP ZAP performs automated security scanning on each deployment
- Static security analysis (bandit) runs on every commit
- All network communication happens over encrypted channels

**Production Hardening Recommendations**
- Enable HTTPS with Let's Encrypt certificates
- Implement security headers (CSP, HSTS, X-Frame-Options)
- Move sensitive configuration to environment variables
- Enable Docker security scanning
- Implement rate limiting in Nginx

## Roadmap

### Immediate Enhancements
- [ ] HTTPS/TLS certificate automation
- [ ] Enhanced security headers configuration
- [ ] Environment variable management for secrets
- [ ] Uptime monitoring integration
- [ ] Manual deployment workflow with tag selection

### Future Improvements
- [ ] Database migration to PostgreSQL
- [ ] Centralized logging and metrics
- [ ] Feature flag management system
- [ ] Advanced secrets management (Vault/SOPS)
- [ ] Multi-region deployment support
- [ ] Automated backup and disaster recovery

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit changes: `git commit -am 'Add new feature'`
4. Push to branch: `git push origin feature/your-feature`
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For questions or issues:
- Open an issue on GitHub
- Review pipeline logs in GitHub Actions
- Check server logs: `docker logs <container-name>`

---

**Note**: This is a demonstration project showcasing CI/CD best practices. Adapt security configurations and deployment strategies to your organization's requirements before production use.