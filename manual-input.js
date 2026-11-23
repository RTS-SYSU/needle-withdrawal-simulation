'use strict';

function mountManualInput(onChange) {
  const element = id => document.getElementById(id);
  const motors = element('manual-motors');
  const motorInputs = LIMITS.map(([min, max], i) => {
    const name = 'Q' + (i + 1);
    const id = 'manual-q' + (i + 1);
    const row = document.createElement('div');
    row.className = 'manual-motor';
    row.innerHTML = `
      <div class="manual-motor-heading">
        <label for="${id}">${name}</label>
        <input id="${id}" type="number" min="${min}" max="${max}" step="any" required>
      </div>
      <input id="${id}-slider" type="range" min="${min}" max="${max}" step="1" aria-label="${name} 电机初值滑块">
      <div class="manual-limits"><span>${min}</span><span>${max}</span></div>
    `;
    const number = row.querySelector('input[type=number]');
    const slider = row.querySelector('input[type=range]');
    number.value = slider.value = INITIAL_Q[i];
    number.addEventListener('input', () => {
      if (number.validity.valid) slider.value = number.value;
      onChange();
    });
    slider.addEventListener('input', () => {
      number.value = slider.value;
      onChange();
    });
    motors.append(row);
    return number;
  });

  const centerInputs = ['x', 'y', 'z'].map(axis => element('manual-center-' + axis));
  const angles = ['manual-phi', 'manual-azimuth'].map(element);
  const centerStatus = element('manual-center-status');
  const error = element('manual-error');

  function applyCapCenter() {
    const center = centerOnCap(...angles.map(input => input.valueAsNumber));
    centerInputs.forEach((input, i) => { input.value = String(Number((center[i] / 1000).toFixed(6))); });
  }

  applyCapCenter();
  for (const input of centerInputs) input.addEventListener('input', onChange);
  for (const input of angles) {
    input.addEventListener('input', () => {
      element(input.id + '-value').textContent = input.valueAsNumber.toFixed(1) + '°';
      applyCapCenter();
      onChange();
    });
  }

  return function readInitialState() {
    const invalidMotor = motorInputs.find(input => !input.validity.valid);
    const validCenter = centerInputs.every(input => input.validity.valid);
    [...motorInputs, ...centerInputs].forEach(input => {
      input.setAttribute('aria-invalid', String(!input.validity.valid));
    });
    const center = validCenter ? centerInputs.map(input => input.valueAsNumber * 1000) : null;
    const centerAllowed = validCenter && describe(INITIAL_Q, center).centerAllowed;
    centerStatus.textContent = !validCenter ? '' :
      centerAllowed ? '球心在允许球冠上' : '球心不在允许球冠上';
    centerStatus.classList.toggle('warning', validCenter && !centerAllowed);
    centerStatus.hidden = !validCenter;

    if (invalidMotor) {
      error.textContent = `请将 ${invalidMotor.labels[0].textContent} 设在 ${invalidMotor.min}～${invalidMotor.max} μm。`;
    } else {
      error.textContent = validCenter ? '' : '球心 XYZ 须填写 −10000～10000 mm 内的数值。';
    }
    error.hidden = !error.textContent;
    if (invalidMotor || !validCenter) return null;
    const q = motorInputs.map(input => input.valueAsNumber);
    return {id: '手动初态', algorithm: ORDINARY_EXIT, branch: null, computedBranch: selectBranch(q), q, center};
  };
}
