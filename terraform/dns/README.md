# terraform/dns — Route 53 zone for propvexis.com

Standalone root module. Manages **only** the Route 53 hosted zone + the records
that must survive the move off GoDaddy DNS. Isolated from the parent
`terraform/` module (own local state) so `apply` here can't touch the app/EC2.

## What it creates

| Record | Purpose |
|--------|---------|
| Hosted zone `propvexis.com` | The zone itself |
| `app` A → `13.205.66.72` | EC2 app host (unchanged behaviour) |
| `@` MX (secureserver) | Email delivery |
| `@` TXT (SPF) | Email deliverability |
| `_dmarc` TXT | DMARC policy |
| `email` CNAME | GoDaddy webmail autodiscover |

**Not** created here: apex (`propvexis.com`) + `www` — Amplify creates those
(and the ACM validation records) automatically when you attach the custom
domain, because the zone is in the same AWS account.

## Cutover (delegate DNS — NOT a registrar transfer)

1. `terraform init && terraform apply` (from this dir).
2. Copy the 4 `name_servers` from the output.
3. **Before switching**, eyeball the GoDaddy DNS list for any record not in the
   table above — especially a **DKIM** CNAME (`*_domainkey*`). If present, add it
   here and re-apply; otherwise email signing breaks.
4. GoDaddy → domain → **Nameservers** → replace GoDaddy's with the 4 Route 53 NS.
5. Verify BEFORE and AFTER propagation:
   ```bash
   NS=$(terraform output -raw name_servers | head -1)     # or any of the 4
   dig @$NS app.propvexis.com A +short      # -> 13.205.66.72
   dig @$NS propvexis.com MX +short         # -> secureserver hosts
   ```
   Send yourself a test email once NS have propagated (can take up to ~24–48h,
   usually far less).

## Then: landing page

Once delegation is live, create the Amplify app and attach `propvexis.com` +
`www` — Amplify writes the apex/www ALIAS + ACM records into this zone for you.
