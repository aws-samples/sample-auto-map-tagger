# Unit of Work — Story Map

Every story is assigned to exactly one unit of work (18/18 assigned; validated in `unit-of-work-plan.md`). Where a story touches multiple units, it is assigned to the unit owning its primary acceptance criteria; cross-unit effects are covered by the CI contract gates.

| Story | Title | Persona | Priority | Unit of Work |
|---|---|---|---|---|
| US-1 | Configure an engagement in the browser | Priya (Consultant) | Must | unit-1-configurator |
| US-2 | Generate the deployment package | Priya (Consultant) | Must | unit-1-configurator |
| US-3 | Work in my customer's language | Priya (Consultant) | Must | unit-1-configurator |
| US-4 | Run concurrent engagements safely | Priya (Consultant) | Must | unit-3-infrastructure |
| US-5 | Deploy org-wide in one operation | Marcus (Platform Engineer) | Must | unit-5-lifecycle-ops |
| US-6 | Scope precisely | Marcus (Platform Engineer) | Must | unit-2-lambda-tagger |
| US-7 | Review least-privilege IAM before deploying | Marcus (Platform Engineer) | Must | unit-3-infrastructure |
| US-8 | Upgrade in place | Marcus (Platform Engineer) | Must | unit-5-lifecycle-ops |
| US-9 | Delete without losing credits | Marcus (Platform Engineer) | Must | unit-5-lifecycle-ops |
| US-10 | Preflight before mutation | Marcus (Platform Engineer) | Must | unit-5-lifecycle-ops |
| US-11 | Get alerted on failure | Marcus (Platform Engineer) | Must | unit-3-infrastructure |
| US-12 | Buffer slow provisioners | Marcus (Platform Engineer) | Must | unit-3-infrastructure |
| US-13 | Tags land within minutes | Elena (FinOps PM) | Must | unit-2-lambda-tagger |
| US-14 | See credit leakage early | Elena (FinOps PM) | Must | unit-3-infrastructure |
| US-15 | Negligible run cost | Elena (FinOps PM) | Should | unit-3-infrastructure |
| US-16 | Add a covered service safely | Dev (Maintainer) | Must | unit-4-service-definitions |
| US-17 | Trust the built artifacts | Dev (Maintainer) | Must | unit-1-configurator |
| US-18 | Trust the tool with customer data | Priya (Consultant) | Must | unit-1-configurator |

## Distribution Summary

| Unit | Stories | Count |
|---|---|---|
| unit-1-configurator | US-1, US-2, US-3, US-17, US-18 | 5 |
| unit-2-lambda-tagger | US-6, US-13 | 2 |
| unit-3-infrastructure | US-4, US-7, US-11, US-12, US-14, US-15 | 6 |
| unit-4-service-definitions | US-16 | 1 |
| unit-5-lifecycle-ops | US-5, US-8, US-9, US-10 | 4 |
| **Total** | | **18** |

## Assignment Notes

- **US-4** (namespaced coexistence) lands in unit-3 because namespacing is realized in resource naming within the templates; the preflight overlap check it references is verified via unit-5's US-10 criteria.
- **US-6** (scoping) lands in unit-2 because scope evaluation executes in the Lambda, although the config schema is a unit-3 deliverable (FR-10 traceability covers both).
- **US-13** (latency) lands in unit-2 as the tagging path owner; the retry-budget half of the latency bound is validated under US-12 (unit-3).
- **US-18** (privacy/no-phone-home) lands in unit-1 because the auditable no-network guarantee is a property of the built artifact; the runtime no-outbound-calls half is enforced as NFR-4 acceptance criteria in unit-2/unit-3 designs and the Build and Test gates.
