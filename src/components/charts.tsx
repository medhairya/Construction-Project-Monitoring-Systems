"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/** How many files sit at each stage, and how long they have been there. */
export function StageLoadChart({
  data,
}: {
  data: { stage: string; count: number; avgDays: number }[];
}) {
  if (data.length === 0) {
    return <p className="text-xs text-slate-600">No files in the flow.</p>;
  }
  const rows = data.map((d) => ({ ...d, short: d.stage.split(" ")[0] }));
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} />
          <YAxis
            type="category"
            dataKey="short"
            width={92}
            tick={{ fontSize: 11, fill: "#475569" }}
          />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 6, border: "1px solid #e2e8f0" }}
            formatter={(value, _name, item) => {
              const row = item?.payload as { stage: string; avgDays: number } | undefined;
              return [String(value) + " file(s), " + (row?.avgDays ?? 0) + "d average", row?.stage ?? ""];
            }}
          />
          <Bar dataKey="count" radius={[0, 4, 4, 0]}>
            {rows.map((row) => (
              <Cell
                key={row.stage}
                fill={row.avgDays > 30 ? "#b91c1c" : row.avgDays > 14 ? "#d97706" : "#0369a1"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
