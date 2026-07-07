"use client";
import { useState, useEffect, useCallback } from "react";
import { useToast } from "./Toast";
import { formatPrice, formatDuration } from "@/lib/jalaali";

interface TableStat {
  id: number;
  name: string;
  type: string;
  isActive: boolean;
  activeSession?: {
    id: number;
    customerName: string | null;
    startTime: string;
    pricePerHour: string;
  } | null;
}

interface Invoice {
  id: number;
  invoiceNumber: string;
  customerName: string | null;
  tableName: string | null;
  tableType: string | null;
  totalAmount: string;
  status: string;
  issuedAt: string;
}

interface DailyPoint {
  date: string;
  revenue: number;
}

interface CafeItemStat {
  name: string;
  quantity: number;
  revenue: number;
}

interface PeakCell {
  day: number;
  block: number;
  count: number;
}

interface Analytics {
  daily: DailyPoint[];
  topCafeItems: CafeItemStat[];
  heatmap: number[][];
  dayLabels: string[];
  blockLabels: string[];
  peakCell: PeakCell;
}

function jalaaliDay(date: string) {
  const parts = date.split("/");
  return Number(parts[2] || 0).toLocaleString("fa-IR");
}

export default function DashboardSection() {
  const { showToast } = useToast();
  const [tables, setTables] = useState<TableStat[]>([]);
  const [pendingInvoices, setPendingInvoices] = useState<Invoice[]>([]);
  const [totalDebt, setTotalDebt] = useState(0);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [range, setRange] = useState<"week" | "month">("week");

  const fetchAll = useCallback(async () => {
    try {
      const [tablesRes, pendingRes, debtorsRes, analyticsRes] = await Promise.all([
        fetch("/api/tables"),
        fetch("/api/invoices?status=pending"),
        fetch("/api/debtors"),
        fetch(`/api/reports/analytics?range=${range}`),
      ]);
      setTables(await tablesRes.json());
      setPendingInvoices(await pendingRes.json());
      const debtors = await debtorsRes.json();
      if (Array.isArray(debtors)) {
        setTotalDebt(debtors.reduce((s: number, d: { totalDebt: string }) => s + Number(d.totalDebt), 0));
      }
      setAnalytics(await analyticsRes.json());
    } catch {
      showToast("خطا در دریافت داشبورد", "error");
    }
  }, [showToast, range]);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 15000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  const activeTables = tables.filter((t) => t.isActive);
  const freeTables = tables.filter((t) => !t.isActive);

  const maxDailyRevenue = analytics ? Math.max(1, ...analytics.daily.map((d) => d.revenue)) : 1;
  const maxHeatCount = analytics ? Math.max(1, ...analytics.heatmap.flat()) : 1;
  const maxCafeQty = analytics ? Math.max(1, ...analytics.topCafeItems.map((c) => c.quantity)) : 1;

  return (
    <div className="space-y-4">
      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl p-4" style={{ background: "linear-gradient(135deg, #15803d, #16a34a)", border: "1px solid #22c55e" }}>
          <div className="text-3xl font-bold text-white">{activeTables.length}</div>
          <div className="text-green-200 text-sm">میز فعال</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "linear-gradient(135deg, #1e293b, #334155)", border: "1px solid #475569" }}>
          <div className="text-3xl font-bold text-white">{freeTables.length}</div>
          <div className="text-slate-300 text-sm">میز آزاد</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "linear-gradient(135deg, #78350f, #92400e)", border: "1px solid #f59e0b" }}>
          <div className="text-3xl font-bold text-white">{pendingInvoices.length}</div>
          <div className="text-yellow-200 text-sm">در انتظار تسویه</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: "linear-gradient(135deg, #7f1d1d, #991b1b)", border: "1px solid #dc2626" }}>
          <div className="text-xl font-bold text-white">{formatPrice(totalDebt)}</div>
          <div className="text-red-200 text-sm">کل بدهی‌های معوق</div>
        </div>
      </div>

      {/* Revenue Chart */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-slate-300">📈 نمودار فروش</h3>
          <div className="flex gap-1 bg-slate-800 rounded-lg p-1">
            <button
              onClick={() => setRange("week")}
              className={`px-3 py-1 rounded-md text-xs font-medium transition ${
                range === "week" ? "bg-blue-600 text-white" : "text-slate-400"
              }`}
            >
              هفتگی
            </button>
            <button
              onClick={() => setRange("month")}
              className={`px-3 py-1 rounded-md text-xs font-medium transition ${
                range === "month" ? "bg-blue-600 text-white" : "text-slate-400"
              }`}
            >
              ماهانه
            </button>
          </div>
        </div>

        {analytics && analytics.daily.length > 0 ? (
          <>
            <div className="flex items-end gap-1 h-36 overflow-x-auto">
              {analytics.daily.map((d) => {
                const pct = Math.max(4, Math.round((d.revenue / maxDailyRevenue) * 100));
                const isMax = d.revenue === maxDailyRevenue && d.revenue > 0;
                return (
                  <div key={d.date} className="flex-1 min-w-[10px] flex flex-col items-center justify-end h-full">
                    <div
                      className={`w-full rounded-t-sm ${isMax ? "bg-green-400" : "bg-blue-600"}`}
                      style={{ height: `${pct}%` }}
                      title={`${d.date} — ${formatPrice(d.revenue)}`}
                    />
                    <div className="text-[10px] text-slate-500 mt-1">{jalaaliDay(d.date)}</div>
                  </div>
                );
              })}
            </div>
            <div className="text-center mt-3 text-sm text-slate-400">
              پرفروش‌ترین روز:{" "}
              <span className="text-green-400 font-bold">
                {formatPrice(Math.max(...analytics.daily.map((d) => d.revenue)))}
              </span>
            </div>
          </>
        ) : (
          <div className="text-center text-slate-500 text-sm py-6">هنوز داده‌ای برای نمایش نیست</div>
        )}
      </div>

      {/* Busiest Hours Heatmap */}
      {analytics && analytics.peakCell.count > 0 && (
        <div className="card">
          <h3 className="font-bold text-slate-300 mb-3">🔥 شلوغ‌ترین ساعات باشگاه</h3>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: "340px" }}>
              <thead>
                <tr>
                  <th className="text-[10px] text-slate-500 font-normal text-right pl-1"> </th>
                  {analytics.blockLabels.map((label) => (
                    <th key={label} className="text-[9px] text-slate-500 font-normal pb-1 text-center">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {analytics.dayLabels.map((dayLabel, dayIdx) => (
                  <tr key={dayLabel}>
                    <td className="text-[10px] text-slate-400 pl-2 whitespace-nowrap">{dayLabel}</td>
                    {analytics.heatmap[dayIdx].map((count, blockIdx) => {
                      const intensity = count / maxHeatCount;
                      const isPeak = dayIdx === analytics.peakCell.day && blockIdx === analytics.peakCell.block && count > 0;
                      return (
                        <td key={blockIdx} className="p-[2px]">
                          <div
                            className="rounded-md flex items-center justify-center"
                            style={{
                              height: "26px",
                              background: isPeak
                                ? "#f59e0b"
                                : count === 0
                                ? "#1e293b"
                                : `rgba(37, 99, 235, ${0.15 + intensity * 0.85})`,
                              border: isPeak ? "1px solid #fbbf24" : "1px solid transparent",
                            }}
                            title={`${dayLabel} ${analytics.blockLabels[blockIdx]} — ${count} فاکتور`}
                          >
                            {count > 0 && (
                              <span className={`text-[10px] font-bold ${isPeak ? "text-slate-900" : "text-white"}`}>
                                {count.toLocaleString("fa-IR")}
                              </span>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-center mt-3 text-sm text-slate-400">
            شلوغ‌ترین زمان:{" "}
            <span className="text-amber-400 font-bold">
              {analytics.dayLabels[analytics.peakCell.day]}، ساعت {analytics.blockLabels[analytics.peakCell.block]}
            </span>
          </div>
        </div>
      )}

      {/* Top Cafe Items */}
      {analytics && analytics.topCafeItems.length > 0 && (
        <div className="card">
          <h3 className="font-bold text-slate-300 mb-3">☕ پرفروش‌ترین آیتم‌های کافه</h3>
          <div className="space-y-2">
            {analytics.topCafeItems.map((item, idx) => (
              <div key={item.name} className="flex items-center gap-2">
                <div className="text-slate-500 text-xs w-4">{(idx + 1).toLocaleString("fa-IR")}</div>
                <div className="flex-1">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-white">{item.name}</span>
                    <span className="text-amber-400">{item.quantity.toLocaleString("fa-IR")} عدد</span>
                  </div>
                  <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-500 rounded-full"
                      style={{ width: `${Math.round((item.quantity / maxCafeQty) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active Tables */}
      {activeTables.length > 0 && (
        <div className="card">
          <h3 className="font-bold text-slate-300 mb-3">🟢 میزهای فعال</h3>
          <div className="space-y-2">
            {activeTables.map((table) => {
              const elapsed = table.activeSession
                ? Math.floor((Date.now() - new Date(table.activeSession.startTime).getTime()) / 60000)
                : 0;
              return (
                <div key={table.id} className="bg-slate-800 rounded-lg px-3 py-2 flex justify-between items-center">
                  <div>
                    <span className="text-white font-medium">{table.name}</span>
                    {table.activeSession?.customerName && (
                      <span className="text-slate-400 text-sm mr-2">({table.activeSession.customerName})</span>
                    )}
                  </div>
                  <div className="text-green-400 text-sm">{formatDuration(elapsed)}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Pending Invoices */}
      {pendingInvoices.length > 0 && (
        <div className="card">
          <h3 className="font-bold text-yellow-400 mb-3">⏳ در انتظار تسویه</h3>
          <div className="space-y-2">
            {pendingInvoices.map((inv) => (
              <div key={inv.id} className="bg-yellow-950/30 border border-yellow-800 rounded-lg px-3 py-2 flex justify-between items-center">
                <div>
                  <span className="text-white text-sm">{inv.customerName || "بدون نام"}</span>
                  {inv.tableName && <span className="text-slate-400 text-xs mr-2">{inv.tableName}</span>}
                </div>
                <span className="text-yellow-400 font-bold text-sm">{formatPrice(Number(inv.totalAmount))}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
