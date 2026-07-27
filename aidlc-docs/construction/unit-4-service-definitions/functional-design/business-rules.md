# Business Rules — unit-4-service-definitions

**Date**: 2026-03-25 | **Story**: US-16
**Traceability**: FR-3, FR-16; NFR-5

Rules are numbered `BR-S-*` (Service definitions). Enforcement is CI-blocking
unless stated otherwise — this unit's whole value is that its rules are machine
checks, not conventions.

## Structural Rules

| ID | Rule | Rationale / enforcement |
|---|---|---|
| BR-S-01 | **One module per service.** Each covered AWS service has exactly one file in `src/js/services/`, exporting one definition constant with exactly the fields `{source, events, permissions}`. | Reviewable diffs, per-service blame, build auto-discovery. Shape checked by a registry schema test. |
| BR-S-02 | **Events must be create-type.** Every entry in `events[]` is a resource-*creation* API name (`Create*`, `Run*`, `Launch*`, `Start*`-of-a-new-resource, `Put*`-that-creates, etc.). Modify/delete/read events are forbidden — the tagger tags at creation; matching mutation events would re-fire the pipeline for no benefit and inflate cost. | Lint on event-name prefixes; genuinely creational non-`Create` names (e.g., `RunInstances`) are allowlisted explicitly in the lint config, with a comment. |
| BR-S-03 | **Unique source, unique events.** No two definitions share a `source`; no definition repeats an event name. | Duplicate patterns mean double processing. Registry test. |
| BR-S-04 | **Explicit registration.** Every definition file is listed in `ALL_SERVICES` in `index.js`; an unregistered definition file fails CI. | A definition that exists but isn't live is a coverage lie. |

## Permission Rules (NFR-5)

| ID | Rule | Rationale / enforcement |
|---|---|---|
| BR-S-10 | **Least-privilege tagging actions only.** `permissions[]` contains only the tagging actions unit-2's extractor for this service will actually call (e.g., `rds:AddTagsToResource`, `s3:PutBucketTagging`, `tag:TagResources` where the generic API suffices). No wildcards (`svc:*`), no non-tagging actions. | Every granted action must trace to a covered service; the generated policy must pass least-privilege security review (US-7). Wildcard lint + IAM-completeness check. |
| BR-S-11 | **Completeness both ways.** The generated IAM policy contains exactly the union of registry permissions plus the fixed pipeline baseline — an action in the policy with no defining service, or a defined permission missing from the policy, fails CI. | Drift in either direction is a defect: over-grant fails review, under-grant is runtime `AccessDenied` → silent tag loss. |

## Eligibility Rules

| ID | Rule | Rationale / enforcement |
|---|---|---|
| BR-S-20 | **MAP Included Services only.** A service may be added only if it appears on the MAP Included Services List. Non-eligible services earn no credits — tagging them adds IAM surface and event volume for zero customer value. | Coverage review against `docs/MAP_included.md`; the pinned list edition is the arbiter. |
| BR-S-21 | **Pin the list edition.** `docs/MAP_included.md` records the edition date of the MAP list the registry targets. On every list revision, diff the **whole list** against the registry in both directions (newly eligible services with no definition; covered services that dropped off). | Spot-checking individual services misses whole-service gaps. |
| BR-S-22 | **Untaggable resources are documented, not defined.** If AWS provides no working post-creation tagging API for a resource type, it gets an entry in the tagging-gap analysis doc, not a definition. A definition whose handler cannot work is a parity-passing lie. | Design review; gap doc is the record of deliberate exclusions. |

## Parity Rules (FR-16)

| ID | Rule | Rationale / enforcement |
|---|---|---|
| BR-S-30 | **Definition without handler = CI failure.** Every `(source, event)` pair in the registry must have a matching ARN-extraction handler in unit-2's `lambda-handler.py`. `audit_handler_coverage.py` fails the build naming each gap. | An unhandled matched event is silent tag loss — the worst failure class in this system (US-16 AC-1). |
| BR-S-31 | **Handler without definition = CI failure.** The audit is bidirectional: an extractor for an event no definition declares also fails. | Dead code with no event rule and no IAM grant; either register it or remove it (US-16 AC-2). |
| BR-S-32 | **Real fixture required.** Every covered service lands with at least one real captured CloudTrail event fixture; handler tests replay it. Hand-written approximations are not acceptable. | AWS changes event shapes without notice; only real events catch real drift (US-16 AC-3). |

## Change-Control Rule

| ID | Rule |
|---|---|
| BR-S-40 | **Coverage changes update the docs in the same change**: `docs/COVERAGE.md` and `docs/MAP_included.md` for any added/removed service. A coverage claim may not be marked verified until a real resource has been observed to receive the tag (until then: `UNVERIFIED`). |
