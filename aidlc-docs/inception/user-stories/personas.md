# User Personas

## Persona 1: AWS Solutions Architect / CSM (Deployer)

| Attribute | Description |
|---|---|
| **Name** | Priya (AWS Solutions Architect) |
| **Role** | Deploys the auto-tagger for migration customers |
| **Goals** | Help customers capture all eligible MAP credits with minimal friction |
| **Behaviors** | Opens configurator, enters MPE ID + scope, hands customer a deploy.sh, verifies tagging works |
| **Pain Points** | Customers lose credits from untagged resources; manual tagging doesn't scale; can't back-date tags |
| **Technical Level** | High (AWS expert) |
| **Frequency** | Per migration engagement |

### Key Characteristics
- Needs a fast, error-proof way to deploy across customer accounts
- Values self-service (customer runs it themselves in CloudShell)
- Wants verification that tagging actually works
- Deploys across APJ — needs multi-language configurator

## Persona 2: Customer Cloud Engineer (Beneficiary)

| Attribute | Description |
|---|---|
| **Name** | Wei (Customer DevOps Engineer) |
| **Role** | Manages the customer's AWS environment |
| **Goals** | Keep migrating workloads without worrying about tagging |
| **Behaviors** | Creates resources normally; the tagger runs silently in the background |
| **Pain Points** | Tagging is easy to forget; scripts create untagged resources; too many resource types to track |
| **Technical Level** | Medium-High |
| **Frequency** | Daily (creates resources), rarely interacts with tagger directly |

### Key Characteristics
- Wants zero disruption to existing workflows
- No desire to install agents or change IaC
- Trusts the tagger to catch everything automatically

## Persona 3: Customer FinOps / Finance (Outcome Owner)

| Attribute | Description |
|---|---|
| **Name** | Aisha (FinOps Analyst) |
| **Role** | Tracks and maximizes MAP credit realization |
| **Goals** | Ensure maximum migration credits are captured |
| **Behaviors** | Reviews credit reports, confirms coverage |
| **Pain Points** | Missed tags = lost money; hard to audit coverage manually |
| **Technical Level** | Low-Medium |
| **Frequency** | Monthly credit review |

### Key Characteristics
- Cares about financial outcome, not implementation
- Needs confidence that coverage is comprehensive
- Values alerting when something fails
