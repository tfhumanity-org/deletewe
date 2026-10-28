import type { D1Database, Fetcher, Queue, R2Bucket } from '@deletewe/adapters-cf';
import type { JobMessage } from '@deletewe/engine';

export interface WorkerEnv {
  readonly DB: D1Database;
  readonly EVIDENCE: R2Bucket;
  readonly JOBS: Queue<JobMessage>;
  readonly BROWSER?: Fetcher;

  /** 64 hex characters each. Set with `wrangler secret put`. */
  readonly MASTER_KEY: string;
  readonly INDEX_KEY: string;
  readonly KEY_VERSION?: string;

  readonly BASE_URL: string;
  readonly INBOUND_LOCAL?: string;
  readonly INBOUND_DOMAIN: string;
  readonly AGENT_FROM?: string;
  readonly MAIL_ENDPOINT?: string;
  readonly MAIL_API_KEY?: string;
  readonly LOG_LEVEL?: string;

  /** Disclosed in a member's DROP account under § 7621(b). Optional. */
  readonly DROP_AGENT_NAME?: string;
  readonly DROP_AGENT_EMAIL?: string;
  readonly DROP_AGENT_TRADE_NAME?: string;
}
