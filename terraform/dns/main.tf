# ---------------------------------------------------------------------------
# Route 53 hosted zone for propvexis.com.
#
# Cutover model: DELEGATE DNS (not a registrar transfer). The domain stays
# registered at GoDaddy; we create this zone, pre-stage the records that must
# survive (app + email), then repoint GoDaddy's nameservers at this zone's NS.
# Because app + email records exist here BEFORE the nameserver flip, there is no
# downtime window for the app or mail.
#
# NOT managed here (on purpose):
#   - apex (propvexis.com) + www  → created automatically by AWS Amplify when
#     you associate the custom domain (the zone is in the same account), along
#     with the ACM cert-validation records. Leaving them out avoids a fight
#     between Terraform and Amplify's own DNS management.
# ---------------------------------------------------------------------------

resource "aws_route53_zone" "primary" {
  name    = var.domain
  comment = "PropVexis primary zone (delegated from GoDaddy). App=EC2, email=secureserver, landing=Amplify."
  tags    = var.tags
}

# App host (EC2 + Caddy). Pure DNS — no proxy — so Caddy's TLS, websockets, and
# the MT5 EA behave identically to the old GoDaddy record.
resource "aws_route53_record" "app" {
  zone_id = aws_route53_zone.primary.zone_id
  name    = "app.${var.domain}"
  type    = "A"
  ttl     = 300
  records = [var.app_ip]
}

# Staging + dev environments share the same box (see multi-environment setup).
resource "aws_route53_record" "app_extra" {
  for_each = toset(var.app_extra_hosts)
  zone_id  = aws_route53_zone.primary.zone_id
  name     = "${each.value}.${var.domain}"
  type     = "A"
  ttl      = 300
  records  = [var.app_ip]
}

# ----------------------------- Email records -------------------------------
resource "aws_route53_record" "mx" {
  zone_id = aws_route53_zone.primary.zone_id
  name    = var.domain
  type    = "MX"
  ttl     = 3600
  records = var.mx_records
}

resource "aws_route53_record" "spf" {
  zone_id = aws_route53_zone.primary.zone_id
  name    = var.domain
  type    = "TXT"
  ttl     = 3600
  records = [var.spf_txt]
}

resource "aws_route53_record" "dmarc" {
  zone_id = aws_route53_zone.primary.zone_id
  name    = "_dmarc.${var.domain}"
  type    = "TXT"
  ttl     = 3600
  records = [var.dmarc_txt]
}

resource "aws_route53_record" "email" {
  zone_id = aws_route53_zone.primary.zone_id
  name    = "email.${var.domain}"
  type    = "CNAME"
  ttl     = 3600
  records = [var.email_cname]
}

# DKIM signing for outbound mail (GoDaddy secureserver selectors).
resource "aws_route53_record" "dkim" {
  for_each = var.dkim_cnames
  zone_id  = aws_route53_zone.primary.zone_id
  name     = "${each.key}.${var.domain}"
  type     = "CNAME"
  ttl      = 3600
  records  = [each.value]
}

# Autodiscover SRV so mail clients self-configure.
resource "aws_route53_record" "autodiscover_srv" {
  zone_id = aws_route53_zone.primary.zone_id
  name    = "_autodiscover._tcp.${var.domain}"
  type    = "SRV"
  ttl     = 3600
  records = [var.autodiscover_srv]
}
