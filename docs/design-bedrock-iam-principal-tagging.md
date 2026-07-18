# Bedrock IAM Principal Tagging — Design (v13)

**Status:** DRAFT — open questions in §11 are **NOT yet locked**. Per rule 04, chhyu locks this document before any implementation code is written. Design converged 2026-07-14→17 across ~15 iterations (v10 → v12 → v13); this document is the v13 scoped-down design.

**Supersedes:** the v10 two-artifact design (member tagging script + payer watcher stack + create-new-role wizard). v10 is retained in session memory for rationale history only — do not build from it.

---

## 1. Why this feature

IAM principal tagging is now the **AWS-recommended** method for earning MAP 2.0 credit on Amazon Bedrock and Bedrock AgentCore spend (launched for MAP 2026-06-08): tag the IAM role or user that invokes Bedrock APIs with `map-migrated=mig<MPEID>` (`iam:TagRole` / `iam:TagUser`). No application change, no Application Inference Profile (AIP) needed.

This matters to the auto-tagger because the fastest-growing Bedrock spend — agentic coding tools (Claude Code, Cursor BYOK, Codex on Bedrock) and LLM-gateway architectures — **cannot use AIPs at all**: those tools only accept base model IDs, so principal tagging is the *only* tagging path for that spend. The current pipeline can't help either: it tags created *resources* from CloudTrail events, and a Bedrock `InvokeModel` call creates no taggable resource. Principal tagging is a different paradigm — tag the invoker, not a resource.

### Why the scope shrank from v10 to v13

- **Team debate (#auto-map-tagger-tf, 2026-07-14→16):** Jin argued the console is simpler for single-role/single-account and the tool risks overengineering. Jerri argued the tool retains value for multi-account and gateway/agentic-tool cases, but that v10's create-new-role wizard (trust-policy templates, model scoping) was its least customer-friendly part and a likely deployment blocker, and that IaC-drift re-tagging was a losing cycle to be cut outright.
- **Auto-activation confirmed (MAP ops, #map-tagging-qa 2026-07-15/16):** the MAP program backend activates the `iamPrincipal/map-migrated` cost allocation tag on behalf of real MAP customers. This deletes v10's entire second artifact (payer watcher EventBridge/Lambda/SNS stack) down to a one-line read-only verify check.
- **Field research (16-class issue taxonomy, 2026-07-17 Slack sweep):** almost no real thread is "help me run tag-role" — the dominant pain is diagnostic ("I tagged it, why is there no credit?") and eligibility-timing confusion. A read-only diagnostic script is the highest-value adjacent idea but is explicitly **out of scope** for this build (strong phase-2 candidate, distinct deliverable).
- **Overtagging-risk analysis:** a principal tag has uncapped, forever-recurring blast radius (100% of that principal's future Bedrock traffic), unlike a resource tag's bounded one-time exposure. The tool can verify *mechanical* eligibility (dates, principal type) but never *scope* eligibility (is 100% of this principal's traffic genuinely migrated) — that is a contractual judgment only the customer/CSM can make. Design principle: **when uncertain, surface evidence and ask; never assert eligibility, never auto-deny on ambiguous rules.**

## 2. What v13 IS

One generated script (configurator output), **tag-existing-only**, **single-account execution**, with two entry paths that converge on one core.

**Entry path A — customer knows the principal:**
1. Customer types the exact role or user ARN (or name).
2. Script resolves it, runs the eligibility check (§4), prints findings.
3. Confirmation line shows evidence + dollar exposure (§6).
4. On confirm → `iam:TagRole`/`iam:TagUser` → read-back verify → status ladder (§8).

**Entry path B — customer doesn't know which principal to tag:**
1. Script scans CloudTrail (`lookup-events`, management events — zero customer setup, see §3) for Bedrock/AgentCore-calling principals.
2. Presents a numbered, ranked candidate table (§5) in an interactive terminal session.
3. Customer multi-selects by number.
4. Same eligibility → confirm → tag → verify pipeline as path A, batched.

Both paths are front doors to a single eligibility/confirm/tag/verify code path.

**IAM users are first-class alongside roles** in both discovery and tagging — the Cursor-BYOK auto-created `BedrockAPIKey-*` IAM-user pattern is a real, common field case; `iam:TagUser` and `lookup-events` use the same mechanisms, so support costs almost nothing extra.

## 3. Verified technical foundations (live-tested 2026-07-14/15)

These facts were live-verified before this design and are load-bearing:

- **Bedrock runtime calls are CloudTrail management events** (`InvokeModel`, `Converse`, streaming variants) — they appear in `cloudtrail lookup-events` within ~90 s **with zero customer trail setup**. Triple-confirmed (live test, official docs, internal Slack). Discovery therefore needs no prerequisite infrastructure.
- **Events carry `additionalEventData.{inputTokens,outputTokens}`** — discovery can rank candidates by actual token volume, not just call count.
- **Events are `readOnly:true`** — a scan that filters out read-only events sees *nothing*. The scan must not filter on `ReadOnly`.
- **Assumed-role sessions resolve cleanly**: `userIdentity.sessionContext.sessionIssuer.arn` carries the underlying role ARN directly — no string surgery on STS ARNs.
- **⚠️ Mantle exception:** `bedrock-mantle` inference is a CloudTrail **data** event — invisible to `lookup-events`. Scan discovery is structurally blind to mantle-only traffic; additionally, mantle IAM-principal billing attribution doesn't populate yet (field-verified). Documented as a KNOWN GAP (§9), surfaced in scan output as a loud caveat.
- **CAT catalog naming:** the IAM-principal cost-allocation-tag entry surfaces under the **prefixed key** `iamPrincipal/map-migrated` (Type stays `UserDefined`) — a separate entry from the resource-tag `map-migrated`. Any verify/read logic must target the prefixed key and must never touch the resource-tag entry.
- **Auto-activation:** MAP ops activates `iamPrincipal/map-migrated` on customers' behalf for real MAP contracts (confirmed, but "on behalf of" — not proven instant/universal; one field account showed Active with zero manual steps, another needed manual activation). Verify-first read-only check is the right posture; docs keep the manual-activation instructions as fallback.

## 4. Eligibility check — three severities, not one flat warning

1. **Hard refuse** — only what is *technically impossible* (the tag API call itself would fail): `AWSReservedSSO_*` and other service-linked / AWS-protected principals. No confirm path — there is nothing to tag. (IAM Identity Center is officially unsupported for principal tagging.)
2. **Warn + confirm** — genuine doubt, never blocked:
   - **Principal created before the MAP contract date.** The official doc says spend is excluded "if the IAM role was in use before start of your MAP migration"; the MAP team has verbally said "created after contract date". These readings differ and AWS has never crisply reconciled them — so the script surfaces *both readings plus the actual creation date* and lets the human decide.
   - **Already tagged with a different MPE value** — never silently overwrite; show the old value, require explicit confirm to replace.
3. **Pass** — created after contract date, observed Bedrock activity, untagged or already tagged with the same MPE.

**Note tier (informational, not a warning):** no observed Bedrock/AgentCore activity yet. A brand-new role legitimately has zero CloudTrail history — the "future role" case. Printed as a NOTE, never as a caution.

**Governing rule:** never hard-deny on an eligibility rule AWS itself hasn't crisply and consistently stated. Eligibility-timing ambiguity has real lost-money field history; the tool's job is to surface evidence, not to adjudicate.

## 5. Discovery ranking (path B)

Candidates ordered by:
1. Observed Bedrock/AgentCore CloudTrail activity, ranked by **token volume** (`additionalEventData` input+output tokens).
2. Bedrock-invoke IAM permissions attached but zero observed calls (about-to-migrate signal).
3. Created after contract date — recency bonus as a **tiebreaker only**, never a hard filter.

Scan output states its own blind spots loudly (lookback window used, mantle invisibility, regions scanned).

## 6. Confirmation line — the entire overtagging safeguard

No blast-radius classifier, no separate consent ceremony (v12's SHARED/DEDICATED tiering was cut as overbuilt for tag-existing-only scope). Evidence folds directly into one confirm prompt:

```
role `llm-gateway-prod`: ~$8,400/mo observed Bedrock spend (90d), created 2026-05-02
(after your 2026-04-15 contract date). Tagging applies MAP credit to 100% of this
principal's Bedrock/AgentCore traffic under mig<MPEID>. Proceed? (y/N)
```

For warn-tier candidates, the specific warning (pre-contract creation date / different-MPE tag present) is prepended to the same evidence line. Deliberately not a heavyweight attestation form: one line, the human reads the dollar number and the scope claim, and decides.

## 7. Single-account-only — precisely scoped

The management account **structurally cannot** enumerate or tag IAM principals living in linked accounts via the StackSet mechanism the rest of the tagger uses. This is an AWS-side limitation, not a design choice to relax later.

- **Single-account mode:** this module runs natively — full discovery + tag.
- **Org/multi-account mode:** the same generated script, with a configurator note: "run this once per linked account that uses Bedrock (CloudShell, ~2 min each)." Not blocked — just not automated cross-account from the management account.
- Consequence (deliberate): principal tagging stays structurally **out of the always-on event-driven runtime pipeline** (CloudTrail→EventBridge→SQS→Lambda). No auto-tagging of principals, ever — no reconciliation-Lambda-shaped mistake (the v22 #95 lesson) reintroduced.

## 8. End-of-run output (mini-verify + status ladder)

After tagging, read the tag back (`iam:ListRoleTags` / `iam:ListUserTags`) to confirm the write, then print:

1. **CAT status if readable** — payer accounts: read `iamPrincipal/map-migrated` Active/Inactive directly (`ce:ListCostAllocationTags`, prefixed key). Linked accounts: cannot read (AccessDenied, verified) — print "ask your payer admin to confirm `iamPrincipal/map-migrated` is Active in Billing → Cost allocation tags."
2. **A ~10-line printed checklist**: "Spend should appear in Cost Explorer within ~24h of this principal's next Bedrock call. If it doesn't, check: [ ] tag value exactly `mig<MPEID>` [ ] CAT Active [ ] principal not shadowed by a resource-tagged Application Inference Profile (resource tags take precedence over principal tags) [ ] spend isn't AWS Marketplace/MPPO (structurally ineligible regardless of tags)."

This is *not* the full diagnostic-script product from the field research (explicitly deferred) — it rides on eligibility data already gathered, no separate mode.

## 9. Explicit non-goals (v13)

| Cut | Why |
|---|---|
| Create-new-role wizard (trust templates, model scoping) | Least customer-friendly part of v10; likely deployment blocker (Jerri). Console/IaC creates roles; we tag them. |
| Payer watcher / activation stack | Auto-activation confirmed for real MAP payers; only a read-only status check survives (§8). |
| Event-driven re-tagging on IaC drift (permission-set re-provisioning wipes tags, etc.) | Losing cycle (Jerri); document as a customer-side IaC prerequisite instead. |
| Org/multi-account automation from the management account | AWS-side structural limitation (§7). |
| Standalone "why is my credit missing" diagnostic script | Highest-value adjacent idea from field research, but a distinct deliverable. Phase-2 candidate, not bundled. |
| Mantle tagging support *claim* | Mantle IAM-principal attribution doesn't populate yet (field-verified); scan is blind to mantle data events. Documented KNOWN GAP; tagging a discovered mantle-calling principal is not blocked, but no credit claim is made. |
| CUR 2.0 gating | MAP credit does not depend on the customer's CUR setup at all (CCS reads the billing backend). CUR 2.0 is an optional-visibility message, never a prerequisite warning. |

## 10. Ship path

1. **This design doc locked by chhyu** (rule 04) — resolve §11 first.
2. Build: single generated script (discovery + eligibility + confirm + tag + verify, both entry paths) → configurator mode card + generation → i18n × 7 locales → lint (`lint_shell_injection.py` on the generated script) → tests (golden CloudTrail event fixtures for discovery ranking — real captured events per rule 06, eligibility-severity unit tests) → docs (COVERAGE.md, LIMITATIONS.md for single-account-only + mantle gap, INSTRUCTIONS.md, CHANGELOG).
3. **Live-verify before any "supported" claim** (rule 04 claim bar). The own-account timing test concluded negative at 31h with a non-MAP-account confound — verifying CAT auto-activation end-to-end needs a real MAP-contract account.

Version bump: **MINOR** (new capability, no impact on existing deployments — the new mode is additive and generates a standalone script).

## 11. Open questions — TO BE LOCKED before code

| # | Question | Proposed default | Status |
|---|---|---|---|
| Q1 | CloudTrail lookback window for discovery ranking: fixed 90 days, or a config knob? | Fixed `min(90d, days since contract date)` — derived, no knob; `lookup-events` caps at 90d anyway | OPEN |
| Q2 | Should path A (typed ARN) also run the discovery-style activity lookup for that one principal, to populate the same confirmation-line evidence? | Yes — same call scoped to one principal; without it path A's confirm line has no dollar evidence | OPEN |
| Q3 | Configurator UI: two entry paths as one guided flow ("Do you know which role/user to tag?") or two buttons? | One guided flow — a single yes/no question branching to ARN input vs "the script will scan"; both bake into the same script, the runtime asks again if run non-interactively | OPEN |
| Q4 | Placement relative to the existing deploy flow | Separate mode card on the landing page (Jin already accepted "separate section, not folded into deploy/update" in the v10 discussion) | OPEN |

---

## Appendix: decisions trail

- 2026-07-14/15 — v10 designed (two artifacts, payer watcher, create-role wizard, D1–D31 register).
- 2026-07-14 — D10 live-verified: Bedrock runtime calls are management events; `lookup-events` discovery works with zero setup; token counts available.
- 2026-07-15 — CAT key naming corrected (`iamPrincipal/` prefix, not a new Type enum); auto-activation of the resource-tag entry researched.
- 2026-07-15/16 — MAP ops confirmed auto-activation extends to `iamPrincipal/map-migrated` → payer watcher artifact deleted from the design.
- 2026-07-15 — own timing test concluded negative at 31h (non-MAP-account confound; doesn't overturn the auto-activation finding, but means we can't independently re-verify the trigger without a real MAP payer).
- 2026-07-16 — team debate: create-role wizard and IaC-drift re-tagging cut (Jerri); overengineering concern (Jin) answered by scope reduction.
- 2026-07-17 — 16-class field-issue taxonomy: dominant pain is diagnostic, not mechanical; diagnostic script deferred to phase 2. v13 scoped and finalized: tag-existing-only, two entry paths, 3-severity eligibility, single-account-only.
- 2026-07-19 — this design doc written from the finalized v13 spec. §11 awaiting lock.
