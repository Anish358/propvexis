// Secrets loader: hydrate process.env from AWS SSM Parameter Store at boot.
//
// Why: prod secrets used to live only in /opt/amey-journal/.env on the box. This
// pulls them from SSM (SecureString/KMS) at startup via the EC2 instance IAM role
// — no static AWS keys, no secret values on disk. Runs BEFORE config.js reads
// process.env (see src/server.js).
//
// Gated on SSM_PREFIX: unset (local/dev/test/CI, and any un-migrated box) => a
// pure no-op, so dotenv + the existing .env path behave exactly as before. Set
// (e.g. "/amey-journal/prod/") => fetch every parameter under that path and map
// each param's last path segment to an env var. The AWS SDK is imported lazily so
// nothing pulls it in on the no-op path.

// Map SSM parameters onto an env object, keyed by each param name's last path
// segment (/amey-journal/prod/SESSION_SECRET -> SESSION_SECRET). Set-if-absent:
// an env var already present (e.g. NODE_ENV/PORT from pm2, or an emergency
// override) wins over SSM. Pure + AWS-free so it's unit-testable. Returns the
// list of names applied. `params` is an array of { Name, Value }.
export function applyParams(params, env) {
  const applied = [];
  for (const { Name, Value } of params ?? []) {
    if (!Name) continue;
    const key = Name.split('/').pop(); // last path segment; '' for a trailing slash
    if (!key) continue;
    if (env[key] !== undefined) continue; // already set — don't clobber
    env[key] = Value ?? '';
    applied.push(key);
  }
  return applied;
}

// Fetch every parameter under `prefix`, following pagination. Decrypts
// SecureString values. Credentials + region resolve from the instance role /
// environment; region falls back to Mumbai where the box lives.
async function fetchAllUnderPath(prefix) {
  // Lazy import so the SDK is only loaded when SSM is actually in use.
  const { SSMClient, GetParametersByPathCommand } = await import('@aws-sdk/client-ssm');
  const client = new SSMClient({ region: process.env.AWS_REGION ?? 'ap-south-1' });

  const params = [];
  let NextToken;
  do {
    const res = await client.send(
      new GetParametersByPathCommand({
        Path: prefix,
        Recursive: true,
        WithDecryption: true,
        MaxResults: 10, // SSM's per-page max for GetParametersByPath
        NextToken,
      })
    );
    params.push(...(res.Parameters ?? []));
    NextToken = res.NextToken;
  } while (NextToken);

  return params;
}

// Hydrate process.env from SSM. No-op unless SSM_PREFIX is set. Fails closed: if
// SSM_PREFIX is set but the fetch errors or returns nothing, throw so the process
// exits rather than booting on shipped dev defaults. assertProdSecrets() in
// app.js then re-validates the hydrated values (defense in depth).
export async function hydrateSecrets() {
  const prefix = process.env.SSM_PREFIX;
  if (!prefix) return; // not migrated / local dev — dotenv handles it

  let params;
  try {
    params = await fetchAllUnderPath(prefix);
  } catch (err) {
    throw new Error(`failed to load secrets from SSM (${prefix}): ${err.message}`);
  }
  if (params.length === 0) {
    throw new Error(`no parameters found under SSM_PREFIX ${prefix} — refusing to boot`);
  }

  const applied = applyParams(params, process.env);
  // Log the count only — never values.
  console.log(`[secrets] loaded ${applied.length} parameter(s) from SSM ${prefix}`);
}
