// Offline regression checks for bulk assignment. No real accounts or leads are changed.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const owner = randomUUID(), previousOwner = randomUUID();
let role, leads, visible, activities, onWrite;
const users = [{ id: owner, full_name: 'Recipient' }];

function reset() {
  role = 'admin';
  leads = [
    { id: randomUUID(), owner_id: null },
    { id: randomUUID(), owner_id: previousOwner },
    { id: randomUUID(), owner_id: null },
  ];
  visible = new Set(leads.slice(0, 2).map(lead => lead.id));
  activities = [];
  onWrite = null;
}

function client(admin = false) {
  return { from(table) {
    assert.equal(table, 'leads');
    let ids, unassigned = false, patch, range;
    const query = {
      select() { return query; },
      in(column, values) { assert.equal(column, 'id'); ids = values; return query; },
      is(column, value) { assert.equal(column, 'owner_id'); assert.equal(value, null); unassigned = true; return query; },
      update(values) { assert.ok(admin); patch = values; return query; },
      order() { return query; },
      range(start, end) { range = [start, end]; return query; },
      then(resolve, reject) {
        return Promise.resolve().then(() => {
          if (patch && onWrite) { const callback = onWrite; onWrite = null; callback(); }
          let rows = leads.filter(lead => (admin || visible.has(lead.id)) && (!ids || ids.includes(lead.id)) && (!unassigned || lead.owner_id === null));
          if (range) rows = rows.slice(range[0], range[1] + 1);
          if (patch) rows.forEach(lead => Object.assign(lead, patch));
          return { data: rows.map(lead => ({ id: lead.id })), error: null };
        }).then(resolve, reject);
      },
    };
    return query;
  } };
}

function load(relativePath) {
  const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  const mocks = {
    'next/cache': { revalidatePath() {}, updateTag() {} },
    '@/lib/auth': { getSession: async () => ({ supabase: client(), profile: { id: randomUUID(), role, full_name: 'Operator' } }), isStaff: role => role !== 'agent' },
    '@/lib/data': {
      getLookups: async () => ({ users }),
      chunk: (ids, size) => Array.from({ length: Math.ceil(ids.length / size) }, (_, i) => ids.slice(i * size, (i + 1) * size)),
      logActivity: async (_, entries) => { activities.push(...entries); },
      applyLeadFilters: (query, filters) => filters.owner === 'none' ? query.is('owner_id', null) : query,
    },
    '@/lib/supabase/server': { createAdminClient: () => client(true) },
    '@/lib/other-fields': {}, '@/lib/lead-categories': {}, '@/lib/messaging': {}, '@/lib/utils': {}, '@/lib/masters': {}, '@/lib/phone': {},
  };
  vm.runInNewContext(output, { exports, require: name => name in mocks ? mocks[name] : require(name), Date, Set });
  return exports;
}

const actions = load('../src/app/(app)/leads/actions.ts');
const operations = load('../src/app/(app)/ops-actions.ts');

reset();
let result = await actions.bulkAssignLeads(leads.map(lead => lead.id), owner);
assert.equal(result.error, undefined);
assert.equal(leads[0].owner_id, owner);
assert.equal(leads[1].owner_id, previousOwner, 'Existing assignment must survive a mixed selection');
assert.equal(leads[2].owner_id, null, 'Invisible lead must never be assigned via service role');
assert.deepEqual(activities.map(entry => entry.lead_id), [leads[0].id]);
assert.match(result.message, /1 lead\(s\) assigned.*2 skipped/);

reset();
onWrite = () => { leads[0].owner_id = previousOwner; };
result = await actions.bulkAssignLeads([leads[0].id], owner);
assert.equal(leads[0].owner_id, previousOwner, 'Concurrent assignment must win over a stale page');
assert.match(result.message, /Existing assignments were kept/);
assert.equal(activities.length, 0, 'Skipped leads must not get assignment activity');

reset();
role = 'agent';
assert.match((await actions.bulkAssignLeads([leads[0].id], owner)).error, /Only managers and admins/);
assert.equal(leads[0].owner_id, null);
assert.ok((await actions.bulkAssignLeads([leads[0].id], null)).error);

reset();
await actions.assignLeads([leads[1].id], owner);
assert.equal(leads[1].owner_id, owner, 'Explicit single-lead reassignment must still work');

reset();
visible = new Set(leads.map(lead => lead.id));
onWrite = () => { leads[0].owner_id = previousOwner; };
result = await operations.distributeLeads({ agentIds: [owner], count: 3 });
assert.equal(result.error, undefined);
assert.equal(leads[0].owner_id, previousOwner);
assert.equal(leads[1].owner_id, previousOwner);
assert.equal(leads[2].owner_id, owner);
assert.match(result.message, /^1 lead\(s\) distributed: Recipient 1; 1 already assigned/);
assert.deepEqual(activities.map(entry => entry.lead_id), [leads[2].id]);

console.log('Bulk assignment checks passed: mixed selection, concurrent assignment, visibility, role restrictions, explicit reassignment, and distribution counts/audit history.');
