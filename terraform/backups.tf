# ---------------------------------------------------------------------------
# Off-box DB backups: private S3 bucket + least-privilege IAM instance role.
# The box's nightly pg_dump uploads via this role (no static keys on the host).
# ---------------------------------------------------------------------------
resource "aws_s3_bucket" "backups" {
  bucket = var.backup_bucket_name
  tags   = var.tags
}

resource "aws_s3_bucket_public_access_block" "backups" {
  bucket                  = aws_s3_bucket.backups.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "backups" {
  bucket = aws_s3_bucket.backups.id

  rule {
    id     = "expire-old-dumps"
    status = "Enabled"
    filter {}
    expiration {
      days = var.backup_retention_days
    }
  }
}

# Least-privilege: PutObject to this one bucket only.
resource "aws_iam_policy" "backup_s3_write" {
  name        = "amey-journal-backup-s3-write"
  description = "Write DB dumps to the backup bucket only"
  tags        = var.tags

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["s3:PutObject", "s3:AbortMultipartUpload"]
      Resource = "${aws_s3_bucket.backups.arn}/*"
    }]
  })
}

resource "aws_iam_role" "backup" {
  name = "amey-journal-backup-role"
  tags = var.tags

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "backup" {
  role       = aws_iam_role.backup.name
  policy_arn = aws_iam_policy.backup_s3_write.arn
}

resource "aws_iam_instance_profile" "backup" {
  name = "amey-journal-backup-profile"
  role = aws_iam_role.backup.name
  tags = var.tags
}
