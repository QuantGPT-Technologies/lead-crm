"use client";

import { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Select } from "@/components/ui";

const COLORS = [
  "#285b43",
  "#8ba67c",
  "#c2cf8e",
  "#d4b17b",
  "#6a9589",
  "#a6b7a1",
  "#aa8e73",
  "#647b68",
];
const tooltipStyle = {
  background: "var(--card)",
  border: "1px solid var(--line)",
  borderRadius: 12,
  color: "var(--fg)",
  fontSize: 12,
};
const axis = { stroke: "var(--muted)", fontSize: 12 };

export function SourceChart({
  data,
}: {
  data: { name: string; value: number }[];
}) {
  if (!data.length)
    return (
      <p className="py-16 text-center text-muted">No lead data available</p>
    );
  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          isAnimationActive={false}
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius={74}
          outerRadius={100}
          paddingAngle={4}
          cornerRadius={4}
        >
          {data.map((d, i) => (
            <Cell key={d.name} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}

type Kind = "Area" | "Bar" | "Line";

export function ConversionChart({
  data,
}: {
  data: { day: string; leads: number; enrolled: number }[];
}) {
  const [kind, setKind] = useState<Kind>("Area");
  const common = (
    <>
      <CartesianGrid
        strokeDasharray="3 3"
        stroke="var(--line)"
        vertical={false}
      />
      <XAxis dataKey="day" {...axis} minTickGap={24} />
      <YAxis allowDecimals={false} {...axis} />
      <Tooltip contentStyle={tooltipStyle} />
      <Legend />
    </>
  );

  return (
    <>
      <div className="mb-2 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Growth over time</h2>
          <p className="mt-1 text-xs text-muted">New leads and enrollments</p>
        </div>
        <Select
          aria-label="Chart type"
          value={kind}
          onChange={(e) => setKind(e.target.value as Kind)}
          options={["Area", "Bar", "Line"].map((k) => ({ value: k, label: k }))}
          placeholder={null}
          className="!w-28"
        />
      </div>
      <ResponsiveContainer width="100%" height={300}>
        {kind === "Area" ? (
          <AreaChart data={data}>
            {common}
            <Area
              isAnimationActive={false}
              type="monotone"
              dataKey="leads"
              name="Leads"
              stroke="var(--brand)"
              fill="var(--brand)"
              fillOpacity={0.2}
            />
            <Area
              isAnimationActive={false}
              type="monotone"
              dataKey="enrolled"
              name="Enrolled"
              stroke="#b5c77e"
              fill="#b5c77e"
              fillOpacity={0.25}
            />
          </AreaChart>
        ) : kind === "Bar" ? (
          <BarChart data={data}>
            {common}
            <Bar
              isAnimationActive={false}
              dataKey="leads"
              name="Leads"
              fill="var(--brand)"
            />
            <Bar
              isAnimationActive={false}
              dataKey="enrolled"
              name="Enrolled"
              fill="#b5c77e"
            />
          </BarChart>
        ) : (
          <LineChart data={data}>
            {common}
            <Line
              isAnimationActive={false}
              type="monotone"
              dataKey="leads"
              name="Leads"
              stroke="var(--brand)"
              dot={false}
              strokeWidth={2}
            />
            <Line
              isAnimationActive={false}
              type="monotone"
              dataKey="enrolled"
              name="Enrolled"
              stroke="#b5c77e"
              dot={false}
              strokeWidth={2}
            />
          </LineChart>
        )}
      </ResponsiveContainer>
    </>
  );
}
