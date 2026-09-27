(() => {
  'use strict';
  const KEY = 'trackRight.commercialFleet.concept.v1';
  const $ = id => document.getElementById(id);
  const money = n => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
  const number = value => Math.max(0, Number(value) || 0);
  const uid = () => crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2);
  let data = { units: [], services: [] };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    if (Array.isArray(saved.units) && Array.isArray(saved.services)) data = saved;
  } catch (_) { /* Fresh local concept. */ }
  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify(data)); }
    catch (_) { window.alert('This browser could not save the fleet data.'); }
  };
  const node = (tag, content, className) => {
    const element = document.createElement(tag);
    if (content !== undefined) element.textContent = content;
    if (className) element.className = className;
    return element;
  };
  const empty = (container, message) => container.append(node('div', message, 'empty'));
  const reading = unit => unit.meterType === 'none' ? 'No meter' : `${number(unit.meter).toLocaleString()} ${unit.meterType}`;
  const due = unit => (unit.meterType !== 'none' && unit.next !== null && unit.meter >= unit.next) || (unit.nextDate && unit.nextDate <= new Date().toISOString().slice(0, 10));
  const pm = unit => {
    if (due(unit)) return 'PM due now';
    if (unit.meterType === 'none' || unit.next === null) return unit.nextDate ? `PM by ${unit.nextDate}` : 'PM not scheduled';
    const remaining = unit.next - unit.meter;
    return `${remaining.toLocaleString()} ${unit.meterType} to PM` + (unit.nextDate ? ` / ${unit.nextDate}` : '');
  };
  function render() {
    $('unit-count').textContent = data.units.filter(unit => unit.status === 'active').length;
    $('due-count').textContent = data.units.filter(due).length;
    $('down-count').textContent = data.units.filter(unit => unit.status === 'down').length;
    $('spend-total').textContent = money(data.services.reduce((sum, service) => sum + service.cost, 0));
    const options = $('service-unit');
    const selected = options.value;
    options.replaceChildren(node('option', 'Select a unit'));
    options.firstChild.value = '';
    for (const unit of data.units) {
      const option = node('option', unit.name);
      option.value = unit.id;
      options.append(option);
    }
    if (data.units.some(unit => unit.id === selected)) options.value = selected;
    const attention = $('attention');
    attention.replaceChildren();
    const needing = data.units.filter(unit => unit.status === 'down' || due(unit));
    if (!needing.length) empty(attention, data.units.length ? 'No units marked down or due for PM.' : 'Add a unit to start the fleet overview.');
    for (const unit of needing) {
      const row = node('div', undefined, 'row ' + (unit.status === 'down' ? 'down' : 'warning'));
      const detail = node('div');
      detail.append(node('strong', unit.name), node('small', `${unit.division || 'No division'} · ${unit.location || 'No location'}`));
      row.append(detail, node('span', unit.status === 'down' ? 'Out of service' : pm(unit), 'pill'));
      attention.append(row);
    }
    const units = $('units-list');
    units.replaceChildren();
    if (!data.units.length) empty(units, 'No units yet. Add your first truck, trailer, or machine above.');
    for (const unit of data.units) {
      const row = node('div', undefined, 'row ' + (unit.status === 'down' ? 'down' : ''));
      const info = node('div');
      info.append(node('strong', unit.name), node('small', `${unit.type} · ${unit.division || 'Unassigned division'} · ${unit.location || 'Unassigned location'} · ${reading(unit)} · ${pm(unit)}`));
      const actions = node('div', undefined, 'row-end');
      actions.append(node('span', unit.status === 'down' ? 'Out of service' : 'Available', 'pill'));
      const status = node('button', unit.status === 'down' ? 'Return to service' : 'Mark down', 'secondary');
      status.type = 'button';
      status.onclick = () => { unit.status = unit.status === 'down' ? 'active' : 'down'; save(); render(); };
      const meter = node('button', 'Update meter', 'secondary');
      meter.type = 'button';
      meter.onclick = () => {
        if (unit.meterType === 'none') return;
        const answer = prompt(`Current ${unit.meterType} for ${unit.name}:`, unit.meter);
        if (answer === null) return;
        const value = Number(answer);
        if (!Number.isFinite(value) || value < unit.meter) { alert('Enter a valid reading at or above the current reading.'); return; }
        unit.meter = value; save(); render();
      };
      actions.append(status);
      if (unit.meterType !== 'none') actions.append(meter);
      row.append(info, actions);
      units.append(row);
    }
    const services = $('service-list');
    services.replaceChildren();
    if (!data.services.length) empty(services, 'No completed maintenance recorded yet.');
    for (const record of [...data.services].sort((a, b) => b.date.localeCompare(a.date))) {
      const unit = data.units.find(item => item.id === record.unitId);
      const row = node('div', undefined, 'row');
      const info = node('div');
      info.append(node('strong', record.work), node('small', `${unit?.name || 'Unknown unit'} · ${record.date} · ${record.vendor || 'No vendor'} · ${record.down} downtime hours`));
      row.append(info, node('strong', money(record.cost)));
      services.append(row);
    }
    const table = $('unit-metrics');
    table.replaceChildren();
    if (!data.units.length) {
      const tr = node('tr'); const td = node('td', 'Add units to see cost and downtime by asset.');
      td.colSpan = 5; tr.append(td); table.append(tr);
    }
    for (const unit of data.units) {
      const records = data.services.filter(record => record.unitId === unit.id);
      const tr = node('tr');
      for (const cell of [unit.name, `${unit.type} / ${unit.division || '—'}`, money(records.reduce((sum, record) => sum + record.cost, 0)), `${records.reduce((sum, record) => sum + record.down, 0)} hr`, pm(unit)]) tr.append(node('td', cell));
      table.append(tr);
    }
  }
  $('unit-form').addEventListener('submit', event => {
    event.preventDefault();
    const type = $('unit-meter-type').value;
    const nextText = $('unit-next').value;
    data.units.push({
      id: uid(), name: $('unit-name').value.trim(), type: $('unit-type').value,
      division: $('unit-division').value.trim(), location: $('unit-location').value.trim(),
      meterType: type, meter: type === 'none' ? 0 : number($('unit-meter').value),
      next: type === 'none' || nextText === '' ? null : number(nextText), nextDate: $('unit-next-date').value, status: $('unit-status').value
    });
    save(); $('unit-form').reset(); render();
  });
  $('service-form').addEventListener('submit', event => {
    event.preventDefault();
    const unit = data.units.find(item => item.id === $('service-unit').value);
    if (!unit) { alert('Select a unit first.'); return; }
    const meterText = $('service-meter').value;
    const nextText = $('service-next').value;
    if (unit.meterType !== 'none' && meterText !== '' && number(meterText) < unit.meter) { alert('The service reading cannot be less than the current unit reading.'); return; }
    data.services.push({
      id: uid(), unitId: unit.id, date: $('service-date').value, work: $('service-work').value.trim(),
      vendor: $('service-vendor').value.trim(), cost: number($('service-cost').value), down: number($('service-down').value)
    });
    if (unit.meterType !== 'none' && meterText !== '') unit.meter = number(meterText);
    if (unit.meterType !== 'none' && nextText !== '') unit.next = number(nextText);
    if ($('service-next-date').value) unit.nextDate = $('service-next-date').value;
    save(); $('service-form').reset(); $('service-date').value = new Date().toISOString().slice(0, 10); render();
  });
  $('service-date').value = new Date().toISOString().slice(0, 10);
  $('export-concept').onclick = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), ...data }, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url; link.download = 'commercial-fleet-concept.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  render();
})();
