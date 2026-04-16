## Description
Brief description of the change and the problem it solves.

## Type of change
- [ ] Bug fix
- [ ] New resource type support
- [ ] Security improvement
- [ ] Documentation update

## Testing
- [ ] Tested end-to-end in a real AWS account (or CI E2E will cover this)
- [ ] No false positives observed
- [ ] CloudWatch logs reviewed for errors

## Checklist
- [ ] CloudFormation template is valid (`cfn-lint` passes — checked by CI)
- [ ] IAM permissions follow least-privilege (only tag actions added)
- [ ] If adding a new service handler: corresponding resource added to `.github/scripts/resource_groups/` for E2E coverage
- [ ] `CHANGELOG.md` updated

## CI Notes
> **Layer 1 (lint)** runs immediately on every PR — ~1 min.
> **Layer 2 (E2E)** runs when `map2-auto-tagger-optimized.yaml` or `configurator.html` changes — ~37 min across 7 AWS accounts. No AWS credentials needed.
> If Layer 2 fails, download `verification-report.json` from the Actions run for details.
