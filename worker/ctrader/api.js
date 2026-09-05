// The worker's only door back into PropVexis.
//
// HTTP, not a database handle. The worker holds a bearer token and talks to the
// same lease/report endpoints the Windows MT5 agent uses, which is what makes
// moving it to its own box later a base-URL change rather than a rewrite -- and
// what keeps a process that reconnects to a broker socket all day from also
// holding a pg pool against the box's only database.

const json = async (res) => {
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text.slice(0, 500) }; }
  if (!res.ok) {
    const err = new Error(`${res.status} ${body?.error ?? res.statusText}`);
    err.status = res.status;
    throw err;
  }
  return body;
};

export class PropVexisApi {
  constructor({ baseUrl, workerToken, workerId, fetchImpl = fetch }) {
    this.baseUrl = String(baseUrl).replace(/\/+$/, '');
    this.workerToken = workerToken;
    this.workerId = workerId;
    this.fetch = fetchImpl;
  }

  req(path, { method = 'GET', body, token } = {}) {
    return this.fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token ?? this.workerToken}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }).then(json);
  }

  lease(limit = 3) {
    return this.req('/api/sync/lease', {
      method: 'POST',
      body: { worker_id: this.workerId, limit, platforms: ['ctrader'], version: 'ctrader-1' },
    });
  }

  report(jobId, payload) {
    return this.req(`/api/sync/jobs/${jobId}/result`, {
      method: 'POST',
      body: { worker_id: this.workerId, ...payload },
    });
  }

  heartbeat(note) {
    return this.req('/api/sync/heartbeat', {
      method: 'POST',
      body: { worker_id: this.workerId, version: 'ctrader-1', note },
    });
  }

  pendingDiscovery() {
    return this.req('/api/ctrader/discovery/pending');
  }

  storeDiscovered(identityId, ctidUserId, accounts) {
    return this.req(`/api/ctrader/discovery/${identityId}`, {
      method: 'POST',
      body: { ctid_user_id: ctidUserId, accounts },
    });
  }

  /**
   * Post trades through the SAME ingest seam the EA and the MT5 farm use, with
   * the account's own ingest token. Dedup, derivation, alerting, stats
   * invalidation and the socket broadcast all stay in one place for all three
   * sources rather than being reimplemented per connector.
   */
  ingest(ingestToken, trades) {
    return this.fetch(`${this.baseUrl}/api/trades/ingest/batch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-ingest-token': ingestToken },
      body: JSON.stringify({ trades }),
    }).then(json);
  }
}
