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
- Sample ResNet-50 values—including CPU and GPU values—are illustrative, not claims about a published experiment. CPU, GPU, total override and phase entries each have a selectable data-source label (illustrative, manual estimate or measured).
- No duration or execution-time input is used to estimate energy.

## FOCUS-compatible CSV

The downloadable export includes phase-level usage quantity, IT energy, electricity cost, currency, resource, model, dataset, run, user/team, allocation method, data status, PUE and tariff, plus clear job-total and separate preparation allocation context. It is a **FOCUS-compatible research export, not an officially validated FOCUS dataset**.
