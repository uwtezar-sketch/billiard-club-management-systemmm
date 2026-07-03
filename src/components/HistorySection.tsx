"use client";
import { useState, useEffect, useCallback } from "react";
import Modal from "./Modal";
import ConfirmDialog from "./ConfirmDialog";
import { useToast } from "./Toast";
import { formatPrice, formatDuration } from "@/lib/jalaali";

interface InvoiceItem {
  id: number;
  name: string;
  quantity: number;
  unitPrice: string;
  totalPrice: string;
}

interface Invoice {
  id: number;
  invoiceNumber: string;
  customerName: string | null;
  customerPhone: string | null;
  tableType: string | null;
  tableName: string | null;
  startTime: string | null;
  endTime: string | null;
  durationMinutes: number | null;
  pricePerHour: string | null;
  gamePrice: string;
  cafeTotal: string;
  subtotal: string;
  discountType: string | null;
  discountValue: string | null;
  discountAmount: string | null;
  totalAmount: string;
  paymentMethod: string | null;
  status: string;
  isPartial: boolean;
  notes: string | null;
  issuedAt: string;
  settledAt: string | null;
  jalaaliDate: string | null;
  items: InvoiceItem[];
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  paid: { label: "تسویه شده", color: "#16a34a" },
  pending: { label: "در انتظار", color: "#d97706" },
  debt: { label: "بدهکاری", color: "#dc2626" },
};

const PAYMENT_MAP: Record<string, string> = {
  cash: "💵 نقدی",
  card: "💳 کارت",
  debt: "📋 بدهکاری",
};

const TYPE_MAP: Record<string, string> = {
  snooker: "🎱 اسنوکر",
  eightball: "🎳 ایت‌بال",
  playstation: "🎮 پلی‌استیشن",
};

export default function HistorySection() {
  const { showToast } = useToast();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleteInvoiceId, setDeleteInvoiceId] = useState<number | null>(null);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (dateFilter) params.set("date", dateFilter);
      if (typeFilter) params.set("tableType", typeFilter);
      if (search) params.set("search", search);
      const res = await fetch(`/api/invoices?${params}`);
      setInvoices(await res.json());
    } catch {
      showToast("خطا در دریافت تاریخچه", "error");
    } finally {
      setLoading(false);
    }
  }, [search, dateFilter, statusFilter, typeFilter, showToast]);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  async function handleSettleInvoice(id: number) {
    await fetch(`/api/invoices/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "paid" }),
    });
    showToast("فاکتور تسویه شد", "success");
    fetchInvoices();
    setSelectedInvoice(null);
  }

  async function handleDeleteInvoice() {
    if (!deleteInvoiceId) return;
    const res = await fetch(`/api/invoices/${deleteInvoiceId}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      showToast(data.error || "خطا در حذف فاکتور", "error");
      setDeleteInvoiceId(null);
      return;
    }
    showToast("فاکتور حذف شد", "success");
    setDeleteInvoiceId(null);
    setSelectedInvoice(null);
    fetchInvoices();
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="card space-y-3">
        <div className="flex gap-2 flex-wrap">
          <input
            className="form-input flex-1 min-w-32"
            placeholder="جستجو نام یا شماره فاکتور..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <input
            className="form-input w-36"
            placeholder="تاریخ شمسی"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            dir="ltr"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            className={`btn btn-sm ${!statusFilter ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setStatusFilter("")}
          >همه</button>
          {["paid", "pending", "debt"].map((s) => (
            <button
              key={s}
              className={`btn btn-sm ${statusFilter === s ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setStatusFilter(s)}
            >
              {STATUS_MAP[s]?.label}
            </button>
          ))}
          <div className="h-4 w-px bg-slate-600" />
          {["snooker", "eightball", "playstation"].map((t) => (
            <button
              key={t}
              className={`btn btn-sm ${typeFilter === t ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setTypeFilter(typeFilter === t ? "" : t)}
            >
              {TYPE_MAP[t]}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center text-slate-400 py-8">در حال بارگذاری...</div>
      ) : invoices.length === 0 ? (
        <div className="text-center text-slate-500 py-12">فاکتوری یافت نشد</div>
      ) : (
        <div className="space-y-2">
          {invoices.map((inv) => {
            const s = STATUS_MAP[inv.status] || { label: inv.status, color: "#64748b" };
            return (
              <div
                key={inv.id}
                className="card cursor-pointer hover:border-slate-400 transition-colors"
                onClick={() => setSelectedInvoice(inv)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-slate-500 font-mono">{inv.invoiceNumber}</span>
                      <span
                        className="badge text-xs"
                        style={{ background: s.color + "33", color: s.color }}
                      >
                        {s.label}
                      </span>
                      {inv.isPartial && (
                        <span className="badge text-xs" style={{ background: "#1e3a5f", color: "#93c5fd" }}>جزئی</span>
                      )}
                    </div>
                    <div className="mt-1 font-medium text-white">
                      {inv.customerName || "بدون نام"}
                    </div>
                    <div className="text-xs text-slate-400 flex gap-3 flex-wrap mt-1">
                      {inv.tableName && <span>{TYPE_MAP[inv.tableType || ""] || ""} {inv.tableName}</span>}
                      {inv.durationMinutes && <span>⏱ {formatDuration(inv.durationMinutes)}</span>}
                      <span>📅 {inv.jalaaliDate}</span>
                    </div>
                  </div>
                  <div className="text-left">
                    <div className="font-bold text-green-400">{formatPrice(Number(inv.totalAmount))}</div>
                    {inv.paymentMethod && (
                      <div className="text-xs text-slate-400">{PAYMENT_MAP[inv.paymentMethod]}</div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Invoice Detail Modal */}
      <Modal
        open={!!selectedInvoice}
        onClose={() => setSelectedInvoice(null)}
        title={`فاکتور ${selectedInvoice?.invoiceNumber || ""}`}
        size="lg"
      >
        {selectedInvoice && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-2 bg-slate-800 rounded-lg p-3">
              <div><span className="text-slate-400">مشتری:</span> <span className="text-white">{selectedInvoice.customerName || "—"}</span></div>
              <div><span className="text-slate-400">تلفن:</span> <span className="text-white dir-ltr" dir="ltr">{selectedInvoice.customerPhone || "—"}</span></div>
              <div><span className="text-slate-400">میز:</span> <span className="text-white">{selectedInvoice.tableName || "—"}</span></div>
              <div><span className="text-slate-400">تاریخ:</span> <span className="text-white">{selectedInvoice.jalaaliDate}</span></div>
              {selectedInvoice.startTime && (
                <div><span className="text-slate-400">شروع:</span> <span className="text-white">{new Date(selectedInvoice.startTime).toTimeString().slice(0, 5)}</span></div>
              )}
              {selectedInvoice.endTime && (
                <div><span className="text-slate-400">پایان:</span> <span className="text-white">{new Date(selectedInvoice.endTime).toTimeString().slice(0, 5)}</span></div>
              )}
              {selectedInvoice.durationMinutes && (
                <div><span className="text-slate-400">مدت:</span> <span className="text-white">{formatDuration(selectedInvoice.durationMinutes)}</span></div>
              )}
              <div><span className="text-slate-400">روش:</span> <span className="text-white">{PAYMENT_MAP[selectedInvoice.paymentMethod || ""] || "—"}</span></div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-400">هزینه بازی:</span>
                <span className="text-white">{formatPrice(Number(selectedInvoice.gamePrice))}</span>
              </div>
              {Number(selectedInvoice.cafeTotal) > 0 && (
                <>
                  <div className="text-slate-400 font-bold">آیتم‌های کافه:</div>
                  {selectedInvoice.items.map((item) => (
                    <div key={item.id} className="flex justify-between pr-4">
                      <span className="text-white">{item.name} ×{item.quantity}</span>
                      <span className="text-green-400">{formatPrice(Number(item.totalPrice))}</span>
                    </div>
                  ))}
                  <div className="flex justify-between">
                    <span className="text-slate-400">جمع کافه:</span>
                    <span className="text-white">{formatPrice(Number(selectedInvoice.cafeTotal))}</span>
                  </div>
                </>
              )}
              {Number(selectedInvoice.discountAmount) > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-400">تخفیف:</span>
                  <span className="text-red-400">-{formatPrice(Number(selectedInvoice.discountAmount))}</span>
                </div>
              )}
              <div className="divider" />
              <div className="flex justify-between font-bold text-base">
                <span className="text-white">مبلغ نهایی:</span>
                <span className="text-green-400">{formatPrice(Number(selectedInvoice.totalAmount))}</span>
              </div>
            </div>

            {selectedInvoice.notes && (
              <div className="bg-slate-800 rounded-lg p-3">
                <span className="text-slate-400 text-xs">یادداشت: </span>
                <span className="text-white">{selectedInvoice.notes}</span>
              </div>
            )}

            <div className="flex items-center gap-2">
              <span
                className="badge"
                style={{
                  background: (STATUS_MAP[selectedInvoice.status]?.color || "#64748b") + "33",
                  color: STATUS_MAP[selectedInvoice.status]?.color || "#64748b",
                }}
              >
                {STATUS_MAP[selectedInvoice.status]?.label || selectedInvoice.status}
              </span>
              {selectedInvoice.settledAt && (
                <span className="text-xs text-slate-400">
                  تسویه: {new Date(selectedInvoice.settledAt).toLocaleDateString("fa-IR")}
                </span>
              )}
            </div>

            {selectedInvoice.status === "pending" && (
              <button
                className="btn btn-success btn-full"
                onClick={() => handleSettleInvoice(selectedInvoice.id)}
              >
                ✅ تسویه این فاکتور
              </button>
            )}

            <button
              className="btn btn-danger btn-full"
              onClick={() => setDeleteInvoiceId(selectedInvoice.id)}
            >
              🗑️ حذف این فاکتور
            </button>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteInvoiceId}
        message="آیا از حذف این فاکتور مطمئنید؟ این کار قابل بازگشت نیست."
        onConfirm={handleDeleteInvoice}
        onCancel={() => setDeleteInvoiceId(null)}
        danger
      />
    </div>
  );
}
