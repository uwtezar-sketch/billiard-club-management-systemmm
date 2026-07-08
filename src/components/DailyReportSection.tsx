"use client";
import { useState, useEffect, useCallback } from "react";
import { useToast } from "./Toast";
import { formatPrice, formatDuration, todayJalaali } from "@/lib/jalaali";

interface DailyReport {
  date: string;
  prevDate: string;
  nextDate: string;
  isToday: boolean;
  totalBilliard: number;
  totalPlaystation: number;
  totalCafe: number;
  debtCollected: number;
  pendingTotal: number;
  debtTransferTotal: number;
  totalRevenue: number;
  totalCash: number;
  totalCard: number;
  totalDebtTransfer: number;
  invoiceCount: number;
  paidCount: number;
  pendingCount: number;
  debtCount: number;
  avgInvoiceAmount: number;
  avgDurationMinutes: number;
  changePercent: number;
  invoices: {
    id: number;
    invoiceNumber: string;
    customerName: string | null;
    tableName: string | null;
    tableType: string | null;
    totalAmount: string;
    status: string;
    paymentMethod: string | null;
    durationMinutes: number | null;
  }[];
}

const PAYMENT_ICON: Record<string, string> = { cash: "💵", card: "💳", debt: "📋" };

export default function DailyReportSection() {
  const { showToast } = useToast();
  const [report, setReport] = useState<DailyReport | null>(null);
  const [date, setDate] = useState(todayJalaali());
  const [loading, setLoading] = useState(false);

  const fetchReport = useCallback(async (d: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/reports/daily?date=${d}`);
      setReport(await res.json());
    } catch {
      showToast("خطا در دریافت گزارش", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { fetchReport(date); }, [date, fetchReport]);

  function handlePrint() {
    window.print();
  }

  if (loading && !report) return <div className="text-center text-slate-400 py-8">در حال بارگذاری...</div>;
  if (!report) return null;

  return (
    <div className="space-y-4">
      {/* Date Navigation */}
      <div className="card">
        <div className="flex items-center gap-2">
          <button className="btn btn-secondary btn-sm" onClick={() => setDate(report.prevDate)}>◀</button>
          <input
            className="form-input flex-1 text-center"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            onBlur={() => fetchReport(date)}
            dir="ltr"
            placeholder="1403/04/25"
          />
          <button className="btn btn-secondary btn-sm" onClick={() => setDate(report.nextDate)}>▶</button>
        </div>
        <div className="flex gap-2 mt-2">
          {!report.isToday && (
            <button className="btn btn-secondary btn-sm flex-1" onClick={() => setDate(todayJalaali())}>
              📅 امروز
            </button>
          )}
          <button className="btn btn-secondary btn-sm flex-1 no-print" onClick={handlePrint}>🖨 چاپ</button>
        </div>
      </div>

      {/* Main Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard title="درآمد بیلیارد" value={report.totalBilliard} color="#1a7a4c" icon="🎱" />
        <StatCard title="درآمد پلی‌استیشن" value={report.totalPlaystation} color="#7c2b8c" icon="🎮" />
        <StatCard title="درآمد کافه" value={report.totalCafe} color="#c9971f" icon="☕" />
        <StatCard title="وصول بدهی" value={report.debtCollected} color="#2a8fa0" icon="💰" />
      </div>

      {/* Total Revenue */}
      <div
        className="rounded-xl p-4 text-center"
        style={{ background: "linear-gradient(135deg, #0d3b26, #14532d)", border: "1px solid #1a7a4c" }}
      >
        <div className="text-slate-300 text-sm mb-1">درآمد کل روز</div>
        <div className="text-4xl font-bold" style={{ color: "#5ee89b" }}>{formatPrice(report.totalRevenue)}</div>
        <div className="flex items-center justify-center gap-2 mt-2">
          <span className="text-xs text-slate-400">تاریخ: {report.date}</span>
          <span
            className={`text-xs font-bold ${
              report.changePercent > 0 ? "text-green-400" : report.changePercent < 0 ? "text-red-400" : "text-slate-400"
            }`}
          >
            {report.changePercent > 0 ? "▲" : report.changePercent < 0 ? "▼" : "•"} {Math.abs(report.changePercent).toLocaleString("fa-IR")}٪ نسبت به دیروز
          </span>
        </div>
      </div>

      {/* Averages */}
      <div className="grid grid-cols-2 gap-3">
        <div className="card text-center">
          <div className="text-[11px] text-slate-500 mb-1">میانگین هر فاکتور</div>
          <div className="text-lg font-bold text-white">{formatPrice(report.avgInvoiceAmount)}</div>
        </div>
        <div className="card text-center">
          <div className="text-[11px] text-slate-500 mb-1">میانگین مدت بازی</div>
          <div className="text-lg font-bold text-white">
            {report.avgDurationMinutes > 0 ? formatDuration(report.avgDurationMinutes) : "—"}
          </div>
        </div>
      </div>

      {/* Payment Breakdown */}
      <div className="card">
        <h3 className="font-bold text-slate-300 mb-3">💳 تفکیک روش پرداخت</h3>
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-slate-400">💵 نقدی:</span>
            <span className="text-white font-bold">{formatPrice(report.totalCash)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-400">💳 کارت:</span>
            <span className="text-white font-bold">{formatPrice(report.totalCard)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-400">📋 انتقال به بدهکاری:</span>
            <span style={{ color: "#e2707a" }} className="font-bold">{formatPrice(report.totalDebtTransfer)}</span>
          </div>
        </div>
      </div>

      {/* Invoice Stats */}
      <div className="card">
        <h3 className="font-bold text-slate-300 mb-3">📊 آمار فاکتورها</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg p-3 text-center" style={{ background: "#0e1512", border: "1px solid #26332a" }}>
            <div className="text-2xl font-bold text-white">{report.invoiceCount.toLocaleString("fa-IR")}</div>
            <div className="text-xs text-slate-400">کل فاکتور</div>
          </div>
          <div className="rounded-lg p-3 text-center" style={{ background: "#0d3b2633", border: "1px solid #1a7a4c" }}>
            <div className="text-2xl font-bold" style={{ color: "#5ee89b" }}>{report.paidCount.toLocaleString("fa-IR")}</div>
            <div className="text-xs text-slate-400">تسویه شده</div>
          </div>
          <div className="rounded-lg p-3 text-center" style={{ background: "#3a2a0c33", border: "1px solid #c9971f" }}>
            <div className="text-2xl font-bold" style={{ color: "#e0b23a" }}>{report.pendingCount.toLocaleString("fa-IR")}</div>
            <div className="text-xs text-slate-400">در انتظار</div>
          </div>
          <div className="rounded-lg p-3 text-center" style={{ background: "#3d101633", border: "1px solid #8f1d2c" }}>
            <div className="text-2xl font-bold" style={{ color: "#f27f8a" }}>{report.debtCount.toLocaleString("fa-IR")}</div>
            <div className="text-xs text-slate-400">بدهکاری</div>
          </div>
        </div>
      </div>

      {/* Pending Invoices */}
      {report.pendingTotal > 0 && (
        <div className="card" style={{ borderColor: "#c9971f" }}>
          <h3 className="font-bold mb-2" style={{ color: "#e0b23a" }}>
            ⏳ فاکتورهای در انتظار: {formatPrice(report.pendingTotal)}
          </h3>
          <div className="space-y-1">
            {report.invoices.filter((i) => i.status === "pending").map((inv) => (
              <div key={inv.id} className="flex justify-between text-sm rounded px-3 py-2" style={{ background: "#0e1512" }}>
                <span className="text-white">{inv.customerName || inv.invoiceNumber}</span>
                <span style={{ color: "#e0b23a" }}>{formatPrice(Number(inv.totalAmount))}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Invoice List */}
      <div className="card">
        <h3 className="font-bold text-slate-300 mb-3">📋 فاکتورهای این روز</h3>
        {report.invoices.length === 0 ? (
          <div className="text-center text-slate-500 py-4">هیچ فاکتوری برای این تاریخ ثبت نشده</div>
        ) : (
          <div className="space-y-2">
            {report.invoices.map((inv) => {
              const statusColor = inv.status === "paid" ? "#5ee89b" : inv.status === "pending" ? "#e0b23a" : "#f27f8a";
              return (
                <div key={inv.id} className="flex items-center justify-between rounded-lg px-3 py-2 text-sm" style={{ background: "#0e1512" }}>
                  <div>
                    <span className="text-white">{inv.customerName || "—"}</span>
                    <span className="text-slate-400 mr-2">{inv.tableName || ""}</span>
                    {inv.durationMinutes && (
                      <span className="text-slate-500 text-xs mr-1">({formatDuration(inv.durationMinutes)})</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {inv.paymentMethod && <span>{PAYMENT_ICON[inv.paymentMethod]}</span>}
                    <span style={{ color: statusColor }} className="font-bold">{formatPrice(Number(inv.totalAmount))}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ title, value, color, icon }: { title: string; value: number; color: string; icon: string }) {
  return (
    <div className="rounded-xl p-3 text-center" style={{ background: color + "22", border: `1px solid ${color}88` }}>
      <div className="text-2xl mb-1">{icon}</div>
      <div className="text-sm font-bold" style={{ color }}>{formatPrice(value)}</div>
      <div className="text-xs text-slate-400 mt-1">{title}</div>
    </div>
  );
}
