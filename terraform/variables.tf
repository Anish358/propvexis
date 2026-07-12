# All environment-specific / sensitive values are injected via terraform.tfvars
# (gitignored) so the committed .tf files stay generic and safe to publish.

variable "region" {
  description = "Primary AWS region for the app + backups."
  type        = string
  default     = "ap-south-1"
}

variable "domain" {
  description = "Public FQDN the app is served on (used for the uptime health check)."
  type        = string
}

variable "admin_cidr" {
  description = "CIDR allowed to SSH (port 22). Your admin IP, e.g. 1.2.3.4/32."
  type        = string
}

variable "ssh_key_name" {
  description = "Name of the existing EC2 key pair for SSH."
  type        = string
}

variable "instance_type" {
  description = "EC2 instance size."
  type        = string
  default     = "t3.small"
}

variable "root_volume_gb" {
  description = "Root EBS volume size (GiB)."
  type        = number
  default     = 20
}

variable "backup_bucket_name" {
  description = "Globally-unique S3 bucket name for DB backups."
  type        = string
}

variable "backup_retention_days" {
  description = "Days before S3 backup objects expire."
  type        = number
  default     = 90
}

variable "alert_email" {
  description = "Email address subscribed to uptime alerts (must confirm via SNS)."
  type        = string
}

variable "tags" {
  description = "Tags applied to all resources."
  type        = map(string)
  default = {
    Project   = "amey-journal"
    ManagedBy = "terraform"
  }
}
