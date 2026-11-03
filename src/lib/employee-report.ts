export const EMPLOYEE_METRICS = ["leads", "attempts", "calls", "connected", "talk_seconds", "followups_done", "enrolled", "revenue"] as const;
type Metric = (typeof EMPLOYEE_METRICS)[number];
export type EmployeeReportRow = {
  agent_id: string;
  agent: string;
  emp_code: string;
  period: string;
  statuses: Record<string, number | string>;
} & Record<Metric, number | string>;

/** Period buckets are disjoint; combine them by employee ID for range totals. */
export function summarizeEmployees(rows: EmployeeReportRow[]): EmployeeReportRow[] {
  const employees = new Map<string, EmployeeReportRow>();
  for (const row of rows) {
    let total = employees.get(row.agent_id);
    if (!total) {
      total = { agent_id: row.agent_id, agent: row.agent, emp_code: row.emp_code, period: "", statuses: Object.create(null), leads: 0, attempts: 0, calls: 0, connected: 0, talk_seconds: 0, followups_done: 0, enrolled: 0, revenue: 0 };
      employees.set(row.agent_id, total);
    }
    for (const metric of EMPLOYEE_METRICS) {
      total[metric] = metric === "revenue"
        ? (Math.round(Number(total[metric]) * 100) + Math.round(Number(row[metric] ?? 0) * 100)) / 100
        : Number(total[metric]) + Number(row[metric] ?? 0);
    }
    for (const [status, count] of Object.entries(row.statuses ?? {})) total.statuses[status] = Number(total.statuses[status] ?? 0) + Number(count);
  }
  return [...employees.values()].sort((a, b) => a.agent.localeCompare(b.agent) || a.agent_id.localeCompare(b.agent_id));
}

export function hasEmployeeActivity(row: EmployeeReportRow) {
  return EMPLOYEE_METRICS.some(metric => Number(row[metric] ?? 0) !== 0) || Object.values(row.statuses ?? {}).some(count => Number(count) !== 0);
}
