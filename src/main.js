import { calculate, PHASES, toKWh } from './calc.js';
import { buildFocusCsv } from './focus.js';

const $ = selector => document.querySelector(selector);
const form = $('#calculator-form');
const euro = value => new Intl.NumberFormat('en-IE', {
  style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2,
}).format(Number.isFinite(value) ? value : 0);
const kwh = value => `${Number(value || 0).toFixed(3)} kWh`;
const number = (selector, fallback = 0) => {
  const raw = $(selector).value;
  return raw === '' ? fallback : Number(raw);
};
const mode = () => $('input[name="mode"]:checked').value;

const sample = {
  tariff: '0.24', pue: '1.35', total: '198000000', cpu: '54000000', gpu: '144000000',
  model: 'ResNet-50', dataset: 'ImageNet-1K', runId: 'resnet50-2025-001', user: 'Research group',
  gpuCount: '4', runCount: '1', epochs: '20', datasetSize: '138', prepEnergy: '36000000',
  sharingUsers: '6', downloads: '12', usageShare: '20', compareCurrent: '198000000',
  compareEnergy: '180000000', phases: Object.fromEntries(PHASES.map(phase => [phase.id, phase.sampleJ])),
};

function mountPhaseInputs() {
  $('#phase-inputs').innerHTML = PHASES.map(phase => `
    <div class="phase-row">
      <label class="phase-name" for="phase-${phase.id}">${phase.label}<small>${phase.group.toUpperCase()}</small></label>
      <span class="phase-controls">
        <input id="phase-${phase.id}" data-phase="${phase.id}" type="number" min="0" step="any" value="${sample.phases[phase.id]}" inputmode="decimal" aria-label="${phase.label} energy" />
        <select data-phase-unit="${phase.id}" aria-label="${phase.label} unit"><option value="J">J</option><option value="kWh">kWh</option></select>
        <select data-phase-status="${phase.id}" aria-label="${phase.label} data status"><option>Illustrative estimate</option><option>Manual estimate</option><option>Measured</option></select>
      </span>
    </div>`).join('');
}
mountPhaseInputs();

function readInput() {
  const selectedMode = mode();
  const componentOverride = selectedMode === 'components' && $('#component-total-details').open && $('#component-total-input').value !== '';
  const totalEnergy = selectedMode === 'total'
    ? $('#total-energy-input').value
    : selectedMode === 'compare'
      ? $('#compare-current-energy').value
      : componentOverride ? $('#component-total-input').value : '';
  const totalUnit = selectedMode === 'total'
    ? $('#total-unit').value
    : selectedMode === 'compare'
      ? $('#compare-current-unit').value
      : componentOverride ? $('#component-total-unit').value : 'J';
  const phaseValues = selectedMode === 'phases'
    ? Object.fromEntries(PHASES.map(phase => [phase.id, {
      value: $(`[data-phase="${phase.id}"]`).value,
      unit: $(`[data-phase-unit="${phase.id}"]`).value,
      status: $(`[data-phase-status="${phase.id}"]`).value,
    }]))
    : {};
  const compareEnergy = $('#compare-energy').value;
  const compareUnit = $('#compare-unit').value;
  return {
    mode: selectedMode,
    tariff: number('#tariff'),
    pue: number('#pue', 1),
    cpuEnergy: selectedMode === 'components' ? $('#cpu-energy').value : '',
    cpuUnit: $('#cpu-unit').value,
    cpuStatus: $('#cpu-status').value,
    gpuEnergy: selectedMode === 'components' ? $('#gpu-energy').value : '',
    gpuUnit: $('#gpu-unit').value,
    gpuStatus: $('#gpu-status').value,
    totalEnergy,
    totalUnit,
    totalStatus: selectedMode === 'components' && componentOverride
      ? $('#component-total-status').value
      : selectedMode === 'total' ? $('#total-status').value : 'Manual estimate',
    model: $('#model').value.trim() || 'Unnamed model',
    dataset: $('#dataset').value.trim() || 'Unnamed dataset',
    runId: $('#run-id').value.trim(),
    user: $('#user').value.trim() || 'Unassigned',
    gpuCount: number('#gpu-count', 1),
    runCount: number('#run-count', 1),
    epochs: number('#epochs', 1),
    datasetSize: number('#dataset-size'),
    phases: phaseValues,
    allocationEnabled: $('#allocation-enabled').checked,
    prepEnergy: $('#prep-energy').value,
    prepUnit: $('#prep-unit').value,
    sharingUsers: number('#sharing-users', 1),
    downloads: number('#downloads', 1),
    allocationMethod: $('#allocation-method').value,
    usageShare: number('#usage-share', 0),
    compareEnergy,
    compareUnit,
    compareKWh: compareEnergy === '' ? 0 : toKWh(compareEnergy, compareUnit),
    compareCurrentEnergy: selectedMode === 'compare' ? $('#compare-current-energy').value : '',
    compareCurrentUnit: $('#compare-current-unit').value,
    compareCurrentKWh: selectedMode === 'compare'
      ? toKWh($('#compare-current-energy').value || 0, $('#compare-current-unit').value)
      : 0,
    compareLabel: $('#compare-label').value,
    compareTariff: $('#compare-tariff').value,
  };
}

function validate() {
  let valid = true;
  const wholeNumberFields = new Set(['gpu-count', 'run-count', 'epochs', 'sharing-users', 'downloads']);
  const errors = [];
  form.querySelectorAll('[aria-invalid="true"]').forEach(element => element.removeAttribute('aria-invalid'));
  form.querySelectorAll('input[type="number"]').forEach(element => {
    if (element.closest('[hidden]') || element.closest('details:not([open])')) return;
    const value = element.value === '' ? null : Number(element.value);
    const min = Number(element.min || 0);
    const max = element.max === '' ? Infinity : Number(element.max);
    const badRange = (value === null && min > 0) || (value !== null && (!Number.isFinite(value) || value < min || value > max));
    const badWhole = value !== null && wholeNumberFields.has(element.id) && !Number.isInteger(value);
    const badStep = value !== null && !wholeNumberFields.has(element.id) && element.step && element.step !== 'any'
      && Number.isFinite(value) && Math.abs((value - min) / Number(element.step) - Math.round((value - min) / Number(element.step))) > 1e-8;
    if (badRange || badWhole || badStep) {
      element.setAttribute('aria-invalid', 'true');
      valid = false;
      const label = element.getAttribute('aria-label') || element.closest('.field')?.querySelector(':scope > span')?.textContent.trim() || element.name || 'A number field';
      errors.push(`${label}: ${badWhole ? 'enter a whole number' : badRange ? `enter a value from ${min}${Number.isFinite(max) ? ` to ${max}` : ''}` : `use increments of ${element.step}`}.`);
    }
  });
  $('#validation-message').textContent = valid ? '' : `Results below are stale until corrected. ${errors[0] || 'Check the highlighted value.'}`;
  $('#validation-message').hidden = valid;
  $('.summary-grid').classList.toggle('is-stale', !valid);
  $('.results-column').classList.toggle('is-stale', !valid);
  return valid;
}

function syncModeUi() {
  const selectedMode = mode();
  document.querySelectorAll('[data-mode-panel]').forEach(panel => {
    panel.hidden = panel.dataset.modePanel !== selectedMode;
  });
  $('#energy-card').hidden = selectedMode !== 'components';
  $('#breakdown').hidden = selectedMode !== 'phases';
  $('#comparison-card').hidden = selectedMode !== 'compare';
  $('#allocation-fields').hidden = !$('#allocation-enabled').checked;
  $('#allocation-result-card').hidden = !$('#allocation-enabled').checked;
  $('#usage-share-field').hidden = $('#allocation-method').value !== 'usage';
}

function render() {
  syncModeUi();
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
    $('#epochs-context').textContent = `${result.epochs} epochs per run`;

    $('#it-energy').textContent = result.totalKWh.toFixed(3);
    $('#cpu-display').textContent = kwh(result.cpuKWh);
    $('#gpu-display').textContent = kwh(result.gpuKWh);
    $('#facility-display').textContent = kwh(result.facilityKWh);
    const circumference = 2 * Math.PI * 59;
    const componentTotal = result.cpuKWh + result.gpuKWh;
    const cpuFraction = componentTotal ? result.cpuKWh / componentTotal : 0;
    $('#energy-donut .donut-cpu').style.strokeDasharray = componentTotal ? `${circumference * cpuFraction} ${circumference}` : `0 ${circumference}`;
    $('#energy-donut .donut-cpu').style.strokeDashoffset = '0';
    $('#energy-donut .donut-gpu').style.strokeDasharray = componentTotal ? `${circumference * (1 - cpuFraction)} ${circumference}` : `0 ${circumference}`;
    $('#energy-donut .donut-gpu').style.strokeDashoffset = `${-circumference * cpuFraction}`;
    let measurementNote = `${result.measurementBasis} used for the job total. CPU: ${input.cpuStatus.toLowerCase()}; GPU: ${input.gpuStatus.toLowerCase()}.`;
    if (result.componentMismatch) measurementNote += ' The total meter differs from CPU + GPU; check the readings.';
    $('#measurement-note-text').textContent = measurementNote;

    const phaseRows = result.phaseRows;
    const maxCost = Math.max(...phaseRows.map(row => row.cost), 0);
    $('#phase-chart').innerHTML = phaseRows.map(row => `
      <div class="chart-row"><span class="chart-label" title="${row.label}">${row.label}</span>
      <span class="chart-track"><i class="chart-bar" style="width:${maxCost ? Math.max(row.cost / maxCost * 100, row.cost > 0 ? 1 : 0) : 0}%"></i></span>
      <span class="chart-value">${euro(row.cost)}</span></div>`).join('');
    $('#phase-table-body').innerHTML = phaseRows.map(row => `<tr><td>${row.label}</td><td>${row.energyKWh.toFixed(5)}</td><td>${euro(row.cost)}</td><td>${row.energyKWh ? row.status : 'Not entered'}</td></tr>`).join('');
    const largest = result.biggestPhase;
    $('#largest-phase').textContent = largest && largest.energyKWh > 0 ? largest.label : 'No phase energy entered';
    $('#largest-phase-note').textContent = largest && largest.energyKWh > 0 ? `${largest.energyKWh.toFixed(3)} kWh · execution phase` : 'Enter phase values for attribution';
    $('#largest-phase-cost').textContent = euro(largest?.cost || 0);

    const compareTariff = input.compareTariff === '' ? result.tariff : Number(input.compareTariff);
    const alternativeCost = input.compareKWh * result.pue * compareTariff;
    $('#current-label').textContent = `${input.model} · ${input.dataset}`;
    $('#current-compare-cost').textContent = euro(result.totalCost);
    $('#current-compare-energy').textContent = `${result.totalKWh.toFixed(3)} kWh · current`;
    $('#alternative-label').textContent = input.compareLabel;
    $('.alt-label-mirror').textContent = input.compareLabel;
    $('#alternative-compare-cost').textContent = euro(alternativeCost);
    $('#alternative-compare-energy').textContent = `${input.compareKWh.toFixed(3)} kWh · alternative`;
    const difference = alternativeCost - result.totalCost;
    const differenceElement = $('#comparison-delta');
    differenceElement.className = 'comparison-delta';
    if (input.compareEnergy === '') differenceElement.textContent = 'Enter alternative energy to compare costs.';
    else if (Math.abs(difference) < 0.005) differenceElement.textContent = 'Both configurations have approximately equal estimated cost.';
    else {
      differenceElement.classList.add(difference < 0 ? 'good' : 'bad');
      const relative = result.totalCost > 0 ? ` (${(Math.abs(difference) / result.totalCost * 100).toFixed(1)}%)` : '';
      differenceElement.textContent = `${input.compareLabel} ${difference < 0 ? 'saves' : 'costs'} ${euro(Math.abs(difference))}${relative} per compared job.`;
    }

    $('#prep-total-cost').textContent = euro(result.prepCost);
    $('#prep-user-cost').textContent = euro(result.prepShare);
    $('#prep-download-cost').textContent = euro(result.prepCostPerDownload);
    $('#training-user-cost').textContent = euro(result.trainingCostPerUser);
    $('#per-gpu-cost').textContent = euro(result.costPerGpu);
    const allocationDescription = {
      equal: `equal allocation across ${result.sharingUsers} users`,
      usage: `${Math.min(100, input.usageShare)}% usage share`,
      owner: 'full cost assigned to dataset owner',
    }[result.allocationMethod];
    $('#allocation-explainer').textContent = input.allocationEnabled
      ? `Preparation remains separate from training. ${input.downloads} downloads · ${euro(result.prepCostPerDownload)} per download · ${allocationDescription}.`
      : '';
    $('#export-button').disabled = false;
  } catch (error) {
    $('#measurement-note-text').textContent = error.message;
    $('#export-button').disabled = true;
  }
}

function downloadCsv() {
  if (!validate()) {
    form.querySelector('[aria-invalid="true"]')?.focus();
    return;
  }
  const input = readInput();
  const result = calculate(input);
  const csv = buildFocusCsv(input, result, input.mode);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const fileName = (input.runId || 'hpc-training-cost').replace(/[^a-z0-9_-]+/gi, '-');
  link.href = url;
  link.download = `${fileName}-focus-1.4-cost-and-usage.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function reset() {
  $('input[name="mode"][value="total"]').checked = true;
  $('#tariff').value = sample.tariff;
  $('#pue').value = sample.pue;
  $('#total-energy-input').value = sample.total;
  $('#total-unit').value = 'J';
  $('#total-status').value = 'Illustrative estimate';
  $('#cpu-energy').value = sample.cpu;
  $('#cpu-unit').value = 'J';
  $('#cpu-status').value = 'Illustrative estimate';
  $('#gpu-energy').value = sample.gpu;
  $('#gpu-unit').value = 'J';
  $('#gpu-status').value = 'Illustrative estimate';
  $('#component-total-details').open = false;
  $('#component-total-input').value = '';
  $('#component-total-unit').value = 'J';
  $('#component-total-status').value = 'Illustrative estimate';
  $('#compare-current-energy').value = sample.compareCurrent;
  $('#compare-current-unit').value = 'J';
  $('#compare-label').value = 'Local disk';
  $('#compare-energy').value = sample.compareEnergy;
  $('#compare-unit').value = 'J';
  $('#compare-tariff').value = '';
  $('#model').value = sample.model;
  $('#dataset').value = sample.dataset;
  $('#run-id').value = sample.runId;
  $('#user').value = sample.user;
  $('#gpu-count').value = sample.gpuCount;
  $('#run-count').value = sample.runCount;
  $('#epochs').value = sample.epochs;
  $('#dataset-size').value = sample.datasetSize;
  for (const phase of PHASES) {
    $(`[data-phase="${phase.id}"]`).value = sample.phases[phase.id];
    $(`[data-phase-unit="${phase.id}"]`).value = 'J';
    $(`[data-phase-status="${phase.id}"]`).value = 'Illustrative estimate';
  }
  $('#allocation-enabled').checked = false;
  $('#prep-energy').value = sample.prepEnergy;
  $('#prep-unit').value = 'J';
  $('#sharing-users').value = sample.sharingUsers;
  $('#downloads').value = sample.downloads;
  $('#allocation-method').value = 'equal';
  $('#usage-share').value = sample.usageShare;
  render();
}

form.addEventListener('input', render);
form.addEventListener('change', render);
$('#reset-button').addEventListener('click', reset);
$('#export-button').addEventListener('click', downloadCsv);
render();
