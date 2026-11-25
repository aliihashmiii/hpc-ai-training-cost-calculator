import { calculate, PHASES, toKWh } from './calc.js?ui=greenpixie-inspired-v2';

const $ = selector => document.querySelector(selector);
const form = $('#calculator-form');
const euro = value => new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number.isFinite(value) ? value : 0);
const kwh = value => `${Number(value || 0).toFixed(3)} kWh`;
const number = (selector, fallback = 0) => { const raw = $(selector).value; return raw === '' ? fallback : Number(raw); };

const sample = {
  tariff: '0.24', pue: '1.35', cpu: '54000000', gpu: '144000000', model: 'ResNet-50', dataset: 'ImageNet-1K',
  runId: 'resnet50-2025-001', user: 'Research group', gpuCount: '4', runCount: '1', epochs: '20', datasetSize: '138',
  prepEnergy: '36000000', sharingUsers: '6', downloads: '12', usageShare: '20', compareEnergy: '180000000',
  phases: Object.fromEntries(PHASES.map(p => [p.id, p.sampleJ])),
};

function mountPhaseInputs() {
  $('#phase-inputs').innerHTML = PHASES.map(phase => `<div class="phase-row"><label class="phase-name" for="phase-${phase.id}">${phase.label}<small>${phase.group.toUpperCase()}</small></label><span class="phase-controls"><input id="phase-${phase.id}" data-phase="${phase.id}" type="number" min="0" step="any" value="${sample.phases[phase.id]}" inputmode="decimal" aria-label="${phase.label} energy" /><select data-phase-unit="${phase.id}" aria-label="${phase.label} unit"><option value="J">J</option><option value="kWh">kWh</option></select><select data-phase-status="${phase.id}" aria-label="${phase.label} data status"><option>Illustrative estimate</option><option>Manual estimate</option><option>Measured</option></select></span></div>`).join('');
}
mountPhaseInputs();

function readInput() {
  return {
    tariff: number('#tariff'), pue: number('#pue'),
    cpuEnergy: $('#cpu-energy').value, cpuUnit: $('#cpu-unit').value, cpuStatus: $('#cpu-status').value,
    gpuEnergy: $('#gpu-energy').value, gpuUnit: $('#gpu-unit').value, gpuStatus: $('#gpu-status').value,
    totalEnergy: $('#total-energy-input').value, totalUnit: $('#total-unit').value, totalStatus: $('#total-status').value,
    model: $('#model').value.trim() || 'Unnamed model', dataset: $('#dataset').value.trim() || 'Unnamed dataset',
    runId: $('#run-id').value.trim(), user: $('#user').value.trim() || 'Unassigned',
    gpuCount: number('#gpu-count'), runCount: number('#run-count'), epochs: number('#epochs'), datasetSize: number('#dataset-size'),
    phases: Object.fromEntries(PHASES.map(p => [p.id, { value: $(`[data-phase="${p.id}"]`).value, unit: $(`[data-phase-unit="${p.id}"]`).value, status: $(`[data-phase-status="${p.id}"]`).value }])),
    allocationEnabled: $('#allocation-enabled').checked, prepEnergy: $('#prep-energy').value, prepUnit: $('#prep-unit').value,
    sharingUsers: number('#sharing-users'), downloads: number('#downloads'), allocationMethod: $('#allocation-method').value,
    usageShare: number('#usage-share'), compareEnergy: $('#compare-energy').value, compareUnit: $('#compare-unit').value,
    compareLabel: $('#compare-label').value, compareTariff: $('#compare-tariff').value,
  };
}

function validate() {
  let valid = true;
  const wholeNumberFields = new Set(['gpu-count', 'run-count', 'epochs', 'sharing-users', 'downloads']);
  const errors = [];
  form.querySelectorAll('[aria-invalid="true"]').forEach(el => el.removeAttribute('aria-invalid'));
  form.querySelectorAll('input[type="number"]').forEach(el => {
    if (el.closest('[hidden]')) return;
    const val = el.value === '' ? null : Number(el.value);
    const min = Number(el.min || 0);
    const max = el.max === '' ? Infinity : Number(el.max);
    const badRange = (val === null && min > 0) || (val !== null && (!Number.isFinite(val) || val < min || val > max));
    const badWhole = val !== null && wholeNumberFields.has(el.id) && !Number.isInteger(val);
    const badStep = val !== null && !wholeNumberFields.has(el.id) && el.step && el.step !== 'any' && Number.isFinite(val) && Math.abs((val - min) / Number(el.step) - Math.round((val - min) / Number(el.step))) > 1e-8;
    if (badRange || badWhole || badStep) {
      el.setAttribute('aria-invalid', 'true'); valid = false;
      errors.push(`${el.getAttribute('aria-label') || el.closest('.field')?.querySelector(':scope > span')?.textContent.trim() || el.name || 'A number field'}: ${badWhole ? 'enter a whole number' : badRange ? `enter a value from ${min}${Number.isFinite(max) ? ` to ${max}` : ''}` : `use increments of ${el.step}`}.`);
    }
  });
  $('#validation-message').textContent = valid ? '' : `Results below are stale until corrected. ${errors[0] || 'Check the highlighted value.'}`;
  $('#validation-message').hidden = valid;
  $('.summary-grid').classList.toggle('is-stale', !valid);
  $('.results-column').classList.toggle('is-stale', !valid);
  return valid;
}

function render() {
  $('#usage-share-field').hidden = $('#allocation-method').value !== 'usage';
  $('.allocation-fields').hidden = !$('#allocation-enabled').checked;
  if (!validate()) return;
  try {
    const input = readInput();
    const result = calculate(input);
    $('#total-cost').textContent = euro(result.totalCost);
    $('#total-energy').innerHTML = `${result.facilityKWh.toFixed(3)} <small>kWh</small>`;
    $('#cost-context').textContent = `${result.runCount} ${result.runCount === 1 ? 'run' : 'runs'} · ${result.pue.toFixed(2)} PUE × ${euro(result.tariff)}/kWh`;
    $('#energy-context').textContent = `${result.totalKWh.toFixed(3)} IT kWh × ${result.pue.toFixed(2)} PUE`;
    $('#cost-per-run').textContent = euro(result.perRunCost);
    $('#runs-context').textContent = `${result.runCount} ${result.runCount === 1 ? 'training run' : 'training runs'}`;
    $('#cost-per-epoch').textContent = euro(result.perEpochCost);
    $('#epochs-context').textContent = `${result.epochs} epochs per run · using job-total basis`;

    $('#it-energy').textContent = result.totalKWh.toFixed(3);
    $('#cpu-display').textContent = kwh(result.cpuKWh);
    $('#gpu-display').textContent = kwh(result.gpuKWh);
    $('#facility-display').textContent = kwh(result.facilityKWh);
    const circumference = 2 * Math.PI * 59;
    const measuredSplit = result.cpuKWh + result.gpuKWh;
    const cpuFraction = measuredSplit ? result.cpuKWh / measuredSplit : 0;
    $('#energy-donut .donut-cpu').style.strokeDasharray = measuredSplit ? `${circumference * cpuFraction} ${circumference}` : `0 ${circumference}`;
    $('#energy-donut .donut-cpu').style.strokeDashoffset = '0';
    $('#energy-donut .donut-gpu').style.strokeDasharray = measuredSplit ? `${circumference * (1 - cpuFraction)} ${circumference}` : `0 ${circumference}`;
    $('#energy-donut .donut-gpu').style.strokeDashoffset = `${-circumference * cpuFraction}`;
    let note = `${result.measurementBasis} used for job total. CPU: ${input.cpuStatus.toLowerCase()}; GPU: ${input.gpuStatus.toLowerCase()}. `;
    note += result.measurementBasis === 'Explicit total energy measurement'
      ? `Total source: ${input.totalStatus.toLowerCase()}. CPU/GPU component costs are shown separately and may not reconcile to this override.`
      : (result.cpuSupplied || result.gpuSupplied ? 'CPU/GPU component values form job total; phase values are an independent attribution breakdown.' : 'Phase values are used as job-total basis.');
    if (result.estimatedEnergyMismatch) note += ' Phase sum differs from CPU + GPU readings; investigate before audit.';
    if (result.componentMismatch) note += ' Explicit total differs from CPU + GPU component readings; investigate before audit.';
    $('#measurement-note-text').textContent = note;

    const chartRows = result.phaseRows;
    const maxCost = Math.max(...chartRows.map(x => x.cost), 0);
    $('#phase-chart').innerHTML = chartRows.map(row => `<div class="chart-row"><span class="chart-label" title="${row.label}">${row.label}</span><span class="chart-track"><i class="chart-bar" style="width:${maxCost ? Math.max(row.cost / maxCost * 100, row.cost > 0 ? 1 : 0) : 0}%"></i></span><span class="chart-value">${euro(row.cost)}</span></div>`).join('');
    $('#phase-table-body').innerHTML = chartRows.map(row => `<tr><td>${row.label}</td><td>${row.energyKWh.toFixed(5)}</td><td>${euro(row.cost)}</td><td>${row.energyKWh ? row.status : 'Not entered'}</td></tr>`).join('');
    const biggest = result.biggestPhase;
    $('#largest-phase').textContent = biggest && biggest.energyKWh > 0 ? biggest.label : 'No phase energy entered';
    $('#largest-phase-note').textContent = biggest && biggest.energyKWh > 0 ? `${biggest.energyKWh.toFixed(3)} kWh · execution phase` : 'Enter phase values for attribution';
    $('#largest-phase-cost').textContent = euro(biggest?.cost || 0);

    const comparisonKWh = input.compareEnergy === '' ? 0 : toKWh(input.compareEnergy, input.compareUnit);
    const compareTariff = input.compareTariff === '' ? result.tariff : Number(input.compareTariff);
    const compareCost = comparisonKWh * result.pue * compareTariff;
    $('#current-label').textContent = `${input.model} · ${input.dataset}`;
    $('#current-compare-cost').textContent = euro(result.totalCost);
    $('#current-compare-energy').textContent = `${result.totalKWh.toFixed(3)} kWh · ${result.measurementBasis.toLowerCase()}`;
    $('#alternative-label').textContent = input.compareLabel;
    $('.alt-label-mirror').textContent = input.compareLabel;
    $('#alternative-compare-cost').textContent = euro(compareCost);
    $('#alternative-compare-energy').textContent = `${comparisonKWh.toFixed(3)} kWh alternate energy`;
    const delta = compareCost - result.totalCost;
    const deltaEl = $('#comparison-delta');
    deltaEl.className = 'comparison-delta';
    if (!comparisonKWh) deltaEl.textContent = 'Enter alternative energy to compare electricity cost.';
    else if (Math.abs(delta) < 0.005) deltaEl.textContent = 'Both configurations have approximately equal electricity cost.';
    else { deltaEl.classList.add(delta < 0 ? 'good' : 'bad'); const relative = result.totalCost > 0 ? ` (${(Math.abs(delta) / result.totalCost * 100).toFixed(1)}%)` : ''; deltaEl.textContent = `${input.compareLabel} ${delta < 0 ? 'saves' : 'costs'} ${euro(Math.abs(delta))}${relative} per compared job.`; }

    $('#cpu-cost').textContent = euro(result.cpuCost);
    $('#gpu-cost').textContent = euro(result.gpuCost);
    $('#prep-total-cost').textContent = euro(result.prepCost);
    $('#prep-user-cost').textContent = euro(result.prepShare);
    $('#prep-download-cost').textContent = euro(result.prepCostPerDownload);
    $('#training-user-cost').textContent = euro(result.trainingCostPerUser);
    $('#per-gpu-cost').textContent = euro(result.costPerGpu);
    $('#allocation-cost').textContent = euro(result.prepShare);
    const methodDescription = { equal: `equal allocation across ${result.sharingUsers} users`, usage: `${Math.min(100, input.usageShare)}% usage share`, owner: 'full cost assigned to dataset owner' }[result.allocationMethod];
    $('#allocation-explainer').textContent = input.allocationEnabled
      ? `Dataset preparation: ${result.prepKWh.toFixed(5)} IT kWh · ${input.downloads} downloads (${euro(result.prepCostPerDownload)} preparation cost per download) · ${methodDescription}. Training energy is attributed to ${input.user}; preparation allocation is shown separately.`
      : 'Dataset preparation allocation is turned off. Training and preparation remain separate.';
    $('#export-button').disabled = false;
  } catch (error) {
    $('#measurement-note-text').textContent = error.message;
  }
}

function csvCell(value) { const text = String(value ?? ''); return `"${text.replaceAll('"', '""')}"`; }
function downloadCsv() {
  if (!validate()) { form.querySelector('[aria-invalid="true"]')?.focus(); return; }
  const input = readInput();
  const result = calculate(input);
  const headers = ['BillingAccountName','BillingAccountId','ResourceName','ResourceType','UsageQuantity','UsageUnit','EnergyConsumed','EnergyUnit','ElectricityCost','BillingCurrency','TrainingPhase','Model','Dataset','TrainingRun','UserOrTeam','AllocationMethod','DataStatus','PUE','ElectricityTariffPerKWh','TrainingRunCount','DatasetSizeGB','NumberOfGPUs','DatasetDownloads'];
  const rows = result.phaseRows.map(phase => [
    'Research HPC', '', `${input.runId || 'training-job'} / ${phase.id}`, 'HPC training phase', phase.energyKWh * result.pue, 'kWh', phase.energyKWh, 'kWh', phase.cost, 'EUR', phase.label, input.model, input.dataset, input.runId, input.user, input.allocationMethod, phase.energyKWh ? phase.status : 'Not entered', result.pue, result.tariff, result.runCount, result.datasetSize, input.gpuCount, input.downloads,
  ]);
  if (result.prepKWh) rows.push(['Research HPC', '', `${input.dataset} / preparation`, 'Shared dataset preparation', result.prepKWh * result.pue, 'kWh', result.prepKWh, 'kWh', result.prepCost, 'EUR', 'Dataset preparation', input.model, input.dataset, input.runId, input.user, input.allocationMethod, 'Manually entered / illustrative', result.pue, result.tariff, result.runCount, result.datasetSize, input.gpuCount, input.downloads]);
  const preface = [
    ['Report type', 'FOCUS-compatible research export — not an officially validated FOCUS dataset'],
    ['Job total energy basis', result.measurementBasis],
    ['Job IT energy (kWh)', result.totalKWh],
    ['Job facility energy (kWh; includes PUE)', result.facilityKWh],
    ['Job electricity cost (EUR)', result.totalCost],
    ['CPU energy source', input.cpuStatus],
    ['GPU energy source', input.gpuStatus],
    ...(input.totalEnergy !== '' ? [['Explicit total energy source', input.totalStatus]] : []),
    ['CPU + GPU component energy (IT kWh)', result.cpuGpuSum],
    ['Job total minus CPU + GPU components (IT kWh; reconciliation difference)', result.totalKWh - result.cpuGpuSum],
    ['Phase-attributed energy subtotal (IT kWh)', result.phaseTotalKWh],
    ['Phase-attributed electricity cost subtotal (EUR; may differ from the independent job-meter total)', result.phaseRows.reduce((sum, row) => sum + row.cost, 0)],
    ['Job-total minus phase-attributed cost (EUR; reconciliation difference)', result.totalCost - result.phaseRows.reduce((sum, row) => sum + row.cost, 0)],
    ['Dataset preparation allocation per user (EUR; separate from training)', result.prepShare],
    [],
  ].map(row => row.map(csvCell).join(',')).join('\r\n');
  const csv = `${preface}\r\n${headers.map(csvCell).join(',')}\r\n${rows.map(row => row.map(csvCell).join(',')).join('\r\n')}`;
  const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${(input.runId || 'hpc-training-cost').replace(/[^a-z0-9_-]+/gi, '-')}-focus-compatible.csv`;
  document.body.append(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

function reset() {
  $('#tariff').value = sample.tariff; $('#pue').value = sample.pue;
  $('#cpu-energy').value = sample.cpu; $('#cpu-unit').value = 'J';
  $('#cpu-status').value = 'Illustrative estimate';
  $('#gpu-energy').value = sample.gpu; $('#gpu-unit').value = 'J'; $('#gpu-status').value = 'Illustrative estimate';
  $('#total-energy-input').value = ''; $('#total-unit').value = 'J'; $('#total-status').value = 'Illustrative estimate';
  $('#model').value = sample.model; $('#dataset').value = sample.dataset; $('#run-id').value = sample.runId;
  $('#user').value = sample.user; $('#gpu-count').value = sample.gpuCount; $('#run-count').value = sample.runCount;
  $('#epochs').value = sample.epochs; $('#dataset-size').value = sample.datasetSize;
  for (const phase of PHASES) { $(`[data-phase="${phase.id}"]`).value = sample.phases[phase.id]; $(`[data-phase-unit="${phase.id}"]`).value = 'J'; $(`[data-phase-status="${phase.id}"]`).value = 'Illustrative estimate'; }
  $('#allocation-enabled').checked = true; $('#prep-energy').value = sample.prepEnergy; $('#prep-unit').value = 'J';
  $('#sharing-users').value = sample.sharingUsers; $('#downloads').value = sample.downloads;
  $('#allocation-method').value = 'equal'; $('#usage-share').value = sample.usageShare;
  $('#compare-label').value = 'Local disk'; $('#compare-energy').value = sample.compareEnergy;
  $('#compare-unit').value = 'J'; $('#compare-tariff').value = '';
  render();
}

form.addEventListener('input', render);
form.addEventListener('change', render);
$('#reset-button').addEventListener('click', reset);
$('#export-button').addEventListener('click', downloadCsv);
render();
