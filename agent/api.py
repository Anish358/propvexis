"""HTTP client for the PropVexis backend.

Two different credentials, deliberately kept apart:

  - the WORKER token authenticates this agent to /api/sync/* (lease, result,
    heartbeat). One token for the box.
  - each job's INGEST token authenticates the trades themselves, per account, to
    exactly the endpoints the EA posts to. The agent is not privileged to write
    trades; the account's own token is.

Nothing here ever logs a request body. The lease response contains a plaintext
investor password, and a debug log line is the easiest way to leak one.
"""

import logging

import requests

log = logging.getLogger('propvexis.api')

TIMEOUT = 30


class Backend:
    def __init__(self, base_url, worker_token, worker_id, version='1.0'):
        self.base = base_url.rstrip('/')
        self.worker_id = worker_id
        self.version = version
        self.s = requests.Session()
        self.s.headers['User-Agent'] = f'propvexis-sync-agent/{version}'
        self._worker_headers = {'Authorization': f'Bearer {worker_token}'}

    # --- worker plane -------------------------------------------------------
    def lease(self, limit=1):
        r = self.s.post(
            f'{self.base}/api/sync/lease',
            json={'worker_id': self.worker_id, 'limit': limit, 'version': self.version},
            headers=self._worker_headers, timeout=TIMEOUT)
        r.raise_for_status()
        return r.json().get('jobs', [])

    def result(self, job_id, ok, stats=None, error=None, read_only=None):
        body = {'worker_id': self.worker_id, 'ok': bool(ok)}
        if stats is not None:
            body['stats'] = stats
        if error is not None:
            body['error'] = str(error)[:1000]
        if read_only is not None:
            body['read_only'] = bool(read_only)
        r = self.s.post(f'{self.base}/api/sync/jobs/{job_id}/result', json=body,
                        headers=self._worker_headers, timeout=TIMEOUT)
        # A 409 means the lease expired while we worked — real, and worth seeing,
        # but not a crash: the job goes back in the queue on its own.
        if r.status_code == 409:
            log.warning('job %s no longer leased by us', job_id)
            return None
        r.raise_for_status()
        return r.json()

    def heartbeat(self):
        r = self.s.post(f'{self.base}/api/sync/heartbeat',
                        json={'worker_id': self.worker_id, 'version': self.version},
                        headers=self._worker_headers, timeout=TIMEOUT)
        r.raise_for_status()
        return r.json()

    # --- ingest plane (per account) -----------------------------------------
    def _ingest(self, path, token, body):
        r = self.s.post(f'{self.base}{path}', json=body,
                        headers={'X-Ingest-Token': token}, timeout=TIMEOUT)
        if r.status_code in (200, 201):
            return r.json() if r.content else {}
        # 402 = the account's plan no longer includes sync. Not retryable, and the
        # message is the one the user needs to see.
        raise RuntimeError(f'{path} returned {r.status_code}: {r.text[:200]}')

    def post_trade(self, token, body):
        return self._ingest('/api/trades/ingest', token, body)

    def post_payout(self, token, body):
        return self._ingest('/api/payouts/ingest', token, body)

    def post_equity(self, token, body):
        return self._ingest('/api/equity/ingest', token, body)
