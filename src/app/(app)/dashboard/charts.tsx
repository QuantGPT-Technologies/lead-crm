"use client";

import { useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Select } from "@/components/ui";

const COLORS = ["#4f5bd5", "#22b8cf", "#d946ef", "#f59e0b", "#16a34a", "#ef4444", "#8b5cf6", "#64748b"];
const tooltipStyle = { background: "var(--card)", border: "1px solid var(--line)", borderRadius: 6, color: "var(--fg)" };
const axis = { stroke: "var(--muted)", fontSize: 12 };

export function SourceChart({ data }: { data: { name: string; value: number }[] }) {
  if (!data.length) return <p className="py-16 text-center text-muted">No lead data available</p>;
  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie isAnimationActive={false} data={data} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100} paddingAngle={2}>
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

export function ConversionChart({ data }: { data: { day: string; leads: number; enrolled: number }[] }) {
  const [kind, setKind] = useState<Kind>("Area");
  const common = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
      <XAxis dataKey="day" {...axis} minTickGap={24} />
      <YAxis allowDecimals={false} {...axis} />
      <Tooltip contentStyle={tooltipStyle} />
      <Legend />
    </>
  );

  return (
    <>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-lg font-bold">Lead Conversion</h2>
        <Select aria-label="Chart type" value={kind} onChange={(e) => setKind(e.target.value as Kind)} options={["Area", "Bar", "Line"].map((k) => ({ value: k, label: k }))} placeholder={null} className="!w-28" />
      </div>
      <ResponsiveContainer width="100%" height={300}>
        {kind === "Area" ? (
          <AreaChart data={data}>
            {common}
            <Area isAnimationActive={false} type="monotone" dataKey="leads" name="Leads" stroke="#4f5bd5" fill="#4f5bd5" fillOpacity={0.2} />
            <Area isAnimationActive={false} type="monotone" dataKey="enrolled" name="Enrolled" stroke="#16a34a" fill="#16a34a" fillOpacity={0.25} />
          </AreaChart>
        ) : kind === "Bar" ? (
          <BarChart data={data}>
            {common}
            <Bar isAnimationActive={false} dataKey="leads" name="Leads" fill="#4f5bd5" />
            <Bar isAnimationActive={false} dataKey="enrolled" name="Enrolled" fill="#16a34a" />
          </BarChart>
        ) : (
          <LineChart data={data}>
            {common}
            <Line isAnimationActive={false} type="monotone" dataKey="leads" name="Leads" stroke="#4f5bd5" dot={false} strokeWidth={2} />
            <Line isAnimationActive={false} type="monotone" dataKey="enrolled" name="Enrolled" stroke="#16a34a" dot={false} strokeWidth={2} />
          </LineChart>
        )}
      </ResponsiveContainer>
    </>
  );
}
