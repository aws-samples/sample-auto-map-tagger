# Business Logic Model — Unit 1: Configurator

## Deploy Script Generation Flow

```
1. SA opens configurator.html, selects Deploy tab
2. Fills form:
   - MPE ID (MAP Engagement ID)
   - Agreement start/end dates
   - Scope mode (account | organization)
   - Scoped account IDs (list)
   - Scoped VPC IDs (optional)
   - Tag non-VPC services (boolean)
   - Alert email
3. On "Generate & Download":
   a. Validate all inputs
   b. Select template (main for single-account, org for StackSet)
   c. TemplateGenerator embeds CFN + Lambda code + event patterns
   d. Wrap CFN into a deploy.sh with AWS CLI commands
   e. Trigger browser download
```

## Input Validation Rules

| Field | Rule |
|---|---|
| MPE ID | Numeric, matches MAP engagement format |
| Start date | Valid ISO date, before end date |
| End date | Valid ISO date, after start date |
| Account IDs | 12-digit numbers, valid list |
| VPC IDs | `vpc-` prefix format (if provided) |
| Alert email | Valid email format |

## Template Selection Logic

```
if scope_mode == "organization":
    template = buildOrgTemplate(config)      # StackSet
else:
    template = buildMainTemplate(config)     # single-account Stack
```

## Generated deploy.sh Structure

```bash
#!/bin/bash
# Self-contained MAP Auto-Tagger deployment
# MPE: <MPE_ID>, generated <timestamp>

# 1. Create S3 staging bucket (for Lambda code)
# 2. Upload embedded Lambda package
# 3. Deploy CloudFormation (embedded template)
# 4. Write scope config to SSM
# 5. Print verification instructions
```

## i18n Resolution

```javascript
// Every UI string resolved via engine
i18n.t("deploy.form.mpe_label")  // → "MAP Engagement ID" (en) / "MAP参加ID" (ja)
```

Languages loaded lazily; default is browser locale → fallback to `en`.

## Build Process (scripts/build.js)

```
1. Read HTML skeleton (src/html/configurator.html)
2. Inline CSS (src/css/styles.css)
3. Bundle JS modules (app.js + flows + i18n + services)
4. Inline Lambda handler (src/templates/lambda-handler.py) as embedded string
5. Output single configurator.html
6. verify-build.js sanity-checks the output
```

## Delete Script Generation

```
1. SA selects Delete tab, chooses region + scope
2. Types "DELETE" to confirm
3. Generate delete.sh:
   - Remove all map-auto-tagger-* stacks/stacksets (or scoped MPEs)
   - Preserve existing map-migrated tags (do NOT untag resources)
   - Remove S3 staging bucket only if no other deployments remain
```
