import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate, JOULES_PER_KWH, PHASES, toKWh } from '../src/calc.js';
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} ≉ ${expected}`);

const base = {
  tariff: 0.24, pue: 1.35, cpuEnergy: 54_000_000, cpuUnit: 'J', gpuEnergy: 144_000_000, gpuUnit: 'J',
  runCount: 2, epochs: 20, gpuCount: 4, sharingUsers: 6, downloads: 12, allocationEnabled: true,
  prepEnergy: 36_000_000, prepUnit: 'J', allocationMethod: 'equal', usageShare: 20,
  phases: { compute: { value: 3_600_000, unit: 'J' } },
};

test('joule and kWh conversion use exactly 3,600,000 J per kWh', () => {
  assert.equal(JOULES_PER_KWH, 3_600_000);
  assert.equal(toKWh(3_600_000), 1);
  assert.equal(toKWh(1.5, 'kWh'), 1.5);
});

test('CPU/GPU measured energy, PUE, and tariff produce auditable totals', () => {
  const r = calculate(base);
  assert.equal(r.totalKWh, 55);
  assert.equal(r.facilityKWh, 74.25);
  assert.equal(r.totalCost, 17.82);
  close(r.cpuCost, 4.86);
  close(r.gpuCost, 12.96);
  close(r.perRunCost, 8.91);
  close(r.perEpochCost, 0.4455);
  close(r.costPerGpu, 4.455);
  assert.equal(r.trainingCostPerUser, r.totalCost);
});

test('explicit total measurement takes precedence and can be kWh', () => {
  const r = calculate({ ...base, totalEnergy: 4, totalUnit: 'kWh' });
  assert.equal(r.totalKWh, 4);
  assert.equal(r.measurementBasis, 'Explicit total energy measurement');
});

test('phase sum supplies job energy when no aggregate meter readings exist', () => {
  const r = calculate({ ...base, cpuEnergy: '', gpuEnergy: '', phases: { [PHASES[0].id]: { value: 3_600_000, unit: 'J' }, [PHASES[1].id]: { value: 0.5, unit: 'kWh' } } });
  assert.equal(r.totalKWh, 1.5);
  assert.equal(r.measurementBasis, 'Sum of phase entries');
});

test('phase-level electricity cost is independently derived from each phase meter value', () => {
  const r = calculate({ ...base, phases: { [PHASES[0].id]: { value: 3_600_000, unit: 'J', status: 'Measured' } } });
  close(r.phaseRows[0].energyKWh, 1);
  close(r.phaseRows[0].cost, 0.324);
  assert.equal(r.phaseRows[0].status, 'Measured');
});

test('dataset preparation allocation methods and per-download cost remain separate from job cost', () => {
  const equal = calculate(base);
  close(equal.prepShare, 0.54);
  close(equal.prepCostPerDownload, 0.27);
  close(calculate({ ...base, allocationMethod: 'usage' }).prepShare, 0.648);
  close(calculate({ ...base, allocationMethod: 'owner' }).prepShare, 3.24);
  assert.equal(calculate({ ...base, allocationEnabled: false }).prepShare, 0);
  assert.equal(equal.totalCost, 17.82);
});

test('invalid tariffs, PUE, negative energy, zero or fractional counts, and excess usage are rejected', () => {
  assert.throws(() => calculate({ ...base, tariff: -0.1 }), /tariff/i);
  assert.throws(() => calculate({ ...base, pue: 0.9 }), /PUE/i);
  assert.throws(() => calculate({ ...base, phases: { [PHASES[0].id]: { value: -1, unit: 'J' } } }), /non-negative/i);
  assert.throws(() => calculate({ ...base, gpuCount: 0 }), /greater than zero/i);
  assert.throws(() => calculate({ ...base, runCount: 1.5 }), /whole number/i);
  assert.throws(() => calculate({ ...base, downloads: 1.5 }), /whole number/i);
  assert.throws(() => calculate({ ...base, downloads: 0 }), /greater than zero/i);
  assert.throws(() => calculate({ ...base, sharingUsers: 0 }), /greater than zero/i);
  assert.throws(() => calculate({ ...base, allocationMethod: 'usage', usageShare: 101 }), /100%/i);
});
