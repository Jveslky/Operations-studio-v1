(() => {
  'use strict';
  const KEY = 'trackRight.commercialFleet.concept.v1';
  const $ = id => document.getElementById(id);
  const money = n => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
  const number = value => Math.max(0, Number(value) || 0);
  const uid = () => crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2);
  let data = { units: [], services: [], schedules: [], repairs: [], reminders: [], accounts: [] };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    if (Array.isArray(saved.units) && Array.isArray(saved.services)) data = saved;
  } catch (_) { /* Fresh local concept. */ }
  for (const field of ['units', 'services', 'schedules', 'repairs', 'reminders', 'accounts']) {
    if (!Array.isArray(data[field])) data[field] = [];
  }
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
  const unitLink = unit => {
    const link = node('a', unit?.name || 'Unknown unit', 'unit-link');
    link.href = unit ? `units.html#unit-${unit.id}` : 'units.html';
    return link;
  };
  const reading = unit => unit.meterType === 'none' ? 'No meter' : `${number(unit.meter).toLocaleString()} ${unit.meterType}`;
  const due = unit => (unit.meterType !== 'none' && unit.next !== null && unit.meter >= unit.next) || (unit.nextDate && unit.nextDate <= new Date().toISOString().slice(0, 10));
  const pm = unit => {
    if (due(unit)) return 'PM due now';
    if (unit.meterType === 'none' || unit.next === null) return unit.nextDate ? `PM by ${unit.nextDate}` : 'PM not scheduled';
    const remaining = unit.next - unit.meter;
    return `${remaining.toLocaleString()} ${unit.meterType} to PM` + (unit.nextDate ? ` / ${unit.nextDate}` : '');
  };
  function render() {
    if ($('unit-count')) $('unit-count').textContent = data.units.filter(unit => unit.status === 'active').length;
    if ($('due-count')) $('due-count').textContent = data.units.filter(due).length;
    if ($('down-count')) $('down-count').textContent = data.units.filter(unit => unit.status === 'down').length;
    if ($('spend-total')) $('spend-total').textContent = money(data.services.reduce((sum, service) => sum + service.cost, 0));
    if ($('scheduled-count')) $('scheduled-count').textContent = data.schedules.filter(item => !item.done).length;
    if ($('repair-count')) $('repair-count').textContent = data.repairs.filter(item => item.status !== 'Closed').length;
    if ($('service-unit')) {
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
    }
    if ($('attention')) {
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
    }
    if ($('units-list')) {
    const units = $('units-list');
    units.replaceChildren();
    if (!data.units.length) empty(units, 'No units yet. Add your first truck, trailer, or machine above.');
    for (const unit of data.units) {
      const row = node('div', undefined, 'row ' + (unit.status === 'down' ? 'down' : ''));
      const info = node('div');
      row.id = `unit-${unit.id}`;
      const title = node('strong'); title.append(unitLink(unit));
      info.append(title, node('small', `${unit.type} · ${unit.division || 'Unassigned division'} · ${unit.location || 'Unassigned location'} · ${reading(unit)} · ${pm(unit)}`));
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
      if (unit.trackingUrl && /^https?:\/\//i.test(unit.trackingUrl)) {
        const tracking = node('a', 'Tracking ↗', 'secondary');
        tracking.href = unit.trackingUrl;
        tracking.target = '_blank'; tracking.rel = 'noopener noreferrer';
        actions.append(tracking);
      }
      row.append(info, actions);
      units.append(row);
    }
    }
    if ($('service-list')) {
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
    }
    if ($('unit-metrics')) {
    const table = $('unit-metrics');
    table.replaceChildren();
    if (!data.units.length) {
      const tr = node('tr'); const td = node('td', 'Add units to see cost and downtime by asset.');
      td.colSpan = 5; tr.append(td); table.append(tr);
    }
    for (const unit of data.units) {
      const records = data.services.filter(record => record.unitId === unit.id);
      const tr = node('tr');
      const first = node('td'); first.append(unitLink(unit)); tr.append(first);
      for (const cell of [`${unit.type} / ${unit.division || '—'}`, money(records.reduce((sum, record) => sum + record.cost, 0)), `${records.reduce((sum, record) => sum + record.down, 0)} hr`, pm(unit)]) tr.append(node('td', cell));
      table.append(tr);
    }
    }
    renderExtra();
    renderDashboard();
  }
  function renderDashboard() {
    if (!$('readiness-rate')) return;
    const today = new Date();
    const localDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const period = $('dashboard-period').value;
    const from = new Date(today.getFullYear(), today.getMonth(), 1);
    if (period === '30') from.setTime(today.getTime() - 29 * 86400000);
    const start = period === 'all' ? '' : localDate(from);
    const periodLabel = period === 'month' ? 'This month' : period === '30' ? 'Last 30 days' : 'All recorded time';
    const records = data.services.filter(item => !start || item.date >= start);
    const spend = records.reduce((sum, item) => sum + number(item.cost), 0);
    const downtime = records.reduce((sum, item) => sum + number(item.down), 0);
    const available = data.units.filter(unit => unit.status === 'active').length;
    const fleetSize = data.units.length;
    const dueUnits = data.units.filter(due);
    const urgent = data.repairs.filter(item => item.status !== 'Closed' && item.priority === 'Urgent').length;
    const nextWeek = localDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7));
    const upcoming = data.schedules.filter(item => !item.done && item.when.slice(0, 10) >= localDate(today) && item.when.slice(0, 10) <= nextWeek).length;
    const rate = fleetSize ? Math.round(available / fleetSize * 100) + '%' : '—';
    $('readiness-rate').textContent = rate;
    $('readiness-detail').textContent = fleetSize ? `${available} of ${fleetSize} units marked available` : 'Add units to calculate readiness';
    $('fleet-size-detail').textContent = `of ${fleetSize} units`;
    $('urgent-detail').textContent = `${urgent} urgent`;
    $('schedule-detail').textContent = `${upcoming} in next 7 days`;
    $('spend-total').textContent = money(spend);
    $('period-spend').textContent = money(spend);
    $('spend-period-label').textContent = periodLabel;
    $('cost-period-label').textContent = periodLabel;
    $('downtime-hours').textContent = `${downtime.toLocaleString()} hr`;
    $('downtime-context').textContent = records.length ? `Across ${records.length} completed maintenance entr${records.length === 1 ? 'y' : 'ies'}` : 'No completed maintenance recorded in this period';
    $('as-of-label').textContent = `Local records · ${today.toLocaleDateString()}`;
    let comparison = 'Choose a time period to compare';
    if (period !== 'all') {
      const priorEnd = new Date(from.getTime() - 86400000);
      const priorStart = period === 'month' ? new Date(from.getFullYear(), from.getMonth() - 1, 1) : new Date(priorEnd.getTime() - 29 * 86400000);
      const previous = data.services.filter(item => item.date >= localDate(priorStart) && item.date <= localDate(priorEnd));
      const priorSpend = previous.reduce((sum, item) => sum + number(item.cost), 0);
      comparison = `${money(priorSpend)} in prior comparable period`;
    }
    $('spend-comparison').textContent = comparison;
    const byDivision = new Map();
    for (const item of records) {
      const unit = data.units.find(u => u.id === item.unitId);
      const label = unit?.division || 'Unassigned';
      byDivision.set(label, (byDivision.get(label) || 0) + number(item.cost));
    }
    const bars = $('spend-bars'); bars.replaceChildren();
    const divisions = [...byDivision].sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (!divisions.length) empty(bars, 'Log maintenance to see spending by division.');
    for (const [name, value] of divisions) {
      const row = node('div', undefined, 'spend-row');
      row.append(node('span', name));
      const track = node('div', undefined, 'spend-track');
      const fill = node('div', undefined, 'spend-fill');
      fill.style.width = `${spend ? value / spend * 100 : 0}%`;
      track.append(fill);
      row.append(track, node('strong', money(value)));
      bars.append(row);
    }
    const types = $('fleet-breakdown'); types.replaceChildren();
    for (const type of ['Truck', 'Trailer', 'Equipment']) {
      const units = data.units.filter(unit => unit.type === type);
      if (!units.length) continue;
      const row = node('div', undefined, 'readiness-item');
      row.append(node('strong', type + 's'), node('span', `${units.filter(u => u.status === 'active').length} / ${units.length} available`));
      types.append(row);
    }
    if (!types.children.length) empty(types, 'Add fleet units for an availability breakdown.');
    const points = [];
    points.push(fleetSize ? `${available} of ${fleetSize} units marked available (${rate}).` : 'No fleet units recorded yet.');
    points.push(`${dueUnits.length} unit${dueUnits.length === 1 ? '' : 's'} due for PM; ${data.units.filter(u => u.status === 'down').length} marked out of service.`);
    points.push(`${data.repairs.filter(r => r.status !== 'Closed').length} open repairs (${urgent} urgent); ${upcoming} visits scheduled in the next 7 days.`);
    points.push(`${money(spend)} maintenance spend and ${downtime.toLocaleString()} downtime hours recorded for ${periodLabel.toLowerCase()}.`);
    const brief = $('manager-brief'); brief.replaceChildren();
    points.forEach((point, index) => {
      const row = node('div', undefined, 'brief-point');
      row.append(node('span', String(index + 1).padStart(2, '0')), node('p', point));
      brief.append(row);
    });
    $('copy-brief').onclick = async () => {
      try {
        await navigator.clipboard.writeText('Commercial Fleet · ' + today.toLocaleDateString() + '\n' + points.join('\n'));
        $('copy-brief').textContent = 'Copied';
        setTimeout(() => { $('copy-brief').textContent = 'Copy brief'; }, 1800);
      } catch (_) { $('copy-brief').textContent = 'Copy unavailable'; }
    };
  }
  function fillUnitSelect(id) {
    const select = $(id);
    if (!select) return;
    const previous = select.value;
    select.replaceChildren();
    const placeholder = node('option', 'Select a unit'); placeholder.value = '';
    select.append(placeholder);
    for (const unit of data.units) {
      const option = node('option', unit.name); option.value = unit.id; select.append(option);
    }
    if (data.units.some(unit => unit.id === previous)) select.value = previous;
  }
  function linkedRow(unit, title, detail, action) {
    const row = node('div', undefined, 'row');
    const info = node('div');
    const heading = node('strong', title);
    const line = node('small'); line.append(unitLink(unit), document.createTextNode(' · ' + detail));
    info.append(heading, line); row.append(info);
    if (action) row.append(action);
    return row;
  }
  function renderExtra() {
    for (const id of ['schedule-unit', 'repair-unit', 'reminder-unit']) fillUnitSelect(id);
    const schedules = $('schedule-list');
    if (schedules) {
      schedules.replaceChildren();
      if (!data.schedules.length) empty(schedules, 'No visits scheduled yet.');
      for (const item of [...data.schedules].sort((a, b) => a.when.localeCompare(b.when))) {
        const unit = data.units.find(u => u.id === item.unitId);
        const button = node('button', item.done ? 'Reopen' : 'Complete', 'secondary');
        button.type = 'button';
        button.onclick = () => { item.done = !item.done; save(); render(); };
        const row = linkedRow(unit, item.title, `${item.when.replace('T', ' ')} · ${item.assigned || 'Unassigned'} · ${item.done ? 'Done' : 'Planned'}`, button);
        schedules.append(row);
      }
    }
    const repairs = $('repair-list');
    if (repairs) {
      repairs.replaceChildren();
      if (!data.repairs.length) empty(repairs, 'No repair issues logged yet.');
      for (const item of data.repairs) {
        const unit = data.units.find(u => u.id === item.unitId);
        const select = node('select');
        select.setAttribute('aria-label', `Status for ${item.title}`);
        for (const label of ['Open', 'In Progress', 'Closed']) {
          const option = node('option', label); select.append(option);
        }
        select.value = item.status;
        select.onchange = () => { item.status = select.value; save(); render(); };
        repairs.append(linkedRow(unit, item.title, `${item.priority} priority · ${item.status}`, select));
      }
    }
    const pmList = $('pm-reminders');
    if (pmList) {
      pmList.replaceChildren();
      const planned = data.units.filter(u => u.next !== null || u.nextDate);
      if (!planned.length) empty(pmList, 'Add a next PM reading or date on the Units page.');
      for (const unit of planned.sort((a, b) => Number(due(b)) - Number(due(a)))) {
        const row = linkedRow(unit, due(unit) ? 'PM due' : 'PM planned', pm(unit));
        if (due(unit)) row.classList.add('warning');
        pmList.append(row);
      }
    }
    const reminders = $('reminder-list');
    if (reminders) {
      reminders.replaceChildren();
      if (!data.reminders.length) empty(reminders, 'No other reminders yet.');
      for (const item of [...data.reminders].sort((a, b) => a.date.localeCompare(b.date))) {
        const unit = data.units.find(u => u.id === item.unitId);
        const button = node('button', item.done ? 'Reopen' : 'Complete', 'secondary');
        button.type = 'button';
        button.onclick = () => { item.done = !item.done; save(); render(); };
        const row = linkedRow(unit, item.title, `${item.date} · ${item.done ? 'Done' : 'Open'}`, button);
        if (!item.done && item.date <= new Date().toISOString().slice(0, 10)) row.classList.add('warning');
        reminders.append(row);
      }
    }
    const accounts = $('account-list');
    if (accounts) {
      accounts.replaceChildren();
      if (!data.accounts.length) empty(accounts, 'No outside service accounts added yet.');
      for (const item of data.accounts) {
        const row = node('div', undefined, 'row');
        const info = node('div');
        info.append(node('strong', item.name), node('small', `${item.type} · ${item.contact || 'No contact reference'}`));
        row.append(info); accounts.append(row);
      }
    }
  }
  if ($('schedule-form')) $('schedule-form').addEventListener('submit', event => {
    event.preventDefault();
    data.schedules.push({ id: uid(), unitId: $('schedule-unit').value, when: $('schedule-when').value, title: $('schedule-title').value.trim(), assigned: $('schedule-assigned').value.trim(), done: false });
    save(); $('schedule-form').reset(); render();
  });
  if ($('repair-form')) $('repair-form').addEventListener('submit', event => {
    event.preventDefault();
    data.repairs.push({ id: uid(), unitId: $('repair-unit').value, title: $('repair-title').value.trim(), priority: $('repair-priority').value, status: 'Open' });
    save(); $('repair-form').reset(); render();
  });
  if ($('reminder-form')) $('reminder-form').addEventListener('submit', event => {
    event.preventDefault();
    data.reminders.push({ id: uid(), unitId: $('reminder-unit').value, title: $('reminder-title').value.trim(), date: $('reminder-date').value, done: false });
    save(); $('reminder-form').reset(); render();
  });
  if ($('account-form')) $('account-form').addEventListener('submit', event => {
    event.preventDefault();
    data.accounts.push({ id: uid(), name: $('account-name').value.trim(), type: $('account-type').value, contact: $('account-contact').value.trim() });
    save(); $('account-form').reset(); render();
  });
  if ($('unit-form')) $('unit-form').addEventListener('submit', event => {
    event.preventDefault();
    const type = $('unit-meter-type').value;
    const nextText = $('unit-next').value;
    data.units.push({
      id: uid(), name: $('unit-name').value.trim(), type: $('unit-type').value,
      division: $('unit-division').value.trim(), location: $('unit-location').value.trim(),
      meterType: type, meter: type === 'none' ? 0 : number($('unit-meter').value),
      next: type === 'none' || nextText === '' ? null : number(nextText), nextDate: $('unit-next-date').value, status: $('unit-status').value,
      trackingUrl: $('unit-tracking-url').value.trim()
    });
    save(); $('unit-form').reset(); render();
  });
  if ($('service-form')) $('service-form').addEventListener('submit', event => {
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
  if ($('service-date')) $('service-date').value = new Date().toISOString().slice(0, 10);
  if ($('export-concept')) $('export-concept').onclick = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), ...data }, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url; link.download = 'commercial-fleet-concept.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  if ($('dashboard-period')) $('dashboard-period').onchange = renderDashboard;
  render();
})();
