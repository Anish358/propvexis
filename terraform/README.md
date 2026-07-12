# Infrastructure as Code (Terraform)

Codifies the AWS infrastructure for PATIL TRADES — the app host, networking,
off-box backups, and uptime monitoring — so the environment is reproducible and
reviewable instead of hand-clicked.

## What it manages
| File | Resources |
|---|---|
| `main.tf` | Default VPC lookup, security group (`22←admin`, `80/443←world`), EC2 host (Ubuntu 24.04, gp3, encrypted), Elastic IP |
| `backups.tf` | Private S3 bucket (public access blocked, 90-day lifecycle) + least-privilege IAM role/policy/instance-profile for nightly `pg_dump` uploads |
| `monitoring.tf` | Route53 health check on `/health` → CloudWatch alarm → SNS email (us-east-1) |
| `versions.tf` | Provider pins + the `us-east-1` aliased provider Route53 metrics require |

Real values (IP, bucket, email) live in `terraform.tfvars` (**gitignored**) — the
committed `.tf` files are generic and safe to publish.

## Usage
```bash
cp terraform.tfvars.example terraform.tfvars   # fill in real values
terraform init
terraform fmt -check
terraform validate
terraform plan                                 # read-only preview
```

## ⚠️ Adopting this against LIVE production — read first
The production box was built by hand, so this config is not yet the source of
truth for it. **Do not `terraform apply` against prod before a `plan` is clean** —
a mismatch can propose *replacing* the live EC2 instance (which would destroy it).

Two safe adoption paths:

1. **Import the existing resources**, then iterate the config until
   `terraform plan` reports **no changes**, before ever applying:
   ```bash
   terraform import aws_instance.app <instance-id>
   terraform import aws_eip.app <eip-alloc-id>
   terraform import aws_s3_bucket.backups <bucket-name>
   terraform import aws_iam_role.backup amey-journal-backup-role
   # ...etc for each resource, then: terraform plan  (expect: no changes)
   ```
2. **Provision a fresh staging environment** from this module (greenfield =
   `apply` is safe), validate the full lifecycle there, then adopt for prod.

Until then this serves as authoritative documentation of the infrastructure.
