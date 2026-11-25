export const JOULES_PER_KWH = 3_600_000;
export const PHASES = [
  { id: 'dataset-download', label: 'Dataset & model download', group: 'Preparation', sampleJ: 21_600_000 },
  { id: 'model-staging', label: 'Model staging', group: 'Preparation', sampleJ: 7_200_000 },
  { id: 'data-transfer', label: 'Data transfer', group: 'Execution', sampleJ: 14_400_000 },
  { id: 'data-loading', label: 'Data loading', group: 'Execution', sampleJ: 18_000_000 },
  { id: 'host-copy', label: 'Host-to-GPU memory copy', group: 'Execution', sampleJ: 10_800_000 },
  { id: 'gpu-compute', label: 'GPU compute', group: 'Execution', sampleJ: 82_800_000 },
  { id: 'gpu-sync', label: 'GPU synchronization', group: 'Execution', sampleJ: 7_200_000 },
  { id: 'checkpointing', label: 'Checkpointing', group: 'Execution', sampleJ: 14_400_000 },
  { id: 'validation', label: 'Validation', group: 'Execution', sampleJ: 14_400_000 },
  { id: 'model-upload', label: 'Model upload', group: 'Post-execution', sampleJ: 7_200_000 },
];

export function toKWh(value, unit = 'J') {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new RangeError('Energy must be a finite non-negative number.');
  return unit === 'kWh' ? n : n / JOULES_PER_KWH;
}

const finiteNonNegative = (value, name) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new RangeError(`${name} must be a finite non-negative number.`);
  return n;
};
const positive = (value, name) => {
  const n = finiteNonNegative(value, name);
  if (n <= 0) throw new RangeError(`${name} must be greater than zero.`);
  return n;
};
const positiveInteger = (value, name) => {
  const n = positive(value, name);
  if (!Number.isInteger(n)) throw new RangeError(`${name} must be a whole number.`);
  return n;
};

/** Pure calculation function. Energy inputs are IT-meter readings, before PUE. */
export function calculate(input) {
  const tariff = finiteNonNegative(input.tariff, 'Electricity tariff');
  const pue = positive(input.pue, 'PUE');
  if (pue < 1) throw new RangeError('PUE cannot be less than 1.');
  const cpuKWh = toKWh(input.cpuEnergy || 0, input.cpuUnit || 'J');
  const gpuKWh = toKWh(input.gpuEnergy || 0, input.gpuUnit || 'J');
  const cpuSupplied = input.cpuEnergy !== '' && input.cpuEnergy != null;
  const gpuSupplied = input.gpuEnergy !== '' && input.gpuEnergy != null;
  const rawPhaseKWh = PHASES.map(phase => {
    const entry = input.phases?.[phase.id] ?? {};
    const value = entry.value === '' || entry.value == null ? 0 : finiteNonNegative(entry.value, `${phase.label} energy`);
    return { ...phase, energyKWh: toKWh(value, entry.unit || 'J'), status: entry.status || 'Illustrative estimate' };
  });
  const phaseTotalKWh = rawPhaseKWh.reduce((sum, row) => sum + row.energyKWh, 0);
  const explicitTotal = input.totalEnergy !== '' && input.totalEnergy != null;
  const totalKWh = explicitTotal
    ? toKWh(input.totalEnergy, input.totalUnit || 'J')
    : (cpuSupplied || gpuSupplied ? cpuKWh + gpuKWh : phaseTotalKWh);
  const runCount = positiveInteger(input.runCount, 'Training runs');
  const epochs = positiveInteger(input.epochs, 'Epochs per run');
  const sharingUsers = positiveInteger(input.sharingUsers ?? 1, 'Sharing users');
  const downloads = positiveInteger(input.downloads ?? 1, 'Dataset downloads');
  const gpuCount = positiveInteger(input.gpuCount, 'Number of GPUs');
  const datasetSize = finiteNonNegative(input.datasetSize || 0, 'Dataset size');
  const costFor = kwh => kwh * pue * tariff;
  const facilityKWh = totalKWh * pue;
  const totalCost = costFor(totalKWh);
  const cpuCost = costFor(cpuKWh);
  const gpuCost = costFor(gpuKWh);
  const prepIncluded = Boolean(input.allocationEnabled);
  const prepKWh = prepIncluded ? toKWh(input.prepEnergy || 0, input.prepUnit || 'J') : 0;
  const prepCost = costFor(prepKWh);
  let prepShare = 0;
  if (prepIncluded) {
    if (input.allocationMethod === 'owner') prepShare = prepCost;
    else if (input.allocationMethod === 'usage') {
      const share = finiteNonNegative(input.usageShare || 0, 'Usage share');
      if (share > 100) throw new RangeError('Usage share cannot exceed 100%.');
      prepShare = prepCost * share / 100;
    }
    else prepShare = prepCost / sharingUsers;
  }
  const perRunCost = totalCost / runCount;
  const phaseRows = rawPhaseKWh.map(row => ({ ...row, cost: costFor(row.energyKWh), facilityKWh: row.energyKWh * pue }));
  const primaryPhases = phaseRows.filter(row => row.group === 'Execution');
  const biggestPhase = primaryPhases.reduce((best, row) => row.energyKWh > (best?.energyKWh ?? -1) ? row : best, null);
  const cpuGpuSum = cpuKWh + gpuKWh;
  const measurementBasis = explicitTotal ? 'Explicit total energy measurement' : (cpuSupplied || gpuSupplied ? 'CPU + GPU meter readings' : 'Sum of phase entries');
  return {
    tariff, pue, cpuKWh, gpuKWh, cpuSupplied, gpuSupplied, totalKWh, facilityKWh,
    totalCost, cpuCost, gpuCost, phaseRows, phaseTotalKWh, prepKWh, prepCost, prepShare,
    perRunCost, perEpochCost: perRunCost / epochs, costPerGpu: totalCost / gpuCount,
    runCount, epochs, sharingUsers, downloads, datasetSize, biggestPhase, cpuGpuSum, measurementBasis,
    trainingCostPerUser: totalCost, prepCostPerDownload: prepCost / downloads,
    allocationMethod: input.allocationMethod || 'equal',
    estimatedEnergyMismatch: !explicitTotal && (cpuSupplied || gpuSupplied) && Math.abs(cpuGpuSum - phaseTotalKWh) > Math.max(0.000001, cpuGpuSum * 0.05),
    componentMismatch: explicitTotal && (cpuSupplied || gpuSupplied) && Math.abs(cpuGpuSum - totalKWh) > Math.max(0.000001, totalKWh * 0.05),
  };
}
