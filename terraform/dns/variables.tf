# Defaults below are the LIVE values captured from the current GoDaddy zone
# (via dig, 2026-07-25). They are not secret. Override in terraform.tfvars only
# if something changes at the source.

variable "region" {
  description = "AWS region for the provider (Route 53 itself is global)."
  type        = string
  default     = "ap-south-1"
}

variable "domain" {
  description = "Apex domain to host in Route 53."
  type        = string
  default     = "propvexis.com"
}

variable "app_ip" {
  description = "Elastic IP of the EC2 app host (all app* A records point here)."
  type        = string
  default     = "13.205.66.72"
}

variable "app_extra_hosts" {
  description = "Extra subdomains that also resolve to the app EIP (staging + dev share the box)."
  type        = list(string)
  default     = ["app-dev", "app-staging"]
}

# ---- Email DKIM (GoDaddy secureserver). Carry or outbound signing breaks. ----
variable "dkim_cnames" {
  description = "DKIM CNAMEs: record name (under domain) => target host."
  type        = map(string)
  default = {
    "secureserver1._domainkey" = "s1.dkim.propvexis_com.c4d.onsecureserver.net"
    "secureserver2._domainkey" = "s2.dkim.propvexis_com.c4d.onsecureserver.net"
  }
}

variable "autodiscover_srv" {
  description = "Email autodiscover SRV target ('priority weight port host')."
  type        = string
  default     = "0 0 443 autodiscover.secureserver.net"
}

# ---- Email (GoDaddy / secureserver). Carry these EXACTLY or mail breaks. ----
variable "mx_records" {
  description = "MX records ('priority host'), highest-priority mail host first."
  type        = list(string)
  default = [
    "0 smtp.secureserver.net",
    "10 mailstore1.secureserver.net",
  ]
}

variable "spf_txt" {
  description = "SPF TXT record for the apex."
  type        = string
  default     = "v=spf1 include:secureserver.net -all"
}

variable "dmarc_txt" {
  description = "DMARC policy TXT record (_dmarc.<domain>)."
  type        = string
  default     = "v=DMARC1; p=quarantine; adkim=r; aspf=r; rua=mailto:dmarc_rua@onsecureserver.net;"
}

variable "email_cname" {
  description = "GoDaddy webmail autodiscover convenience record (email.<domain>)."
  type        = string
  default     = "email.secureserver.net"
}

variable "tags" {
  description = "Tags applied to taggable resources."
  type        = map(string)
  default = {
    Project   = "propvexis"
    Component = "dns"
    ManagedBy = "terraform"
  }
}
