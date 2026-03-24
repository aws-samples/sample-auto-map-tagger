# Support

## Reporting Issues

If you discover a bug or have a feature request, please [open a GitHub issue](../../issues).

When reporting a bug, include:
- The AWS region(s) where the issue occurred
- The resource type that failed to tag
- The relevant CloudWatch log output from `/aws/lambda/map-auto-tagger`
- The CloudFormation template version (visible in the stack description)

## Checking Tagging Activity

```bash
# View recent tagging activity
aws logs tail /aws/lambda/map-auto-tagger --follow

# Check for errors
aws logs filter-log-events \
  --log-group-name /aws/lambda/map-auto-tagger \
  --filter-pattern "Failed"
```

## Updating the MAP Engagement ID

No redeployment needed — update the SSM parameter directly:

```bash
aws ssm put-parameter \
  --name /map-tagger/config \
  --type String \
  --overwrite \
  --value '{"mpe_id":"migNEWID","agreement_start_date":"2024-01-01","scope_mode":"account","scoped_account_ids":["ALL"],"scoped_vpc_ids":[]}'
```

## Security Issues

To report a security vulnerability, see [SECURITY.md](SECURITY.md). Do **not** open a public GitHub issue for security concerns.

## AWS Support

This is a community sample. For issues with underlying AWS services (CloudTrail, EventBridge, Lambda), contact [AWS Support](https://aws.amazon.com/support/).
