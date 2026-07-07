# Requirement Verification Questions

Questions asked during Requirements Analysis to clarify scope and constraints. Answers captured inline.

### Question 1
What is the primary deployment model?

A) Single AWS account only
B) Multi-account (organization) only
C) Both single-account and multi-account
D) Other

[Answer]: C. Must support both a single account (Stack) and org-wide (StackSet) from a management account.

### Question 2
How should the solution be delivered to customers?

A) A hosted web service they log into
B) A self-contained file they run themselves (no AWS-side hosting)
C) A CLI tool they install
D) Other

[Answer]: B. A single HTML configurator that generates a self-contained deploy.sh. No hosting, runs in CloudShell.

### Question 3
What latency is acceptable between resource creation and tagging?

A) Real-time (<5 seconds)
B) Near real-time (60–90 seconds)
C) Batch (hourly/daily)
D) Other

[Answer]: B. 60–90 seconds is acceptable and realistic given CloudTrail delivery latency.

### Question 4
How should failed tagging attempts be handled?

A) Retry indefinitely
B) Retry a fixed number of times, then alert
C) Fail silently and log
D) Other

[Answer]: B. 5 retries via SQS, then route to DLQ and alert via CloudWatch + SNS. Slow-provisioning resources need the retry buffer.

### Question 5
Should the solution support multiple languages?

A) English only
B) English + major APJ languages
C) Other

[Answer]: B. en, ja, ko, th, vi, id, zh — the configurator is used across APJ by SAs/CSMs.

### Question 6
How should new AWS services be added over time?

A) Hardcoded in the Lambda and configurator
B) Modular per-service definitions that can be added independently
C) Other

[Answer]: B. One .js definition file per service, with a matching ARN extractor in the Lambda. Automated coverage audit ensures parity.

### Question 7
What happens to tags when the solution is removed?

A) Tags are removed with the solution
B) Tags are preserved (credits stay intact)
C) Other

[Answer]: B. delete.sh must preserve existing map-migrated tags so MAP credits are not lost.
