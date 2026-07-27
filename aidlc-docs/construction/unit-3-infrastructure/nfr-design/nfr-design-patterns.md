# NFR Design Patterns — unit-3-infrastructure

**Date**: 2026-03-26
**Stage**: NFR Design
**Traceability**: U3-NFR-1..11; FR-5, FR-6, FR-12, FR-15

Five patterns realize this unit's NFR envelope in the generated templates.

## P-1: DLQ safety net
**Serves**: U3-NFR-1, U3-NFR-3; FR-6; US-12, US-14

Failure is always **parked and alerted, never dropped**:

- Main queue redrive policy: maxReceiveCount 5 → DLQ.
- DLQ retention 14 days — the manual-replay window after a fix; replayed
  messages re-enter the normal pipeline and tag from replay time forward
  (idempotency on the unit-2 side makes replay safe unconditionally).
- `DLQFillingUp` alarms on DLQ depth ≥ 1 within an evaluation period — a single
  parked message is already lost credit in progress, not noise.
- The DLQ is the terminal state of the zero-silent-loss chain that starts in
  unit-2's classifier; the two designs meet at this queue.

## P-2: Alarm fan-in to a central topic
**Serves**: U3-NFR-8; US-11, US-14

Org mode routes every member account's alarms to one watchable place:

- Central topic per deployed region, `auto-map-tagger-alerts-central-<mpe>`, in
  the management account (CloudWatch alarm actions are same-region-only, hence
  per region).
- Topic policy allows cross-account `sns:Publish` conditioned on
  `aws:SourceOrgID` — org membership, not principal lists; robust to account
  churn at zero maintenance.
- **Hard rule carried into generation**: no `alias/aws/sns` on any topic that
  receives alarm actions — CloudWatch cannot publish through the AWS-managed key
  and the failure is *silent*, which for a safety net equals data loss.
  Customer-managed key or none.
- Every alarm name and message embeds the MPE namespace so a page identifies the
  engagement (US-11 AC-2).

## P-3: Preflight custom resource
**Serves**: U3-NFR-6; FR-15; US-4

A small Preflight Lambda backs a CFN Custom Resource evaluated at stack
create/update, **before the pipeline goes live**:

- **Peer-tagger collision** — another tagging solution already active in the
  account.
- **Scope intersection** — an existing `map-auto-tagger-*` engagement whose
  account scope overlaps this one; the stack fails with an explanatory reason
  (US-4 AC-2).

In-template (not script-only) because the template is what actually reaches every
account: console deploys and StackSets AutoDeployment into newly created accounts
run no script. The `PeerTaggerDetected` alarm remains as the runtime backstop for
collisions that arise *after* deploy.

## P-4: Coupled-constants discipline
**Serves**: U3-NFR-2; NFR-9

The retry budget is one semantic value expressed in two resource properties:

- Definition site in the template module declares the budget (900 s) and the
  receive count (5); visibility timeout is **derived** (900 / 5 = 180 s) so a
  lone edit is impossible in the generator.
- The coupling's dependents are documented at the definition site: unit-2's
  worst-case latency NFR and any verify-poll tooling that waits on tags.
- A unit test asserts visibility × maxReceiveCount == documented budget, guarding
  against a future refactor un-deriving the values.
- Related fixed relation, same discipline: Lambda timeout (60 s) **<** visibility
  timeout (180 s), so a timed-out invocation's messages always redeliver cleanly.

## P-5: Fail-safe defaults
**Serves**: U3-NFR-6, U3-NFR-9; FR-13 (upgrade semantics, with unit-5)

Template parameter defaults are a back-compat contract, because upgrades apply
`UsePreviousValue` only to parameters that already exist — a newly added
parameter falls through to its default in every upgraded stack:

- Every default is the **no-behavior-change** choice; a default may never broaden
  scope, add permissions, or alter alerting silently.
- Parameters requiring customer judgment (MPE ID, agreement dates, scope) have
  **no** default and must be supplied.
- Corollary for reviewers: "what happens to an existing deployment that upgrades
  past this change?" is a mandatory question for every new parameter.

## Pattern → NFR coverage matrix

| | P-1 | P-2 | P-3 | P-4 | P-5 |
|---|---|---|---|---|---|
| U3-NFR-1 durability | x | | | | |
| U3-NFR-2 retry budget | | | | x | |
| U3-NFR-3 no loss window | x | | | | |
| U3-NFR-6 coexistence | | | x | | x |
| U3-NFR-8 alarm reliability | x | x | | | |
| U3-NFR-9 least privilege | | | | | x |

(U3-NFR-4 cost, U3-NFR-5 scale, U3-NFR-7 regions, U3-NFR-10 no-outbound, and
U3-NFR-11 version visibility are realized as configuration values and derivations
itemized in `logical-components.md` and the infrastructure design.)
