# Story Generation Plan — MAP 2.0 Auto-Tagger

## Planning Questions

### Question 1
How should stories be organized?

A) User Journey-Based
B) Feature-Based (configurator, tagging, failure handling, scope, lifecycle, extensibility)
C) Persona-Based
D) Other

[Answer]: B

### Question 2
What granularity?

A) Coarse
B) Medium (sub-features per capability)
C) Fine
D) Other

[Answer]: B

### Question 3
Distinct user roles?

A) One role
B) Deployer (SA/CSM) + Beneficiary (customer engineer) + Outcome owner (FinOps)
C) Other

[Answer]: B. Three personas but SA/CSM is the primary interactive user.

### Question 4
Priority of the configurator UI vs the tagging engine?

A) Configurator first
B) Tagging engine first (it's the core value); configurator wraps it
C) Both equal priority
D) Other

[Answer]: B. Tagging engine is the core value. But both are MVP.

---

## Story Generation Steps

- [x] Step 1: Define personas (SA/CSM, customer engineer, FinOps)
- [x] Step 2: Configurator stories (generate script, i18n, deployment modes)
- [x] Step 3: Automatic tagging stories (tag resources, coverage, slow resources)
- [x] Step 4: Failure handling stories (DLQ alerts, verification)
- [x] Step 5: Scope management stories (add/remove accounts, retrieve config)
- [x] Step 6: Lifecycle stories (upgrade, clean removal)
- [x] Step 7: Extensibility stories (add new service)
- [x] Step 8: Validate against INVEST
- [x] Step 9: Write stories.md and personas.md
