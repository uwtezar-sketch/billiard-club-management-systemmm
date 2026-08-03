"use client";
import { useState, useEffect, useCallback } from "react";
import { useToast } from "./Toast";
import { formatPrice, formatDuration } from "@/lib/jalaali";

interface Share {
  id: number;
  label: string;
  amount: string;
  status: string;
}

interface Invoice {
  id: number;
  invoiceNumber: string;
  customerName: string | null;
  tableName: string | null;
  tableType: string | null;
  totalAmount: string;
  status: string;
  isSplit: boolean;
  shares: Share[];
  durationMinutes: number | null;
  issuedAt: string;
  jalaaliDate: string | null;
  notes: string | null;
}

export default function PendingInvoicesWidget() {
  const { showToast } = useToast();
  const [pending, setPending] = useState<Invoice[]>([]);

  const fetch_ = useCallback(async () => {
    const res = await fetch("/api/invoices?status=pending");
    const data = await res.json();
    setPending(Array.isArray(data) ? data : []);
  }, []);

  useEffect(() => {
    fetch_();
    const interval = setInterval(fetch_, 15000);
    return () => clearInterval(interval);
  }, [fetch_]);

  async function settle(id: number) {
    await fetch(`/api/invoices/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "paid", paymentMethod: "cash" }),
    });
    showToast("فاکتور تسویه شد", "success");
    fetch_();
  }

  async function settleShare(invoiceId: number, shareId: number, method: "cash" | "card") {
    await fetch(`/api/invoices/${invoiceId}/shares/${shareId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "paid", paymentMethod: method }),
    });
    showToast("سهم تسویه شد", "success");
    fetch_();
  }

  if (pending.length === 0) return null;

  return (
    <div className="card border-yellow-700 mb-4">
      <h3 className="font-bold text-yellow-400 mb-3 flex items-center gap-2">
        ⏳ <span>فاکتورهای در انتظار تسویه ({pending.length})</span>
      </h3>
      <div className="space-y-2">
        {pending.map((inv) => {
          const pendingShares = inv.isSplit ? inv.shares.filter((s) => s.status === "pending") : [];
          return (
            <div key={inv.id} className="bg-yellow-950/30 border border-yellow-800/50 rounded-lg px-3 py-2">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="text-white text-sm font-medium truncate">
                    {inv.customerName || "بدون نام"} {inv.isSplit && <span className="text-yellow-500 text-xs">(تقسیم‌شده)</span>}
                  </div>
                  <div className="text-xs text-slate-400">
                    {inv.tableName && <span>{inv.tableName} | </span>}
                    <span className="font-mono">{inv.invoiceNumber}</span>
                  </div>
                </div>
                {!inv.isSplit && (
                  <div className="flex items-center gap-2 mr-2">
                    <span className="text-yellow-400 font-bold text-sm">{formatPrice(Number(inv.totalAmount))}</span>
                    <button className="btn btn-success btn-sm text-xs" onClick={() => settle(inv.id)}>✅</button>
                  </div>
                )}
              </div>

              {inv.isSplit && (
                <div className="mt-2 space-y-1">
                  {pendingShares.map((s) => (
                    <div key={s.id} className="flex items-center justify-between bg-slate-800/60 rounded px-2 py-1">
                      <span className="text-white text-xs">{s.label}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-yellow-400 text-xs font-bold">{formatPrice(Number(s.amount))}</span>
                        <button className="btn btn-success btn-sm text-xs" onClick={() => settleShare(inv.id, s.id, "cash")}>💵</button>
                        <button className="btn btn-success btn-sm text-xs" onClick={() => settleShare(inv.id, s.id, "card")}>💳</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
