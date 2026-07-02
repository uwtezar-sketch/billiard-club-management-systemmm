"use client";
import { useState, useEffect, useCallback } from "react";
import { useToast } from "./Toast";
import { formatPrice, todayJalaali, formatDuration } from "@/lib/jalaali";

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

export default function DashboardSection() {
  const { showToast } = useToast();
  const [tables, setTables] = useState<TableStat[]>([]);
  const [pendingInvoices, setPendingInvoices] = useState<Invoice[]>([]);
  const [todayReport, setTodayReport] = useState<{
    totalRevenue: number;
    invoiceCount: number;
    paidCount: number;
    pendingCount: number;
    debtCount: number;
    totalBilliard: number;
    totalPlaystation: number;
    totalCafe: number;
  } | null>(null);
  const [totalDebt, setTotalDebt] = useState(0);

  const fetchAll = useCallback(async () => {
    try {
      const [tablesRes, pendingRes, reportRes, debtorsRes] = await Promise.all([
        fetch("/api/tables"),
        fetch("/api/invoices?status=pending"),
        fetch(`/api/reports/daily?date=${todayJalaali()}`),
        fetch("/api/debtors"),
      ]);
      setTables(await tablesRes.json());
      setPendingInvoices(await pendingRes.json());
      setTodayReport(await reportRes.json());
      const debtors = await debtorsRes.json();
      if (Array.isArray(debtors)) {
        setTotalDebt(debtors.reduce((s: number, d: { totalDebt: string }) => s + Number(d.totalDebt), 0));
      }
    } catch {
      showToast("خطا در دریافت داشبورد", "error");
    }
  }, [showToast]);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 15000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  const activeTables = tables.filter((t) => t.isActive);
  const freeTables = tables.filter((t) => !t.isActive);

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

      {/* Today Revenue */}
      {todayReport && (
        <div className="card">
          <h3 className="font-bold text-slate-300 mb-3">📊 درآمد امروز</h3>
          <div className="text-center mb-3">
            <div className="text-3xl font-bold text-green-400">{formatPrice(todayReport.totalRevenue)}</div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <div className="bg-green-950/40 rounded-lg p-2 border border-green-800">
              <div className="text-green-400 font-bold">{formatPrice(todayReport.totalBilliard)}</div>
              <div className="text-slate-400 text-xs">بیلیارد</div>
            </div>
            <div className="bg-purple-950/40 rounded-lg p-2 border border-purple-800">
              <div className="text-purple-400 font-bold">{formatPrice(todayReport.totalPlaystation)}</div>
              <div className="text-slate-400 text-xs">پلی‌استیشن</div>
            </div>
            <div className="bg-amber-950/40 rounded-lg p-2 border border-amber-800">
              <div className="text-amber-400 font-bold">{formatPrice(todayReport.totalCafe)}</div>
              <div className="text-slate-400 text-xs">کافه</div>
            </div>
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
