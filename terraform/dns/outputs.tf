output "zone_id" {
  description = "Hosted zone ID — used later for Amplify custom-domain association."
  value       = aws_route53_zone.primary.zone_id
}

output "name_servers" {
  description = "Set these 4 as the domain's nameservers at GoDaddy (replacing ns57/ns58.domaincontrol.com)."
  value       = aws_route53_zone.primary.name_servers
}
