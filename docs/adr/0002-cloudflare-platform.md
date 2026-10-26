# 0002 — Cloudflare as the hosted platform

**Status:** Accepted · **Date:** 2026-10-27

## Context

The brief defaults to TypeScript on Cloudflare: Workers, D1, R2, Queues/
Workflows, Browser Rendering. The workload has an unusual profile
([research/04](../research/04-architecture-inference.md) §4.4): tiny
throughput, long waits measured in days to months, bursts of headless browser
work, and a hard requirement for durability across deploys.

## Decision

Accept the default. Hosted deployment is Cloudflare Workers with:

| Need | Service |
| --- | --- |
| HTTP API + SSR UI | Workers |
| Relational data | D1 |
| Evidence blobs | R2 |
| Job dispatch | Queues |
| Scheduled sweeps | Cron Triggers |
| Form automation | Browser Rendering |
| Inbound verification mail | Email Routing → Worker |
| Secrets | Worker secret bindings |

## Rationale

- **The workload is latency-tolerant and tiny.** 1M scans per quarter is ~130/
  hour. Paying for idle compute would be the dominant cost of a container
  deployment; Workers' model fits better than the alternative.
- **Browser Rendering removes the worst operational burden.** Running and
  patching a Playwright fleet is the single largest ops cost of a scraping-
  adjacent product, and a DevOps hire's worth of work
  ([research/04](../research/04-architecture-inference.md) notes the incumbent
  staffs exactly that role).
- **Email Routing into a Worker** is a direct fit for per-job inbound
  verification addressing, which [research/03](../research/03-removal-mechanics.md)
  identifies as the step most likely to be underbuilt and the likeliest cause of
  services underperforming a diligent human.
- **R2 has no egress fee**, which matters for an evidence-heavy product where
  members export everything they own.
- One language, one toolchain, one deploy.

## Consequences

**Costs and how they are handled**
- *Vendor concentration.* Mitigated structurally by ADR-0001: the engine cannot
  import a Cloudflare package, so the lock-in is confined to one adapter
  package and two entrypoints.
- *D1 size and query limits.* Acceptable: data is member-scoped and small.
  Evidence lives in R2, not the database.
- *Workers CPU limits.* The matcher is pure and fast; PDF rendering and
  browser work happen in dedicated jobs, not in the request path.
- *Workflows' durable sleep is attractive but unavailable in self-host.* We
  therefore do not use it for long waits (ADR-0001). We keep the option for
  short-lived multi-step orchestration only.

## Alternatives rejected

- **AWS Lambda + SQS + S3 + RDS.** More primitives, more IAM, more idle cost,
  and still needs a browser fleet.
- **A single long-running Node server.** This *is* the self-host mode. As the
  hosted mode it would mean running and scaling browsers ourselves.
- **Temporal/Inngest for orchestration.** Genuinely good for durable long waits,
  but adds a vendor the self-hoster must also run. The scheduler-table approach
  costs a day of work and runs anywhere.
