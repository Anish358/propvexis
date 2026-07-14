# ---------------------------------------------------------------------------
# App secrets in SSM Parameter Store: least-privilege read access for the box.
# The backend fetches its secrets (SecureString/KMS) at boot via the instance
# role — no static AWS keys, no secret values on disk. This grants that read;
# the parameter *values* are created out-of-band (see terraform/README.md) so
# secrets never land in Terraform state.
#
# Attached to the SAME instance role the backup uploads use (aws_iam_role.backup
# in backups.tf), which is the instance profile on aws_instance.app.
# ---------------------------------------------------------------------------
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

variable "ssm_path_prefix" {
  description = "SSM Parameter Store path the app reads secrets from (matches the box's SSM_PREFIX)."
  type        = string
  default     = "/amey-journal/prod/"
}

locals {
  # ARN uses the parameter name without the leading slash, plus a wildcard for
  # everything under the prefix: parameter/amey-journal/prod/*
  ssm_param_arn = "arn:aws:ssm:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:parameter/${trim(var.ssm_path_prefix, "/")}/*"
}

resource "aws_iam_policy" "ssm_read" {
  name        = "amey-journal-ssm-read"
  description = "Read (decrypt) app secrets under ${var.ssm_path_prefix}"
  tags        = var.tags

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "ReadAppParameters"
        Effect   = "Allow"
        Action   = ["ssm:GetParametersByPath", "ssm:GetParameters", "ssm:GetParameter"]
        Resource = local.ssm_param_arn
      },
      {
        # Decrypt SecureString values. Scoped to the AWS-managed SSM key by the
        # ViaService condition, so this can't decrypt anything outside SSM.
        Sid      = "DecryptSsmSecureStrings"
        Effect   = "Allow"
        Action   = ["kms:Decrypt"]
        Resource = "*"
        Condition = {
          StringEquals = {
            "kms:ViaService" = "ssm.${data.aws_region.current.name}.amazonaws.com"
          }
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "ssm_read" {
  role       = aws_iam_role.backup.name
  policy_arn = aws_iam_policy.ssm_read.arn
}
