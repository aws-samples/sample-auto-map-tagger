# Frontend Components — unit-1-configurator

**Date**: 2026-03-25 | **Stories**: US-1, US-2, US-3, US-17, US-18

No framework (NFR-10): components are plain-DOM sections of the single HTML file
with behavior attached by the concatenated JS modules. "Props" below means the
data a component reads; "state" means what it owns. All visible text renders via
`t()` (BR-C-20). All interactive elements carry stable `data-testid` attributes
named `{component}-{element-role}`.

## Component Hierarchy

```
ConfiguratorApp (page shell)
├── LocaleSelector
├── ModeSelector                    (wizard step 0)
└── Wizard
    ├── StepIndicator
    ├── EngagementDetailsStep       (step 1)
    │   ├── MpeIdField
    │   ├── AgreementDatesFields
    │   └── CustomerNameField
    ├── ScopeStep                   (step 2)
    │   ├── DeploymentTargetToggle
    │   ├── AccountScopeEditor
    │   ├── VpcScopeEditor
    │   └── NonVpcServicesSwitch
    ├── ReviewStep                  (step 3)
    │   └── ReviewTable
    ├── DownloadPanel               (step 4)
    └── WizardNav (Back / Next)
```

## Components

### LocaleSelector
- **Reads**: available locale codes. **Owns**: active locale.
- **Interaction**: change → re-render all visible strings; never touches
  configuration data (BR-C-23).
- **testids**: `locale-selector-dropdown`.

### ModeSelector
- **Reads**: none. **Owns**: `Configuration.mode`.
- **Interaction**: pick deploy / delete / upgrade → determines which wizard steps
  and fields are active; `selectMode()` in `shared/ui.js`.
- **testids**: `mode-selector-deploy-button`, `mode-selector-delete-button`,
  `mode-selector-upgrade-button`.

### Wizard / StepIndicator / WizardNav
- **Reads**: step list for the active mode, per-step validity. **Owns**: current
  step index.
- **Interaction**: Next disabled until current step valid (BR-C-08); Back
  preserves entered data; editing from Review returns state to `DRAFT`.
- **testids**: `wizard-next-button`, `wizard-back-button`, `wizard-step-indicator`.

### EngagementDetailsStep
- **Reads/writes**: `mpeId`, `agreementStart`, `agreementEnd`, `customerName`.
- **Validation**: BR-C-01/02/03/07 on blur; localized error rendered adjacent to
  the field (US-1 AC-2); BR-C-03 renders as a non-blocking warning banner.
- **testids**: `engagement-mpe-id-input`, `engagement-start-date-input`,
  `engagement-end-date-input`, `engagement-customer-name-input`,
  `engagement-mpe-id-error`, `engagement-dates-error`,
  `engagement-date-window-warning`.

### ScopeStep
- **Reads/writes**: `deploymentTarget`, `ScopeDefinition` fields.
- **Interaction flows**:
  - `DeploymentTargetToggle`: single-account ↔ org StackSet; selects which
    template generator will run.
  - `AccountScopeEditor`: ALL ↔ EXPLICIT radio (BR-C-05); in EXPLICIT mode a
    multi-entry list input with per-entry 12-digit validation (BR-C-04) and
    de-duplication.
  - `VpcScopeEditor`: optional list with `vpc-…` validation (BR-C-06); adding a
    first VPC forces `NonVpcServicesSwitch` into an explicit-choice state.
  - `NonVpcServicesSwitch`: tri-state until VPC scoping engages, then must be
    explicitly set true/false before the step validates.
- **testids**: `scope-target-single-radio`, `scope-target-org-radio`,
  `scope-account-mode-all-radio`, `scope-account-mode-explicit-radio`,
  `scope-account-list-input`, `scope-account-add-button`,
  `scope-vpc-list-input`, `scope-vpc-add-button`,
  `scope-nonvpc-switch`, `scope-account-error`, `scope-vpc-error`.

### ReviewStep / ReviewTable
- **Reads**: entire `Configuration` (read-only) plus derived coverage summary
  from `ServiceSelection` (service count, event count).
- **Rendering rule**: every displayed value is HTML-escaped before insertion —
  the review table renders user input and is an XSS surface; escaping here is a
  blocking requirement, not polish.
- **Interaction**: per-section Edit links jump back to the owning step;
  confirmation checkbox + Generate button transition `DRAFT → CONFIRMED`.
- **testids**: `review-table`, `review-edit-engagement-link`,
  `review-edit-scope-link`, `review-confirm-checkbox`,
  `review-generate-button`.

### DownloadPanel
- **Reads**: `GeneratedArtifact[]` from the generation pipeline.
- **Interaction**: `generateAndDownload()` runs final revalidation (BR-C-12),
  produces the full artifact set (BR-C-13), and triggers one `downloadFile()`
  Blob download per artifact; shows per-file status and a "what to do next"
  localized instruction block.
- **Failure handling**: if final revalidation fails, the panel is not shown; the
  wizard jumps to the offending step with the field error rendered.
- **testids**: `download-panel`, `download-deploy-link`, `download-delete-link`,
  `download-upgrade-link`, `download-template-link`, `download-all-button`.

## Cross-Cutting Component Rules

- **State locality**: the `Configuration` object is the single source of truth;
  components read/write it through small setters that run validation — no
  component keeps a private copy of config data.
- **No network**: no component may issue any request (BR-C-14). "API integration
  points" for this unit are deliberately **none** — the generation pipeline is a
  local function call, which is the load-bearing privacy property (US-18).
- **testid stability**: `data-testid` values change only when an element's
  purpose changes, never for cosmetic refactors.
- **Accessibility baseline**: every input labeled; errors associated via
  `aria-describedby`; wizard navigable by keyboard.
