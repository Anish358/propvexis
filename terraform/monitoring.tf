# ---------------------------------------------------------------------------
# Uptime monitoring: Route53 health check on https://<domain>/health →
# CloudWatch alarm → SNS email. All in us-east-1 (where Route53 health-check
# metrics are published).
# ---------------------------------------------------------------------------
resource "aws_route53_health_check" "app" {
  fqdn              = var.domain
  type              = "HTTPS"
  port              = 443
  resource_path     = "/health"
  request_interval  = 30
  failure_threshold = 3
  tags              = merge(var.tags, { Name = "amey-journal-health" })
}

resource "aws_sns_topic" "uptime" {
  provider = aws.us_east_1
  name     = "amey-journal-uptime"
  tags     = var.tags
}

resource "aws_sns_topic_subscription" "uptime_email" {
  provider  = aws.us_east_1
  topic_arn = aws_sns_topic.uptime.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

resource "aws_cloudwatch_metric_alarm" "app_down" {
  provider            = aws.us_east_1
  alarm_name          = "amey-journal-down"
  alarm_description   = "journal /health check failing"
  namespace           = "AWS/Route53"
  metric_name         = "HealthCheckStatus"
  dimensions          = { HealthCheckId = aws_route53_health_check.app.id }
  statistic           = "Minimum"
  period              = 60
  evaluation_periods  = 3
  threshold           = 1
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_sns_topic.uptime.arn]
  ok_actions          = [aws_sns_topic.uptime.arn]
  tags                = var.tags
}
