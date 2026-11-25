import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate } from '../src/calc.js';
import { buildFocusCsv, buildFocusRows, FOCUS_CORE_HEADERS, FOCUS_ESTIMATE_HEADERS, FOCUS_HEADERS } from '../src/focus.js';

const baseInput = {
  mode: 'total', tariff: 0.24, pue: 1.35,
  totalEnergy: 198_000_000, totalUnit: 'J', totalStatus: 'Measured',
  cpuEnergy: '', cpuUnit: 'J', cpuStatus: 'Illustrative estimate',
  gpuEnergy: '', gpuUnit: 'J', gpuStatus: 'Illustrative estimate',
  model: 'ResNet-50', dataset: 'ImageNet-1K', runId: 'run-001', user: 'Research group',
  gpuCount: 4, runCount: 1, epochs: 20, datasetSize: 138,
  phases: {}, allocationEnabled: false, prepEnergy: 0, prepUnit: 'J',
  sharingUsers: 6, downloads: 12, allocationMethod: 'equal', usageShare: 20,
  compareEnergy: 180_000_000, compareUnit: 'J', compareKWh: 50,
  compareCurrentEnergy: 198_000_000, compareCurrentUnit: 'J', compareCurrentKWh: 55,
  compareLabel: 'Lustre', compareTariff: '',
};

const calculateBase = overrides => {
  const input = { ...baseInput, ...overrides };
  return { input, result: calculate(input) };
};

test('FOCUS CSV contains the complete mandatory Cost and Usage column set plus correctly prefixed estimate extensions', () => {
  const expectedCore = [
    'BilledCost', 'BillingAccountId', 'BillingAccountName', 'BillingCurrency', 'BillingPeriodEnd',
    'BillingPeriodStart', 'ChargeCategory', 'ChargeClass', 'ChargeDescription', 'ChargePeriodEnd',
    'ChargePeriodStart', 'ContractedCost', 'EffectiveCost', 'HostProviderName', 'InvoiceIssuerName',
    'ListCost', 'PricingQuantity', 'PricingUnit', 'ServiceCategory', 'ServiceName', 'ServiceProviderName',
  ];
  assert.deepEqual(FOCUS_CORE_HEADERS.slice(0, 21), expectedCore);
  assert.ok(FOCUS_CORE_HEADERS.includes('SkuPriceId'));
  assert.ok(FOCUS_ESTIMATE_HEADERS.every(header => /^x_[A-Z][A-Za-z0-9]*$/.test(header)));
  assert.deepEqual(FOCUS_HEADERS, [...FOCUS_CORE_HEADERS, ...FOCUS_ESTIMATE_HEADERS]);
});

test('quick-cost rows keep estimated cost out of invoiced FOCUS cost columns', () => {
  const { input, result } = calculateBase({});
  const [row] = buildFocusRows(input, result, 'total');
  assert.equal(row.BilledCost, '0');
  assert.equal(row.ContractedCost, '0');
  assert.equal(row.EffectiveCost, '0');
  assert.equal(row.ListCost, '0');
  assert.equal(row.BillingCurrency, 'EUR');
  assert.equal(row.ChargeCategory, 'Usage');
  assert.equal(row.BillingAccountId, '');
  assert.equal(row.InvoiceIssuerName, '');
  assert.equal(row.PricingQuantity, '');
  assert.equal(row.SkuPriceId, '');
  assert.equal(row.x_EstimatedElectricityCost, '17.82');
  assert.equal(row.x_EstimatedItEnergyKilowattHours, '55.000000');
  assert.equal(row.x_EstimatedFacilityEnergyKilowattHours, '74.250000');
  assert.equal(row.x_EstimationStatus, 'Measured');
});

test('CPU/GPU mode emits separate component rows with their own modeled costs and statuses', () => {
  const { input, result } = calculateBase({
    mode: 'components', totalEnergy: '', cpuEnergy: 54_000_000, gpuEnergy: 144_000_000,
    cpuStatus: 'Measured', gpuStatus: 'Manual estimate',
  });
  const rows = buildFocusRows(input, result, 'components');
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(row => row.x_ChargeComponent), ['CPU', 'GPU']);
  assert.deepEqual(rows.map(row => row.x_EstimatedElectricityCost), ['4.86', '12.96']);
  assert.deepEqual(rows.map(row => row.x_EstimationStatus), ['Measured', 'Manual estimate']);
});

test('phase mode exports only entered phase rows and keeps each phase cost distinct', () => {
  const { input, result } = calculateBase({
    mode: 'phases', totalEnergy: '',
    phases: {
      'dataset-download': { value: 3_600_000, unit: 'J', status: 'Measured' },
      'model-staging': { value: 1, unit: 'kWh', status: 'Manual estimate' },
    },
  });
  const rows = buildFocusRows(input, result, 'phases');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].x_ChargeComponent, 'dataset-download');
  assert.equal(rows[0].x_EstimatedElectricityCost, '0.32');
  assert.equal(rows[1].x_ChargeComponent, 'model-staging');
  assert.equal(rows[1].x_EstimatedFacilityEnergyKilowattHours, '1.350000');
});

test('comparison mode emits current and alternative scenarios with separate cost calculations', () => {
  const { input, result } = calculateBase({
    mode: 'compare', totalEnergy: 198_000_000, compareCurrentKWh: 55,
    compareKWh: 50, compareTariff: 0.30, compareLabel: 'Lustre',
  });
  const rows = buildFocusRows(input, result, 'compare');
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(row => row.x_ScenarioRole), ['Current', 'Alternative']);
  assert.deepEqual(rows.map(row => row.x_EstimatedElectricityCost), ['17.82', '20.25']);
  assert.equal(rows[1].x_ChargeComponent, 'Lustre');
});

test('shared preparation is exported separately and does not alter the training estimate', () => {
  const { input, result } = calculateBase({
    allocationEnabled: true, prepEnergy: 36_000_000, prepUnit: 'J',
    sharingUsers: 6, downloads: 12, allocationMethod: 'equal',
  });
  const rows = buildFocusRows(input, result, 'total');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].x_ChargeComponent, 'Training job');
  assert.equal(rows[1].x_ChargeComponent, 'Shared dataset preparation');
  assert.equal(rows[1].x_EstimatedElectricityCost, '3.24');
  assert.equal(rows[1].x_AllocatedPreparationCostPerUser, '0.54');
  assert.equal(result.totalCost, 17.82);
});

test('CSV begins with FOCUS headers, has no preface, and escapes commas and quotes', () => {
  const { input, result } = calculateBase({ model: 'Model, "Test"' });
  const csv = buildFocusCsv(input, result, 'total');
  const [header, row] = csv.split('\r\n');
  assert.ok(header.startsWith('"BilledCost","BillingAccountId"'));
  assert.equal(header, FOCUS_HEADERS.map(value => `"${value}"`).join(','));
  assert.ok(row.includes('"Model, ""Test"""'));
  assert.equal(csv.split('\r\n').length, 2);
});
