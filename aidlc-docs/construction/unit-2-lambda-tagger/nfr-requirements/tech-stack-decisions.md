# Tech Stack Decisions — unit-2-lambda-tagger

**Date**: 2026-03-25
**Stage**: NFR Requirements
**Traceability**: NFR-4, NFR-8, NFR-10; U2-NFR-8, U2-NFR-12

## Decision summary

| Decision | Choice |
|---|---|
| Language / runtime | Python 3.12 (`python3.12` Lambda managed runtime) |
| AWS SDK | boto3, **as provided by the Lambda runtime** — not vendored |
| External dependencies | **Zero** — standard library + runtime boto3 only |
| Packaging | Single standalone file `src/templates/lambda-handler.py`, embedded inline into the CloudFormation template at build time (`ZipFile`) |
| Test framework | Handler logic exercised from the repo's vitest-driven test suite via subprocess/fixture harness + golden CloudTrail event corpus |

## D-1: Python 3.12 on the managed Lambda runtime

**Chosen because**:
- boto3 ships inside the managed runtime — the tagging problem is 100% "call AWS
  APIs defensively", so the entire dependency surface comes for free.
- Python's dict/string handling suits defensive CloudTrail parsing (`ci_get()`,
  narrow try/except per parse) with minimal ceremony.
- 3.12 is the current long-support managed runtime at design time; pinning it in
  the template gives a predictable deprecation horizon.

**Rejected**: Node.js (would work, but the browser plane already owns JS — a
distinct language keeps the two planes' review surfaces separate); Go/Rust custom
runtimes (compilation step breaks the "embed source directly in the template"
distribution model below).

## D-2: Zero external dependencies (hard consequence of NFR-4 / NFR-10)

The handler imports **only** the Python standard library and the runtime's boto3.

- **No packaging pipeline exists to hide risk in**: no requirements.txt, no layer,
  no zip build, no third-party supply chain inside the customer's account.
- Supports the security-review story: a customer can read the one file in the
  deployed template and see everything the Lambda will ever do — which is how the
  no-outbound-calls guarantee (U2-NFR-8) stays *auditable*, not just asserted.
- Cost: we re-implement small helpers (`ci_get`, ARN validation) instead of
  importing them. Accepted — they are precisely the code we want to own and test.

## D-3: Single standalone file, embedded at build time

`src/templates/lambda-handler.py` is a complete, runnable, importable module. The
unit-1 build indents and inlines it into the CloudFormation template
(`AWS::Lambda::Function` inline `ZipFile` code).

- **Embeddable**: no artifact bucket needed for the Lambda code itself; the
  template is self-contained, which single-file distribution (NFR-10) requires.
- **Testable**: the file runs and imports on its own — unit tests and the golden
  event corpus exercise it directly, with no build step in the loop (U2-NFR-12).
- **Consequence — template size ceiling**: inline `ZipFile` code counts against
  the CloudFormation template size limit (51,200 bytes for a directly submitted
  template body; ~1 MB when staged via S3). The org-mode deploy therefore stages
  the template through an S3 bucket, and the build will fail loudly if the
  assembled template approaches the ceiling. (A build-time check, not a runtime
  concern.)
- **Consequence — one file discipline**: helpers live in the same file; if it ever
  outgrows single-file form, that is a design change (S3-staged code) requiring a
  new decision here, because it alters the distribution and audit model.

## D-4: boto3 client strategy

- Clients created lazily and cached module-level (cold-start cost paid once).
- Resource Groups Tagging API (`tag_resources`) is the default tag path; native
  service tag APIs (e.g. `s3:PutBucketTagging`) only where RGTA cannot reach —
  each such case documented in the extractor branch.
- SDK retries left at defaults; *our* retry semantics live in the SQS budget and
  the three-path classifier, not in SDK retry tuning — two retry layers with
  independent budgets would make the 900 s coupled constant unverifiable.

## D-5: Test tooling

- Example-based tests + **golden captured CloudTrail events** (real events, not
  hand-written) as the fixture corpus — the chosen defense against AWS changing
  event shapes without notice (Property-Based Testing was explicitly declined at
  Requirements Analysis; rationale recorded there).
- The corpus and the parity audit are unit-4 contracts; this unit's obligation is
  that every extractor branch is reachable and asserted from at least one fixture.
