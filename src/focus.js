export const FOCUS_CORE_HEADERS = [
  'BilledCost',
  'BillingAccountId',
  'BillingAccountName',
  'BillingCurrency',
  'BillingPeriodEnd',
  'BillingPeriodStart',
  'ChargeCategory',
  'ChargeClass',
  'ChargeDescription',
  'ChargePeriodEnd',
  'ChargePeriodStart',
  'ContractedCost',
  'EffectiveCost',
  'HostProviderName',
  'InvoiceIssuerName',
  'ListCost',
  'PricingQuantity',
  'PricingUnit',
  'ServiceCategory',
  'ServiceName',
  'ServiceProviderName',
  'SkuPriceId',
];

export const FOCUS_ESTIMATE_HEADERS = [
  'x_AllocatedPreparationCostPerUser',
  'x_AllocationMethod',
  'x_CalculationBasis',
  'x_CalculationMode',
  'x_ChargeComponent',
  'x_DatasetName',
  'x_ElectricityTariffPerKilowattHour',
  'x_EstimatedElectricityCost',
  'x_EstimatedFacilityEnergyKilowattHours',
  'x_EstimatedItEnergyKilowattHours',
  'x_EstimationStatus',
  'x_EpochsPerRun',
  'x_ModelName',
  'x_NumberOfGraphicsProcessingUnits',
  'x_PowerUsageEffectiveness',
  'x_ScenarioRole',
  'x_TrainingRunCount',
  'x_TrainingRunId',
  'x_UserOrTeam',
];

export const FOCUS_HEADERS = [...FOCUS_CORE_HEADERS, ...FOCUS_ESTIMATE_HEADERS];

const decimal = (value, digits = 6) => Number(value || 0).toFixed(digits);
const csvCell = value => `"${String(value ?? '').replaceAll('"', '""')}"`;

function makeEstimateRow(input, result, { description, component, energyKWh, cost, status, role = '', allocatedShare = '' }) {
  const row = Object.fromEntries(FOCUS_HEADERS.map(header => [header, '']));
  Object.assign(row, {
    BilledCost: '0',
    BillingCurrency: 'EUR',
    ChargeCategory: 'Usage',
    ChargeDescription: description,
    ContractedCost: '0',
    EffectiveCost: '0',
    ListCost: '0',
    ServiceCategory: 'AI and Machine Learning',
    ServiceName: 'HPC AI training electricity estimate',
    x_AllocatedPreparationCostPerUser: allocatedShare === '' ? '' : decimal(allocatedShare, 2),
    x_AllocationMethod: input.allocationMethod || 'equal',
    x_CalculationBasis: result.measurementBasis,
    x_CalculationMode: input.mode || 'total',
    x_ChargeComponent: component,
    x_DatasetName: input.dataset,
    x_ElectricityTariffPerKilowattHour: decimal(result.tariff),
    x_EstimatedElectricityCost: decimal(cost, 2),
    x_EstimatedFacilityEnergyKilowattHours: decimal(energyKWh * result.pue),
    x_EstimatedItEnergyKilowattHours: decimal(energyKWh),
    x_EstimationStatus: status || 'Illustrative estimate',
    x_EpochsPerRun: String(input.epochs),
    x_ModelName: input.model,
    x_NumberOfGraphicsProcessingUnits: String(input.gpuCount),
    x_PowerUsageEffectiveness: decimal(result.pue, 2),
    x_ScenarioRole: role,
    x_TrainingRunCount: String(input.runCount),
    x_TrainingRunId: input.runId,
    x_UserOrTeam: input.user,
  });
  return row;
}

export function buildFocusRows(input, result, mode = input.mode || 'total') {
  const rows = [];
  const baseDescription = `${input.model} training electricity estimate`;
  if (mode === 'components') {
    rows.push(makeEstimateRow(input, result, {
      description: `${baseDescription} — CPU`, component: 'CPU', energyKWh: result.cpuKWh,
      cost: result.cpuCost, status: input.cpuStatus,
    }));
    rows.push(makeEstimateRow(input, result, {
      description: `${baseDescription} — GPU`, component: 'GPU', energyKWh: result.gpuKWh,
      cost: result.gpuCost, status: input.gpuStatus,
    }));
  } else if (mode === 'phases') {
    const activePhases = result.phaseRows.filter(phase => phase.energyKWh > 0);
    for (const phase of activePhases) {
      rows.push(makeEstimateRow(input, result, {
        description: `${baseDescription} — ${phase.label}`,
        component: phase.id,
        energyKWh: phase.energyKWh,
        cost: phase.cost,
        status: phase.status,
      }));
    }
  } else if (mode === 'compare') {
    const currentKWh = result.totalKWh;
    const alternativeKWh = input.compareKWh || 0;
    const alternativeTariff = input.compareTariff === '' ? result.tariff : Number(input.compareTariff);
    rows.push(makeEstimateRow(input, result, {
      description: `${baseDescription} — current configuration`,
      component: 'Current configuration',
      energyKWh: currentKWh,
      cost: currentKWh * result.pue * result.tariff,
      status: input.totalStatus,
      role: 'Current',
    }));
    rows.push(makeEstimateRow(input, result, {
      description: `${input.compareLabel} training electricity estimate`,
      component: input.compareLabel,
      energyKWh: alternativeKWh,
      cost: alternativeKWh * result.pue * alternativeTariff,
      status: 'Manual estimate',
      role: 'Alternative',
    }));
  } else {
    rows.push(makeEstimateRow(input, result, {
      description: baseDescription,
      component: 'Training job',
      energyKWh: result.totalKWh,
      cost: result.totalCost,
      status: input.totalStatus,
      role: 'Estimate',
    }));
  }

  if (input.allocationEnabled && result.prepKWh > 0) {
    rows.push(makeEstimateRow(input, result, {
      description: `${input.dataset} shared preparation electricity estimate`,
      component: 'Shared dataset preparation',
      energyKWh: result.prepKWh,
      cost: result.prepCost,
      status: 'Manual estimate',
      role: 'Separate allocation',
      allocatedShare: result.prepShare,
    }));
  }

  if (rows.length === 0) {
    rows.push(makeEstimateRow(input, result, {
      description: `${baseDescription} — no energy entered`,
      component: 'Training job',
      energyKWh: 0,
      cost: 0,
      status: 'No energy entered',
      role: 'Estimate',
    }));
  }
  return rows;
}

export function buildFocusCsv(input, result, mode = input.mode || 'total') {
  const rows = buildFocusRows(input, result, mode);
  const headerLine = FOCUS_HEADERS.map(csvCell).join(',');
  const rowLines = rows.map(row => FOCUS_HEADERS.map(header => csvCell(row[header])).join(','));
  return [headerLine, ...rowLines].join('\r\n');
}
