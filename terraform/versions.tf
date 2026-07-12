terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Primary region (app + backups live in ap-south-1 / Mumbai).
provider "aws" {
  region = var.region
}

# Route53 health-check metrics are published only to us-east-1, so the uptime
# alarm + its SNS topic must live there. This aliased provider handles them.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}
