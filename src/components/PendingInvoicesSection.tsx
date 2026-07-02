"use client";
import { useState, useEffect, useCallback } from "react";
import { useToast } from "./Toast";
import { formatPrice, formatDuration } from "@/lib/jalaali";

interface Invoice {
  id: number;
  invoiceNumber: string;
  customerName: string | null;
  tableName: string | null;
  tableType: string | null;
  totalAmount: string;
  status: string;
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
      body: JSON.stringify({ status: "paid" }),
    });
    showToast("فاکتور تسویه شد", "success");
    fetch_();
  }

  if (pending.length === 0) return null;

  return (
    <div className="card border-yellow-700 mb-4">
      <h3 className="font-bold text-yellow-400 mb-3 flex items-center gap-2">
        ⏳ <span>فاکتورهای در انتظار تسویه ({pending.length})</span>
      </h3>
      <div className="space-y-2">
        {pending.map((inv) => (
          <div key={inv.id} className="flex items-center justify-between bg-yellow-950/30 border border-yellow-800/50 rounded-lg px-3 py-2">
            <div className="flex-1 min-w-0">
              <div className="text-white text-sm font-medium truncate">
                {inv.customerName || "بدون نام"}
              </div>
              <div className="text-xs text-slate-400">
                {inv.tableName && <span>{inv.tableName} | </span>}
                <span className="font-mono">{inv.invoiceNumber}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 mr-2">
              <span className="text-yellow-400 font-bold text-sm">{formatPrice(Number(inv.totalAmount))}</span>
              <button
                className="btn btn-success btn-sm text-xs"
                onClick={() => settle(inv.id)}
              >✅</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
