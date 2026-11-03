// Offline checks: report summaries combine period totals without losing employees or statuses.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/employee-report.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exports = {};
vm.runInNewContext(output, { exports });
const { summarizeEmployees, hasEmployeeActivity } = exports;
const empty = { agent_id: 'a', agent: 'Same name', emp_code: 'EA1', period: '2026-10-01', leads: 0, attempts: 0, calls: 0, connected: 0, talk_seconds: 0, followups_done: 0, enrolled: 0, revenue: 0, statuses: {} };
const rows = [
  { ...empty, leads: '2', attempts: '4', calls: '3', connected: '2', talk_seconds: '90', followups_done: '1', enrolled: '1', revenue: '0.10', statuses: { Interested: '1', Enrolled: '1' } },
  { ...empty, period: '2026-11-01', leads: 3, attempts: 5, calls: 2, connected: 1, talk_seconds: 120, followups_done: 2, enrolled: 1, revenue: '0.20', statuses: { Interested: 2, Enrolled: 1 } },
  { ...empty, period: '2026-12-01' },
  { ...empty, agent_id: 'b', emp_code: 'EA2' },
];
const before = JSON.stringify(rows);
const summary = summarizeEmployees(rows);
assert.equal(summary.length, 2, 'Repeated months become one row for each employee ID');
const employee = summary.find(row => row.agent_id === 'a');
for (const [key, value] of Object.entries({ leads: 5, attempts: 9, calls: 5, connected: 3, talk_seconds: 210, followups_done: 3, enrolled: 2, revenue: 0.3 })) assert.equal(employee[key], value, key);
assert.equal(employee.statuses.Interested, 3);
assert.equal(employee.statuses.Enrolled, 2);
assert.equal(summary.filter(row => row.agent === 'Same name').length, 2, 'Employees sharing a name must stay separate');
assert.equal(JSON.stringify(rows), before, 'Source period data must remain available for breakdowns');
assert.equal(hasEmployeeActivity(empty), false);
assert.equal(hasEmployeeActivity({ ...empty, statuses: { Interested: 1 } }), true);
assert.equal(hasEmployeeActivity(rows[0]), true);
assert.equal(rows.filter(hasEmployeeActivity).length, 2, 'Inactive daily/monthly rows are hidden by default');
assert.equal(summarizeEmployees([]).length, 0);
const unusual = summarizeEmployees([{ ...empty, statuses: Object.fromEntries([['__proto__', 1], ['constructor', 2]]) }])[0];
assert.equal(unusual.statuses.__proto__, 1);
assert.equal(unusual.statuses.constructor, 2);
console.log('Employee summary checks passed: unique employee IDs, period totals, all metrics/statuses, numeric strings, currency precision, same-name employees, inactive periods, and unchanged breakdown data.');
