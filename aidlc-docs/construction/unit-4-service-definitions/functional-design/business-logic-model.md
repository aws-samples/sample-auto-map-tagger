# Business Logic Model — Unit 4: Service Definitions

## Service Definition Format

Each service is a `.js` module in `src/js/services/` following a standard shape:

```javascript
// src/js/services/ec2.js
export default {
  service: "ec2",
  eventSource: "ec2.amazonaws.com",
  resourceTypes: [
    { name: "Instance", events: ["RunInstances"], arnPattern: "..." },
    { name: "Volume", events: ["CreateVolume"], arnPattern: "..." },
    { name: "Snapshot", events: ["CreateSnapshot"], arnPattern: "..." },
    // ...
  ],
  eventPattern: {
    source: ["aws.ec2"],
    detailType: ["AWS API Call via CloudTrail"],
    detail: { eventName: ["RunInstances", "CreateVolume", ...] }
  }
};
```

## Registry Aggregation

```javascript
// src/js/services/index.js
import ec2 from "./ec2.js";
import rds from "./rds.js";
// ... 85 imports

export const SERVICES = [ec2, rds, ...];

export function getEventPatterns() {
  // Merge all service event patterns into EventBridge rules
}

export function getResourceTypes() {
  // Flatten to 154 resource types
}
```

## Coverage Categories (154 types)

| Category | Service Files | Example Types |
|---|---|---|
| Compute | ec2, lambda, ecs, eks, emr, gamelift | Instance, Function, Cluster |
| Database | rds, dynamodb, redshift, neptune, memorydb, elasticache, dsql, keyspaces, dax | DBInstance, Table, Cluster |
| Storage | s3, efs, fsx, glacier, backup, storagegateway | Bucket, FileSystem |
| Networking | vpc(ec2), elb, cloudfront, route53, directconnect, networkmanager, network-firewall | VPC, LoadBalancer |
| Analytics | kinesis, msk, glue, athena, opensearch, firehose, finspace, quicksight | Stream, Cluster |
| AI/ML | sagemaker, bedrock, comprehend, kendra, omics | Model, Agent, KnowledgeBase |
| Integration | stepfunctions, apigateway, appsync, mq, sqs, sns | StateMachine, API |
| Security | kms, acm, acm-pca, cognito, securityhub, cloudhsm, secretsmanager, ram | Key, UserPool |
| Media | mediaconvert, medialive, mediapackage, kinesisvideo, deadline | Job, Channel |
| Migration | transfer, datasync, dms, drs | Server, Task |
| IoT | iot | Analytics, SiteWise, Events |
| Dev Tools | codebuild, codepipeline, codedeploy, resiliencehub | Project, Pipeline |

## Adding a New Service

```
1. Create src/js/services/<newservice>.js following the format
2. Add import to src/js/services/index.js
3. Add ARN extractor to lambda-handler.py (Unit 2)
4. Run npm run build
5. audit_handler_coverage.py verifies handler parity (CI gate)
```

## Coverage Audit

`.github/scripts/audit_handler_coverage.py`:
```
1. Parse all service definitions → set of resource types
2. Parse lambda-handler.py → set of implemented extractors
3. Assert: every defined resource type has a handler
4. Fail CI if any gap detected
```

## Not Taggable (documented AWS limitations)

| Resource | Reason |
|---|---|
| IoT Things | No tagging API support |
| Lambda Layers | Not taggable |
| Glue Tables | Only taggable at creation, not via events |
| CloudWatch Log Streams | No tagging support |
| API Gateway API Keys | No tagging support |
