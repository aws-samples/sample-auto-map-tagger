# Personas — MAP 2.0 Auto-Tagger

## Persona 1: Priya — AWS Partner / ProServe Migration Consultant

**Role**: Leads MAP engagements for enterprise customers, frequently in APJ; configures migration tooling on behalf of the customer.

**Characteristics**
- Deep MAP program knowledge (MPE IDs, agreement windows, credit mechanics); moderate hands-on AWS depth.
- Works on customer sites, often on locked-down laptops — cannot install tools or run backends.
- Frequently works in Japanese, Korean, Thai, Vietnamese, Indonesian, or Chinese with customer staff.

**Goals**
- Produce a correct, customer-ready deployment package (scripts + CloudFormation) in minutes from a browser.
- Guarantee the customer's MPE ID and scope are captured exactly — a typo here mis-tags an entire org.
- Run several concurrent engagements without cross-contamination.

**Pain Points**
- Manual tagging playbooks fail: every untagged resource is credit lost forever.
- Customer security teams reject any tool that sends configuration data to a third party.
- English-only tooling slows customer workshops in APJ.

**Story Mapping**: US-1, US-2, US-3, US-4, US-18

---

## Persona 2: Marcus — Customer Cloud Platform Engineer

**Role**: Owns the customer's AWS organization (landing zone, StackSets, guardrails); deploys and operates the tagger.

**Characteristics**
- Expert in CloudFormation, IAM, org management; sceptical of third-party tooling by default.
- Accountable to security for everything deployed org-wide.
- On-call for platform incidents; wants alarms, not surprises.

**Goals**
- Deploy org-wide in one operation with delegated admin, or scope to selected accounts/VPCs.
- Verify exactly what IAM the solution needs before deploying (least privilege, auditable).
- Upgrade in place safely; delete cleanly with zero risk to earned credits.
- Know immediately when tagging is failing.

**Pain Points**
- Broad-wildcard IAM requests get blocked by security review.
- Tools that phone home are prohibited by policy.
- Teardown scripts that destroy data (or tags) cause irreversible damage.
- Conflicting automations silently fighting over tags.

**Story Mapping**: US-5, US-6, US-7, US-8, US-9, US-10, US-11, US-12

---

## Persona 3: Elena — Customer FinOps / Migration Program Manager

**Role**: Tracks MAP credit capture against the business case; reports migration progress to leadership.

**Characteristics**
- Financially fluent, moderately technical; consumes dashboards and alarms rather than logs.
- Measures success as "% of eligible spend correctly tagged."

**Goals**
- Confidence that every newly created eligible resource is tagged within minutes.
- Early warning when credit is leaking (failures, DLQ growth, trickle failures).
- Predictable, negligible run cost for the tagging solution itself.

**Pain Points**
- Credit leakage is invisible until the quarterly MAP report — far too late to fix (tags cannot be back-dated).
- No way to distinguish "nothing was created" from "tagging is broken."

**Story Mapping**: US-13, US-14, US-15

---

## Persona 4: Dev — Solution Maintainer / Contributor

**Role**: Maintains the open-source solution; adds coverage as the MAP Included Services List evolves.

**Characteristics**
- Strong JS/Python; works through GitHub PRs and CI.
- Part of a 2-maintainer team — automation must substitute for review headcount.

**Goals**
- Add a new covered service by touching a small, well-defined set of files.
- CI that refuses definition/handler parity gaps, stale build artifacts, and unsafe generated shell.
- Confidence that a change to one service cannot silently break another.

**Pain Points**
- AWS changes CloudTrail event shapes without notice; hand-written fixtures drift from reality.
- Coverage claims that were never live-verified erode trust.

**Story Mapping**: US-16, US-17
