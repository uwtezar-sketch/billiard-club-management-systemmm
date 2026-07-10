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
  issuedByUsername: string | null;
  settledAt: string | null;
  jalaaliDate: string | null;
  items: InvoiceItem[];
}

interface Debtor {
  id: number;
  name: string;
  phone: string | null;
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  paid: { label: "تسویه شده", color: "#5ee89b" },
  pending: { label: "در انتظار", color: "#e0b23a" },
  debt: { label: "بدهکاری", color: "#f27f8a" },
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

const RANGE_OPTIONS = [
  { id: "7", label: "۷ روز اخیر" },
  { id: "30", label: "۳۰ روز اخیر" },
  { id: "", label: "همه" },
];

export default function HistorySection() {
  const { showToast } = useToast();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [showAdvancedDate, setShowAdvancedDate] = useState(false);
  const [daysFilter, setDaysFilter] = useState("30");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("");
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleteInvoiceId, setDeleteInvoiceId] = useState<number | null>(null);

  const [editMethod, setEditMethod] = useState<string>("cash");
  const [editStatus, setEditStatus] = useState<string>("pending");
  const [debtorsList, setDebtorsList] = useState<Debtor[]>([]);
  const [editDebtorId, setEditDebtorId] = useState<number | "">("");
  const [editNewDebtorName, setEditNewDebtorName] = useState("");
  const [editNewDebtorPhone, setEditNewDebtorPhone] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (paymentFilter) params.set("paymentMethod", paymentFilter);
      if (dateFilter) params.set("date", dateFilter);
      else if (daysFilter) params.set("days", daysFilter);
      if (typeFilter) params.set("tableType", typeFilter);
      if (search) params.set("search", search);
      const res = await fetch(`/api/invoices?${params}`);
      setInvoices(await res.json());
    } catch {
      showToast("خطا در دریافت تاریخچه", "error");
    } finally {
      setLoading(false);
    }
  }, [search, dateFilter, daysFilter, statusFilter, typeFilter, paymentFilter, showToast]);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  useEffect(() => {
    if (selectedInvoice) {
      setEditMethod(selectedInvoice.paymentMethod || "cash");
      setEditStatus(selectedInvoice.status === "debt" ? "pending" : selectedInvoice.status);
      setEditDebtorId("");
      setEditNewDebtorName(selectedInvoice.customerName || "");
      setEditNewDebtorPhone(selectedInvoice.customerPhone || "");
    }
  }, [selectedInvoice]);

  useEffect(() => {
    if (editMethod === "debt" && selectedInvoice?.status !== "debt") {
      fetch("/api/debtors").then((r) => r.json()).then((d) => setDebtorsList(Array.isArray(d) ? d : []));
    }
  }, [editMethod, selectedInvoice]);

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

  async function handleSavePaymentEdit() {
    if (!selectedInvoice) return;
    const body: Record<string, unknown> = { paymentMethod: editMethod };

    const movingToDebt = editMethod === "debt" && selectedInvoice.status !== "debt";
    if (movingToDebt) {
      if (editDebtorId) {
        body.debtorId = editDebtorId;
      } else {
        if (!editNewDebtorName) {
          showToast("نام بدهکار را وارد کنید", "error");
          return;
        }
        body.newDebtorName = editNewDebtorName;
        body.newDebtorPhone = editNewDebtorPhone || null;
      }
    } else if (editMethod !== "debt") {
      body.status = editStatus;
    }

    setSavingEdit(true);
    try {
      const res = await fetch(`/api/invoices/${selectedInvoice.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || "خطا در بروزرسانی فاکتور", "error");
        return;
      }
      showToast("فاکتور بروزرسانی شد", "success");
      setSelectedInvoice(null);
      fetchInvoices();
    } finally {
      setSavingEdit(false);
    }
  }

  const totalAmountSum = invoices.reduce((s, i) => s + Number(i.totalAmount), 0);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="card space-y-3">
        <input
          className="form-input"
          placeholder="جستجو نام یا شماره فاکتور..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {/* بازه زمانی */}
        <div className="flex gap-2 flex-wrap items-center">
          {RANGE_OPTIONS.map((r) => (
            <button
              key={r.id}
              className={`btn btn-sm ${!dateFilter && daysFilter === r.id ? "btn-primary" : "btn-secondary"}`}
              onClick={() => { setDateFilter(""); setDaysFilter(r.id); }}
            >
              {r.label}
            </button>
          ))}
          <button
            className={`btn btn-sm ${dateFilter ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setShowAdvancedDate((v) => !v)}
          >
            📅 تاریخ خاص
          </button>
        </div>
        {showAdvancedDate && (
          <input
            className="form-input w-full"
            placeholder="تاریخ شمسی (مثلاً 1403/04/25)"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            dir="ltr"
          />
        )}

        {/* وضعیت */}
        <div className="flex gap-2 flex-wrap">
          <button
            className={`btn btn-sm ${!statusFilter ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setStatusFilter("")}
          >همه وضعیت‌ها</button>
          {["paid", "pending", "debt"].map((s) => (
            <button
              key={s}
              className={`btn btn-sm ${statusFilter === s ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setStatusFilter(statusFilter === s ? "" : s)}
            >
              {STATUS_MAP[s]?.label}
            </button>
          ))}
        </div>

        {/* نوع میز و روش پرداخت */}
        <div className="flex gap-2 flex-wrap">
          {["snooker", "eightball", "playstation"].map((t) => (
            <button
              key={t}
              className={`btn btn-sm ${typeFilter === t ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setTypeFilter(typeFilter === t ? "" : t)}
            >
              {TYPE_MAP[t]}
            </button>
          ))}
          <div className="h-4 w-px bg-slate-600 self-center" />
          {["cash", "card", "debt"].map((p) => (
            <button
              key={p}
              className={`btn btn-sm ${paymentFilter === p ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setPaymentFilter(paymentFilter === p ? "" : p)}
            >
              {PAYMENT_MAP[p]}
            </button>
          ))}
        </div>
      </div>

      {/* Summary */}
      {!loading && invoices.length > 0 && (
        <div className="rounded-xl p-3 flex items-center justify-between" style={{ background: "#0d3b2622", border: "1px solid #1a7a4c55" }}>
          <span className="text-sm text-slate-400">{invoices.length.toLocaleString("fa-IR")} فاکتور</span>
          <span className="font-bold" style={{ color: "#5ee89b" }}>{formatPrice(totalAmountSum)}</span>
        </div>
      )}

      {loading ? (
        <div className="text-center text-slate-400 py-8">در حال بارگذاری...</div>
      ) : invoices.length === 0 ? (
        <div className="text-center text-slate-500 py-12">فاکتوری یافت نشد</div>
      ) : (
        <div className="space-y-2">
          {invoices.map((inv) => {
            const s = STATUS_MAP[inv.status] || { label: inv.status, color: "#8a9488" };
            const time = new Date(inv.issuedAt).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" });
            return (
              <div
                key={inv.id}
                className="card cursor-pointer transition-colors"
                onClick={() => setSelectedInvoice(inv)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-slate-500 font-mono">{inv.invoiceNumber}</span>
                      <span
                        className="badge text-xs"
                        style={{ background: s.color + "22", color: s.color }}
                      >
                        {s.label}
                      </span>
                      {inv.isPartial && (
                        <span className="badge text-xs" style={{ background: "#2a8fa022", color: "#5ecfe0" }}>جزئی</span>
                      )}
                    </div>
                    <div className="mt-1 font-medium text-white">
                      {inv.customerName || "بدون نام"}
                    </div>
                    <div className="text-xs text-slate-400 flex gap-3 flex-wrap mt-1">
                      {inv.tableName && <span>{TYPE_MAP[inv.tableType || ""] || ""} {inv.tableName}</span>}
                      {inv.durationMinutes && <span>⏱ {formatDuration(inv.durationMinutes)}</span>}
                      <span>📅 {inv.jalaaliDate} — {time}</span>
                      {inv.issuedByUsername && <span>👤 {inv.issuedByUsername}</span>}
                    </div>
                  </div>
                  <div className="text-left">
                    <div className="font-bold" style={{ color: "#5ee89b" }}>{formatPrice(Number(inv.totalAmount))}</div>
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
            <div className="grid grid-cols-2 gap-2 rounded-lg p-3" style={{ background: "#0e1512" }}>
              <div><span className="text-slate-400">مشتری:</span> <span className="text-white">{selectedInvoice.customerName || "—"}</span></div>
              <div><span className="text-slate-400">تلفن:</span> <span className="text-white" dir="ltr">{selectedInvoice.customerPhone || "—"}</span></div>
              <div><span className="text-slate-400">میز:</span> <span className="text-white">{selectedInvoice.tableName || "—"}</span></div>
              <div><span className="text-slate-400">تاریخ:</span> <span className="text-white">{selectedInvoice.jalaaliDate}</span></div>
              {selectedInvoice.issuedByUsername && (
                <div><span className="text-slate-400">ثبت‌شده توسط:</span> <span className="text-white">{selectedInvoice.issuedByUsername}</span></div>
              )}
              {selectedInvoice.startTime && (
                <div><span className="text-slate-400">شروع:</span> <span className="text-white">{new Date(selectedInvoice.startTime).toTimeString().slice(0, 5)}</span></div>
              )}
              {selectedInvoice.endTime && (
                <div><span className="text-slate-400">پایان:</span> <span className="text-white">{new Date(selectedInvoice.endTime).toTimeString().slice(0, 5)}</span></div>
              )}
              {selectedInvoice.durationMinutes && (
                <div><span className="text-slate-400">مدت:</span> <span className="text-white">{formatDuration(selectedInvoice.durationMinutes)}</span></div>
              )}
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
                      <span style={{ color: "#5ee89b" }}>{formatPrice(Number(item.totalPrice))}</span>
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
                  <span style={{ color: "#f27f8a" }}>-{formatPrice(Number(selectedInvoice.discountAmount))}</span>
                </div>
              )}
              <div className="divider" />
              <div className="flex justify-between font-bold text-base">
                <span className="text-white">مبلغ نهایی:</span>
                <span style={{ color: "#5ee89b" }}>{formatPrice(Number(selectedInvoice.totalAmount))}</span>
              </div>
            </div>

            {selectedInvoice.notes && (
              <div className="rounded-lg p-3" style={{ background: "#0e1512" }}>
                <span className="text-slate-400 text-xs">یادداشت: </span>
                <span className="text-white">{selectedInvoice.notes}</span>
              </div>
            )}

            {/* ویرایش روش پرداخت و وضعیت تسویه */}
            <div className="rounded-lg p-3 space-y-3" style={{ background: "#0e1512", border: "1px solid #26332a" }}>
              <div>
                <div className="text-xs text-slate-400 mb-2">روش پرداخت</div>
                <div className="flex gap-2">
                  {(["cash", "card", "debt"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setEditMethod(m)}
                      className={`btn btn-sm flex-1 ${editMethod === m ? "btn-primary" : "btn-secondary"}`}
                    >
                      {PAYMENT_MAP[m]}
                    </button>
                  ))}
                </div>
              </div>

              {editMethod === "debt" && selectedInvoice.status !== "debt" && (
                <div className="space-y-2">
                  <div className="text-xs text-slate-400">انتخاب بدهکار</div>
                  <select
                    className="form-input"
                    value={editDebtorId}
                    onChange={(e) => setEditDebtorId(e.target.value ? Number(e.target.value) : "")}
                  >
                    <option value="">+ بدهکار جدید</option>
                    {debtorsList.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}{d.phone ? ` (${d.phone})` : ""}</option>
                    ))}
                  </select>
                  {!editDebtorId && (
                    <>
                      <input
                        className="form-input"
                        placeholder="نام بدهکار جدید"
                        value={editNewDebtorName}
                        onChange={(e) => setEditNewDebtorName(e.target.value)}
                      />
                      <input
                        className="form-input"
                        placeholder="شماره تلفن (اختیاری)"
                        dir="ltr"
                        value={editNewDebtorPhone}
                        onChange={(e) => setEditNewDebtorPhone(e.target.value)}
                      />
                    </>
                  )}
                </div>
              )}

              {editMethod === "debt" && selectedInvoice.status === "debt" && (
                <div className="text-xs" style={{ color: "#e0b23a" }}>این فاکتور همین الان هم روی بدهکاری ثبت شده.</div>
              )}

              {editMethod !== "debt" && (
                <div>
                  <div className="text-xs text-slate-400 mb-2">وضعیت تسویه</div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditStatus("pending")}
                      className={`btn btn-sm flex-1 ${editStatus === "pending" ? "btn-primary" : "btn-secondary"}`}
                    >
                      ⏳ در انتظار
                    </button>
                    <button
                      onClick={() => setEditStatus("paid")}
                      className={`btn btn-sm flex-1 ${editStatus === "paid" ? "btn-success" : "btn-secondary"}`}
                    >
                      ✅ تسویه شده
                    </button>
                  </div>
                </div>
              )}

              <button
                className="btn btn-primary btn-full"
                onClick={handleSavePaymentEdit}
                disabled={savingEdit}
              >
                💾 ذخیره تغییرات پرداخت
              </button>
            </div>

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
