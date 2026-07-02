"use client";
import { useState, useEffect, useCallback } from "react";
import { useToast } from "./Toast";
import { formatPrice, todayJalaali } from "@/lib/jalaali";

interface DailyReport {
  date: string;
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

export default function DailyReportSection() {
  const { showToast } = useToast();
  const [report, setReport] = useState<DailyReport | null>(null);
  const [date, setDate] = useState(todayJalaali());
  const [loading, setLoading] = useState(false);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/reports/daily?date=${date}`);
      setReport(await res.json());
    } catch {
      showToast("خطا در دریافت گزارش", "error");
    } finally {
      setLoading(false);
    }
  }, [date, showToast]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  function handlePrint() {
    window.print();
  }

  if (loading) return <div className="text-center text-slate-400 py-8">در حال بارگذاری...</div>;
  if (!report) return null;

  return (
    <div className="space-y-4">
      {/* Date Picker */}
      <div className="flex gap-3 items-center">
        <div className="flex-1">
          <label className="block text-xs text-slate-400 mb-1">تاریخ گزارش (شمسی)</label>
          <input
            className="form-input"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            dir="ltr"
            placeholder="1403/04/25"
          />
        </div>
        <button className="btn btn-primary mt-4" onClick={fetchReport}>🔄 بروزرسانی</button>
        <button className="btn btn-secondary mt-4 no-print" onClick={handlePrint}>🖨 چاپ</button>
      </div>

      {/* Main Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard title="درآمد بیلیارد" value={report.totalBilliard} color="#22c55e" icon="🎱" />
        <StatCard title="درآمد پلی‌استیشن" value={report.totalPlaystation} color="#8b5cf6" icon="🎮" />
        <StatCard title="درآمد کافه" value={report.totalCafe} color="#f59e0b" icon="☕" />
        <StatCard title="وصول بدهی" value={report.debtCollected} color="#06b6d4" icon="💰" />
      </div>

      {/* Total Revenue */}
      <div
        className="rounded-xl p-4 text-center"
        style={{ background: "linear-gradient(135deg, #065f46, #047857)", border: "1px solid #10b981" }}
      >
        <div className="text-slate-300 text-sm mb-1">درآمد کل روز</div>
        <div className="text-4xl font-bold text-green-300">{formatPrice(report.totalRevenue)}</div>
        <div className="text-xs text-slate-400 mt-2">تاریخ: {report.date}</div>
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
            <span className="text-red-400 font-bold">{formatPrice(report.totalDebtTransfer)}</span>
          </div>
        </div>
      </div>

      {/* Invoice Stats */}
      <div className="card">
        <h3 className="font-bold text-slate-300 mb-3">📊 آمار فاکتورها</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-800 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-white">{report.invoiceCount}</div>
            <div className="text-xs text-slate-400">کل فاکتور</div>
          </div>
          <div className="bg-green-950/50 rounded-lg p-3 text-center border border-green-800">
            <div className="text-2xl font-bold text-green-400">{report.paidCount}</div>
            <div className="text-xs text-slate-400">تسویه شده</div>
          </div>
          <div className="bg-yellow-950/50 rounded-lg p-3 text-center border border-yellow-800">
            <div className="text-2xl font-bold text-yellow-400">{report.pendingCount}</div>
            <div className="text-xs text-slate-400">در انتظار</div>
          </div>
          <div className="bg-red-950/50 rounded-lg p-3 text-center border border-red-800">
            <div className="text-2xl font-bold text-red-400">{report.debtCount}</div>
            <div className="text-xs text-slate-400">بدهکاری</div>
          </div>
        </div>
      </div>

      {/* Pending Invoices */}
      {report.pendingTotal > 0 && (
        <div className="card border-yellow-800">
          <h3 className="font-bold text-yellow-400 mb-2">⏳ فاکتورهای در انتظار: {formatPrice(report.pendingTotal)}</h3>
          <div className="space-y-1">
            {report.invoices.filter((i) => i.status === "pending").map((inv) => (
              <div key={inv.id} className="flex justify-between text-sm bg-slate-800 rounded px-3 py-2">
                <span className="text-white">{inv.customerName || inv.invoiceNumber}</span>
                <span className="text-yellow-400">{formatPrice(Number(inv.totalAmount))}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Invoice List */}
      <div className="card">
        <h3 className="font-bold text-slate-300 mb-3">📋 فاکتورهای امروز</h3>
        {report.invoices.length === 0 ? (
          <div className="text-center text-slate-500 py-4">هیچ فاکتوری برای این تاریخ ثبت نشده</div>
        ) : (
          <div className="space-y-2">
            {report.invoices.map((inv) => {
              const statusColor = inv.status === "paid" ? "#22c55e" : inv.status === "pending" ? "#f59e0b" : "#ef4444";
              return (
                <div key={inv.id} className="flex items-center justify-between bg-slate-800 rounded-lg px-3 py-2 text-sm">
                  <div>
                    <span className="text-white">{inv.customerName || "—"}</span>
                    <span className="text-slate-400 mr-2">{inv.tableName || ""}</span>
                  </div>
                  <div className="flex items-center gap-2">
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
    <div className="rounded-xl p-3 text-center" style={{ background: color + "22", border: `1px solid ${color}55` }}>
      <div className="text-2xl mb-1">{icon}</div>
      <div className="text-sm font-bold" style={{ color }}>{formatPrice(value)}</div>
      <div className="text-xs text-slate-400 mt-1">{title}</div>
    </div>
  );
}
