# Service Registry Modules

Each file in this directory defines one AWS service (or a logical group of related services) that the MAP Auto-Tagger monitors.

## File format

```js
const SERVICE_NAME = {
    source: 'aws.xxx',          // CloudTrail event source
    events: ['CreateFoo'],      // CloudTrail event names to match
    permissions: ['xxx:TagResource'], // IAM permissions needed to tag
};

module.exports = SERVICE_NAME;
```

For grouped services (e.g. `cognito.js` covers both `cognito-idp` and `cognito-identity`), export an object with multiple service definitions:

```js
module.exports = { SERVICE_COGNITO_IDP, SERVICE_COGNITO_IDENTITY };
```

## Special files

| File | Purpose |
|------|---------|
| `_shared.js` | Cross-cutting permissions (tag:*, SQS queue ops, CloudFormation, IAM) and events not tied to a single source |
| `index.js` | Aggregates all modules into the flat `ALL_EVENT_NAMES`, `ALL_SOURCES`, and `TAGGING_PERMISSIONS` arrays |

## Adding a new service

1. Create `src/js/services/<service>.js` following the format above
2. Import it in `index.js` and add it to the `ALL_SERVICES` array
3. Update `scripts/build.js` if it references service files directly
