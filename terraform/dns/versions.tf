# Standalone root module — manages ONLY the Route 53 hosted zone for propvexis.com.
# Run terraform from THIS directory (terraform/dns), not the parent terraform/.
# Kept isolated (own local state) so `apply` here can never touch the app/EC2
# resources described in the parent module.
terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Route 53 is a global service, but the provider still needs a region.
provider "aws" {
  region = var.region
}
