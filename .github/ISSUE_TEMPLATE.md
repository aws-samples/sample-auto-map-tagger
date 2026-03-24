---
name: Bug report / Feature request
about: Report a bug or suggest an improvement
---

**Describe the issue**
A clear description of the bug or feature request.

**Resource type affected** (if applicable)
e.g., `AWS::RDS::DBInstance`, `AWS::ECS::Service`

**Expected behavior**
What you expected to happen.

**Actual behavior**
What actually happened. Include relevant CloudWatch log output:
```
aws logs filter-log-events --log-group-name /aws/lambda/map-auto-tagger --filter-pattern "ERROR"
```

**Environment**
- Template version (from CloudFormation stack description):
- AWS Region:
- Deployment mode (single account / StackSet):

**Additional context**
Any other relevant information.
