output "public_ip" {
  description = "Elastic IP of the app host (point the DNS A record here)."
  value       = aws_eip.app.public_ip
}

output "instance_id" {
  value = aws_instance.app.id
}

output "backup_bucket" {
  value = aws_s3_bucket.backups.bucket
}

output "uptime_topic_arn" {
  value = aws_sns_topic.uptime.arn
}
