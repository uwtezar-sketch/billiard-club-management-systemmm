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
  tableRevenue: number;
  cafeRevenue: number;
  revenue: number;
  count: number;
  weekday: string;
  isWeekend: boolean;
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
  totalRevenue: number;
  totalTableRevenue: number;
  totalCafeRevenue: number;
  totalInvoices: number;
  avgDailyRevenue: number;
  bestDay: DailyPoint;
  changePercent: number;
  topCafeItemsByQty: CafeItemStat[];
  topCafeItemsByRevenue: CafeItemStat[];
  leastCafeItems: CafeItemStat[];
  heatmaps: Record<string, number[][]>;
  dayLabels: string[];
  blockLabels: string[];
  peakCells: Record<string, PeakCell>;
}

const TYPE_TABS: { id: string; label: string }[] = [
  { id: "all", label: "همه" },
  { id: "snooker", label: "🎱 اسنوکر" },
  { id: "eightball", label: "🎳 ایت‌بال" },
  { id: "playstation", label: "🎮 پلی‌استیشن" },
];

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
  const [heatType, setHeatType] = useState<string>("all");
  const [cafeSort, setCafeSort] = useState<"qty" | "revenue">("qty");
  const [showLeastCafe, setShowLeastCafe] = useState(false);
  const [selectedDay, setSelectedDay] = useState<DailyPoint | null>(null);
  const [selectedCell, setSelectedCell] = useState<{ day: number; block: number; count: number } | null>(null);

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

  useEffect(() => {
    setSelectedDay(null);
    setSelectedCell(null);
  }, [range, heatType]);

  const activeTables = tables.filter((t) => t.isActive);
  const freeTables = tables.filter((t) => !t.isActive);

  const maxDailyRevenue = analytics ? Math.max(1, ...analytics.daily.map((d) => d.revenue)) : 1;
  const currentHeatmap = analytics ? analytics.heatmaps[heatType] || [] : [];
  const currentPeak = analytics ? analytics.peakCells[heatType] : undefined;
  const maxHeatCount = currentHeatmap.length > 0 ? Math.max(1, ...currentHeatmap.flat()) : 1;

  const cafeList = analytics ? (cafeSort === "qty" ? analytics.topCafeItemsByQty : analytics.topCafeItemsByRevenue) : [];
  const maxCafeQty = cafeList.length > 0 ? Math.max(1, ...cafeList.map((c) => c.quantity)) : 1;
  const maxCafeRev = cafeList.length > 0 ? Math.max(1, ...cafeList.map((c) => c.revenue)) : 1;

  const cafeSharePercent =
    analytics && analytics.totalRevenue > 0 ? Math.round((analytics.totalCafeRevenue / analytics.totalRevenue) * 100) : 0;

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
            {/* Summary stats */}
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="bg-slate-800 rounded-lg p-2 text-center">
                <div className="text-[10px] text-slate-500">مجموع فروش</div>
                <div className="text-sm font-bold text-green-400 mt-1">{formatPrice(analytics.totalRevenue)}</div>
              </div>
              <div className="bg-slate-800 rounded-lg p-2 text-center">
                <div className="text-[10px] text-slate-500">میانگین روزانه</div>
                <div className="text-sm font-bold text-white mt-1">{formatPrice(analytics.avgDailyRevenue)}</div>
              </div>
              <div className="bg-slate-800 rounded-lg p-2 text-center">
                <div className="text-[10px] text-slate-500">نسبت به دوره قبل</div>
                <div
                  className={`text-sm font-bold mt-1 ${
                    analytics.changePercent > 0 ? "text-green-400" : analytics.changePercent < 0 ? "text-red-400" : "text-slate-400"
                  }`}
                >
                  {analytics.changePercent > 0 ? "▲" : analytics.changePercent < 0 ? "▼" : "•"}{" "}
                  {Math.abs(analytics.changePercent).toLocaleString("fa-IR")}٪
                </div>
              </div>
            </div>

            {/* سهم میز vs کافه */}
            <div className="flex items-center gap-2 mb-4 text-xs">
              <span className="text-slate-500">سهم کافه از فروش:</span>
              <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-amber-500" style={{ width: `${cafeSharePercent}%` }} />
              </div>
              <span className="text-amber-400 font-bold">{cafeSharePercent.toLocaleString("fa-IR")}٪</span>
            </div>

            {/* نمودار میله‌ای دو رنگ (میز + کافه) */}
            <div className="flex items-end gap-1 h-36 overflow-x-auto">
              {analytics.daily.map((d) => {
                const totalPct = Math.max(4, Math.round((d.revenue / maxDailyRevenue) * 100));
                const cafePct = d.revenue > 0 ? Math.round((d.cafeRevenue / d.revenue) * 100) : 0;
                const isMax = d.revenue === maxDailyRevenue && d.revenue > 0;
                const isSelected = selectedDay?.date === d.date;
                return (
                  <button
                    key={d.date}
                    className="flex-1 min-w-[10px] flex flex-col items-center justify-end h-full"
                    onClick={() => setSelectedDay(isSelected ? null : d)}
                  >
                    <div
                      className="w-full rounded-t-sm overflow-hidden flex flex-col justify-end"
                      style={{ height: `${totalPct}%`, outline: isSelected ? "2px solid #e0b23a" : "none" }}
                    >
                      {cafePct > 0 && (
                        <div className="w-full bg-amber-500" style={{ height: `${cafePct}%` }} />
                      )}
                      <div
                        className={`w-full flex-1 ${isMax ? "bg-green-400" : d.isWeekend ? "bg-purple-500" : "bg-blue-600"}`}
                      />
                    </div>
                    <div className={`text-[10px] mt-1 ${d.isWeekend ? "text-purple-300" : "text-slate-500"}`}>
                      {d.weekday}
                    </div>
                    <div className="text-[9px] text-slate-600">{jalaaliDay(d.date)}</div>
                  </button>
                );
              })}
            </div>

            {selectedDay && (
              <div className="rounded-lg p-3 mt-2 text-sm" style={{ background: "#0e1512", border: "1px solid #c9971f" }}>
                <div className="font-bold text-white mb-1">{selectedDay.date} ({selectedDay.weekday})</div>
                <div className="flex justify-between text-slate-300"><span>💵 درآمد میز:</span><span>{formatPrice(selectedDay.tableRevenue)}</span></div>
                <div className="flex justify-between text-slate-300"><span>☕ درآمد کافه:</span><span>{formatPrice(selectedDay.cafeRevenue)}</span></div>
                <div className="flex justify-between text-white font-bold"><span>جمع:</span><span>{formatPrice(selectedDay.revenue)}</span></div>
                <div className="flex justify-between text-slate-400 text-xs mt-1"><span>تعداد فاکتور:</span><span>{selectedDay.count.toLocaleString("fa-IR")}</span></div>
              </div>
            )}

            <div className="flex items-center justify-center gap-3 mt-3 text-[10px] text-slate-500 flex-wrap">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-600 inline-block" /> میز</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block" /> کافه</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-500 inline-block" /> جمعه</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-400 inline-block" /> پرفروش‌ترین</span>
            </div>

            <div className="text-center mt-2 text-sm text-slate-400">
              پرفروش‌ترین روز:{" "}
              <span className="text-green-400 font-bold">
                {analytics.bestDay.weekday} {jalaaliDay(analytics.bestDay.date)} — {formatPrice(analytics.bestDay.revenue)}
              </span>
            </div>
          </>
        ) : (
          <div className="text-center text-slate-500 text-sm py-6">هنوز داده‌ای برای نمایش نیست</div>
        )}
      </div>

      {/* Busiest Hours Heatmap */}
      {analytics && (
        <div className="card">
          <h3 className="font-bold text-slate-300 mb-3">🔥 شلوغ‌ترین ساعات باشگاه</h3>

          <div className="flex gap-1 mb-3 overflow-x-auto">
            {TYPE_TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setHeatType(t.id)}
                className={`px-2.5 py-1 rounded-lg text-xs whitespace-nowrap ${
                  heatType === t.id ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {currentPeak && currentPeak.count > 0 ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse" style={{ minWidth: "520px" }}>
                  <thead>
                    <tr>
                      <th className="text-[10px] text-slate-500 font-normal text-right pl-1"> </th>
                      {analytics.blockLabels.map((label) => (
                        <th key={label} className="text-[8px] text-slate-500 font-normal pb-1 text-center">
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.dayLabels.map((dayLabel, dayIdx) => (
                      <tr key={dayLabel}>
                        <td className="text-[10px] text-slate-400 pl-2 whitespace-nowrap">{dayLabel}</td>
                        {currentHeatmap[dayIdx].map((count, blockIdx) => {
                          const intensity = count / maxHeatCount;
                          const isPeak = dayIdx === currentPeak.day && blockIdx === currentPeak.block && count > 0;
                          const isSelected = selectedCell?.day === dayIdx && selectedCell?.block === blockIdx;
                          return (
                            <td key={blockIdx} className="p-[1px]">
                              <button
                                type="button"
                                className="w-full rounded-md flex items-center justify-center"
                                style={{
                                  height: "22px",
                                  background: isPeak
                                    ? "#f59e0b"
                                    : count === 0
                                    ? "#1e293b"
                                    : `rgba(37, 99, 235, ${0.15 + intensity * 0.85})`,
                                  border: isPeak ? "1px solid #fbbf24" : isSelected ? "1px solid #e0b23a" : "1px solid transparent",
                                }}
                                onClick={() => setSelectedCell(isSelected ? null : { day: dayIdx, block: blockIdx, count })}
                              >
                                {count > 0 && (
                                  <span className={`text-[9px] font-bold ${isPeak ? "text-slate-900" : "text-white"}`}>
                                    {count.toLocaleString("fa-IR")}
                                  </span>
                                )}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {selectedCell && (
                <div className="rounded-lg p-3 mt-2 text-sm text-center" style={{ background: "#0e1512", border: "1px solid #c9971f" }}>
                  <span className="text-white font-bold">{analytics.dayLabels[selectedCell.day]}</span>
                  <span className="text-slate-400"> — ساعت </span>
                  <span className="text-white font-bold">{analytics.blockLabels[selectedCell.block]}</span>
                  <span className="text-slate-400">: </span>
                  <span style={{ color: "#e0b23a" }} className="font-bold">{selectedCell.count.toLocaleString("fa-IR")} فاکتور</span>
                </div>
              )}
              <div className="text-center mt-3 text-sm text-slate-400">
                شلوغ‌ترین زمان:{" "}
                <span className="text-amber-400 font-bold">
                  {analytics.dayLabels[currentPeak.day]}، ساعت {analytics.blockLabels[currentPeak.block]}
                </span>
              </div>
            </>
          ) : (
            <div className="text-center text-slate-500 text-sm py-4">داده‌ای برای این دسته وجود ندارد</div>
          )}
        </div>
      )}

      {/* Top Cafe Items */}
      {analytics && (analytics.topCafeItemsByQty.length > 0 || analytics.topCafeItemsByRevenue.length > 0) && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-slate-300">☕ پرفروش‌ترین آیتم‌های کافه</h3>
            <div className="flex gap-1 bg-slate-800 rounded-lg p-1">
              <button
                onClick={() => setCafeSort("qty")}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition ${
                  cafeSort === "qty" ? "bg-blue-600 text-white" : "text-slate-400"
                }`}
              >
                تعداد
              </button>
              <button
                onClick={() => setCafeSort("revenue")}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition ${
                  cafeSort === "revenue" ? "bg-blue-600 text-white" : "text-slate-400"
                }`}
              >
                درآمد
              </button>
            </div>
          </div>
          <div className="space-y-2">
            {cafeList.map((item, idx) => (
              <div key={item.name} className="flex items-center gap-2">
                <div className="text-slate-500 text-xs w-4">{(idx + 1).toLocaleString("fa-IR")}</div>
                <div className="flex-1">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-white">{item.name}</span>
                    <span className="text-amber-400">
                      {cafeSort === "qty" ? `${item.quantity.toLocaleString("fa-IR")} عدد` : formatPrice(item.revenue)}
                    </span>
                  </div>
                  <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-500 rounded-full"
                      style={{
                        width: `${Math.round(
                          ((cafeSort === "qty" ? item.quantity : item.revenue) / (cafeSort === "qty" ? maxCafeQty : maxCafeRev)) * 100
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {analytics.leastCafeItems.length > 0 && (
            <div className="mt-4 pt-3" style={{ borderTop: "1px solid #334155" }}>
              <button
                className="text-xs text-slate-500 flex items-center gap-1"
                onClick={() => setShowLeastCafe((v) => !v)}
              >
                {showLeastCafe ? "▲" : "▼"} کم‌فروش‌ترین آیتم‌ها (احتمالاً کاندید حذف از منو)
              </button>
              {showLeastCafe && (
                <div className="mt-2 space-y-1">
                  {analytics.leastCafeItems.map((item) => (
                    <div key={item.name} className="flex justify-between text-xs text-slate-400">
                      <span>{item.name}</span>
                      <span>{item.quantity.toLocaleString("fa-IR")} عدد فروخته شده</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Forgotten Sessions Warning */}
      {activeTables.some((t) => t.activeSession && Date.now() - new Date(t.activeSession.startTime).getTime() > 4 * 60 * 60 * 1000) && (
        <div className="rounded-xl p-3" style={{ background: "#3d101633", border: "1px solid #8f1d2c" }}>
          <div className="font-bold mb-1" style={{ color: "#f27f8a" }}>⚠️ سشن‌های طولانی (احتمالاً فراموش‌شده)</div>
          <div className="space-y-1">
            {activeTables
              .filter((t) => t.activeSession && Date.now() - new Date(t.activeSession.startTime).getTime() > 4 * 60 * 60 * 1000)
              .map((t) => (
                <div key={t.id} className="text-sm text-slate-300 flex justify-between">
                  <span>{t.name}{t.activeSession?.customerName ? ` — ${t.activeSession.customerName}` : ""}</span>
                  <span style={{ color: "#f27f8a" }}>
                    {formatDuration(Math.floor((Date.now() - new Date(t.activeSession!.startTime).getTime()) / 60000))}
                  </span>
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
              const isForgotten = elapsed > 4 * 60;
              return (
                <div
                  key={table.id}
                  className="rounded-lg px-3 py-2 flex justify-between items-center"
                  style={isForgotten ? { background: "#3d101633", border: "1px solid #8f1d2c" } : { background: "#0e1512" }}
                >
                  <div>
                    <span className="text-white font-medium">{table.name}</span>
                    {table.activeSession?.customerName && (
                      <span className="text-slate-400 text-sm mr-2">({table.activeSession.customerName})</span>
                    )}
                  </div>
                  <div className="text-sm" style={{ color: isForgotten ? "#f27f8a" : "#5ee89b" }}>
                    {isForgotten && "⚠️ "}{formatDuration(elapsed)}
                  </div>
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
