# HPC AI Training Cost Calculator

A small, dependency-free research tool for converting metered or explicitly entered AI-training energy into electricity cost by phase, job and training run. Created by Muhammad Ali Qureshi.

## Run locally

```sh
python3 -m http.server 4173
```

Open `http://localhost:4173`. The app is static and requires no account, backend, API key, install step or network connection for its calculations. Google Fonts are an optional visual enhancement; local system fonts remain the fallback.

## Verify calculations

```sh
npm test
```

## Calculation conventions

- 1 kWh = 3,600,000 joules.
- Electricity cost = IT energy (kWh) × PUE × tariff (€/kWh).
- The optional total-energy entry takes precedence as the job total. Otherwise, entered CPU + GPU energy values form the job total. If neither CPU nor GPU is entered, job energy falls back to the sum of phase inputs.
- Phase costs remain a breakdown of their own phase readings; they are not silently scaled to match an independent aggregate meter. A reconciliation note flags a greater-than-5% discrepancy when CPU/GPU meters and phase values disagree.
- Dataset-preparation allocation is shown separately from training electricity cost. Equal-user, usage-share and owner allocation are available. Preparation cost per dataset download is also reported. The named user/team owns the full training job; per-run cost divides job cost across the specified run count, while the per-user line reflects the named owner rather than splitting one job across dataset-sharing users.
- Sample ResNet-50 values are illustrative, not claims about a published experiment. Energy sources can be marked illustrative, manually estimated or measured.
- No duration or execution-time input is used to estimate energy.

## FOCUS 1.4 Cost and Usage CSV

The download starts with the FOCUS 1.4 Cost and Usage column IDs and includes calculator-specific values only in `x_` custom columns. It exports one total row, CPU/GPU rows, phase rows or comparison rows depending on the selected calculation mode. Shared dataset preparation, when enabled, appears as a separate estimate row.

This is an **estimate-oriented FOCUS 1.4 scaffold, not a complete or validator-conformant billing dataset**. The calculator does not collect an invoice amount, billing account ID, invoice issuer, actual service/host provider, SKU price ID or billing and charge periods. Those standard billing fields are left blank; standard billing cost columns remain zero. Modeled electricity cost and energy are kept in `x_EstimatedElectricityCost` and related custom columns instead of being misrepresented as invoiced `BilledCost`.

FOCUS defines `BilledCost` as invoiced cost, and its 1.4 custom-column convention uses an `x_` prefix. A real billing export must populate missing billing facts from the authoritative source and satisfy the applicable conditional fields, including SKU pricing details for ordinary Usage rows. See the [FOCUS 1.4 Cost and Usage dataset](https://focus.finops.org/docs/specification/v1-4/datasets/cost-and-usage/), [Billed Cost requirements](https://focus.finops.org/docs/specification/v1-4/columns/cost-and-usage/billed-cost/) and [Custom Column Handling](https://focus.finops.org/docs/specification/v1-4/attributes/custom-column-handling/).
