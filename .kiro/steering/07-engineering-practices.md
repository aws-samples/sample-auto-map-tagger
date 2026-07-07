# 07 — Engineering Practices

> ⚠️ Canonical copy: `.kiro/steering/`. Edit there, then run `npm run sync-rules` — the sync is **one-way** (kiro → claude) and overwrites `.claude/rules/`.

Patterns that repeat across the project's history. Follow them.

## Defensive coding

- **Wrap external/parsing calls in try/except with narrow exceptions** — `get_config`, `strptime`, S3 calls are all guarded (§1.1–§1.3, §1.129). Never let one malformed input crash the handler.
- **Case-insensitive CloudTrail access via `ci_get()`** — CloudTrail returns inconsistent key casing (`aRN` vs `arn`). Direct access caused silent tag loss. Always use the helper.
- **ARN suffix-match fallback** in `extract_arn` for resilience when the exact shape varies (v20.7.0).
- **Validate ARN well-formedness before trusting CloudTrail** — AWS has changed event shapes under us (#102: Kinesis emitted a malformed `resources`-array ARN → 100% silent tag loss). Prefer a dedicated per-service handler over a generic resources-array scan; never assume a field that was well-formed yesterday still is.
- **Match both throttle spellings** — AWS APIs return `ThrottledException` *and* `ThrottlingException` depending on service; a single-substring match misses one of them. Any throttle classifier must handle both.

## Idempotency and retries

- **Tagging must be idempotent** — re-applying the same tag is safe. This is what makes the 5-retry SQS model safe.
- **Three-path error classifier**: actionable / ignorable / transient (v20.4.0). New services need a TRANSIENT_MARKER or they DLQ prematurely during their provisioning window.

## Preflight everything

Validate before you mutate. The codebase has scope-intersection preflight (blocks overlapping taggers), IAM preflight, stack-state preflight, and peer-tagger collision detection. When adding a mutating operation, add its preflight check.

## Shell-script discipline (generated scripts and ops tooling)

- **Never silence a state-mutating CLI call** with `>/dev/null 2>&1 || true` — a swallowed failure becomes a silent partial deploy. Only truly optional/cosmetic calls may ignore errors, and say why inline.
- **Success polls must distinguish "zero work found" from "all work done"** — a loop that exits on an empty result can't tell "nothing was created" apart from "everything completed". Count expected work first, then poll against that count.

## Coupled constants

Some timing constants are load-bearing pairs: the SQS retry budget (180s visibility × 5 receives = 900s) is coupled to the verify-poll budget that assumes tags land within it. **Change both or neither** — and when relaxing any input validation, audit every name derived from that input against AWS length limits downstream (the MPE 20→44-char relax overflowed a 64-char IAM role name).

## Root-cause over symptom

When you find a bug, look for its siblings. Proactive audit passes fixed *classes* of bugs, not one-offs (e.g., #20 "4 latent bugs from proactive audit"). Don't patch one instance and move on.

## Small, focused, reversible changes

- **Single-concern PRs.** One logical change per PR.
- **Every fix lands with a regression test** that locks in the behavior.
- **Disable, don't delete, when uncertain** — the Editor/Upgrade flows were disabled but kept for reference rather than ripped out, preserving institutional knowledge.

## Backward compatibility

Always note back-compat impact of a change (e.g., the region-qualified S3 bucket rename documented the old naming and the manual cleanup path). Don't silently break existing deployments.
