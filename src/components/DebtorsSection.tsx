"use client";
import { useState, useEffect, useCallback } from "react";
import Modal from "./Modal";
import ConfirmDialog from "./ConfirmDialog";
import { useToast } from "./Toast";
import { formatPrice, todayJalaali, toJalaaliFullLabel } from "@/lib/jalaali";
import CustomerNameAutocomplete from "./CustomerNameAutocomplete";

interface Debt {
  id: number;
  debtorId: number;
  invoiceId: number | null;
  invoiceNumber: string | null;
  amount: string;
  description: string | null;
  isPaid: boolean;
  paidAt: string | null;
  jalaaliDate: string | null;
  createdAt: string;
}

interface DebtorPayment {
  id: number;
  debtorId: number;
  amount: string;
  note: string | null;
  jalaaliDate: string | null;
  byUsername: string | null;
  createdAt: string;
}

interface Debtor {
  id: number;
  name: string;
  phone: string | null;
  notes: string | null;
  totalDebt: string;
  createdAt: string;
  customerId: number | null;
  customerName: string | null;
  debts: Debt[];
  payments: DebtorPayment[];
}

interface MergeSuggestion {
  type: "debtor-customer" | "debtor-debtor";
  debtorId: number;
  debtorName: string;
  debtorPhone: string | null;
  customerId?: number;
  customerName?: string;
  customerPhone?: string;
  targetDebtorId?: number;
  targetDebtorName?: string;
  targetDebtorPhone?: string | null;
  confidence: "high" | "medium";
  reason: string;
}

const OVERDUE_DAYS = 14;

function daysSince(dateStr: string) {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

export default function DebtorsSection() {
  const { showToast } = useToast();
  const [debtors, setDebtors] = useState<Debtor[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filter, setFilter] = useState<"withDebt" | "all">("withDebt");
  const [addDebtorModal, setAddDebtorModal] = useState(false);
  const [addDebtModal, setAddDebtModal] = useState<Debtor | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [confirmSettle, setConfirmSettle] = useState<{ open: boolean; debtorId: number | null; debtId: number | null; all: boolean }>({
    open: false, debtorId: null, debtId: null, all: false,
  });
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [editDebtorModal, setEditDebtorModal] = useState<Debtor | null>(null);
  const [editForm, setEditForm] = useState({ name: "", phone: "", notes: "" });

  const [debtorForm, setDebtorForm] = useState({ name: "", phone: "", notes: "" });
  const [debtForm, setDebtForm] = useState({ amount: "", description: "", jalaaliDate: todayJalaali() });
  const [paymentForm, setPaymentForm] = useState<Record<number, { amount: string; note: string }>>({});
  const [payingId, setPayingId] = useState<number | null>(null);

  async function handleRecordPayment(debtorId: number) {
    const form = paymentForm[debtorId];
    const amount = Number(form?.amount || 0);
    if (!amount || amount <= 0) {
      showToast("مبلغ پرداختی رو درست وارد کن", "error");
      return;
    }
    setPayingId(debtorId);
    try {
      const res = await fetch(`/api/debtors/${debtorId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, note: form?.note || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || "خطا در ثبت پرداخت", "error");
        return;
      }
      showToast("پرداخت ثبت شد", "success");
      setPaymentForm((p) => ({ ...p, [debtorId]: { amount: "", note: "" } }));
      fetchData();
    } finally {
      setPayingId(null);
    }
  }

  // ── ادغام با باشگاه مشتریان ────────────────────────────────────────────
  const [mergeSuggestions, setMergeSuggestions] = useState<MergeSuggestion[]>([]);
  const [suggestionsModal, setSuggestionsModal] = useState(false);
  const [mergeModal, setMergeModal] = useState<Debtor | null>(null);
  const [customerDirectory, setCustomerDirectory] = useState<{ id: number; name: string; phone: string }[]>([]);
  const [mergeCustomerName, setMergeCustomerName] = useState("");
  const [mergeCustomerId, setMergeCustomerId] = useState<number | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<{ message: string; existingDebtorId?: number } | null>(null);

  const fetchMergeSuggestions = useCallback(async () => {
    try {
      const res = await fetch("/api/debtors/merge-suggestions");
      setMergeSuggestions(await res.json());
    } catch {
      // بی‌سروصدا نادیده بگیر — ابزار کمکیه، نه بخش حیاتی
    }
  }, []);

  useEffect(() => {
    fetchMergeSuggestions();
    fetch("/api/customers").then((r) => r.json()).then((d) => setCustomerDirectory(Array.isArray(d) ? d : []));
  }, [fetchMergeSuggestions]);

  async function handleMergeToCustomer(debtorId: number, customerId: number) {
    setLoading(true);
    try {
      const res = await fetch(`/api/debtors/${debtorId}/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "خطا در ادغام", "error");
        return;
      }
      showToast(data.linkedOnly ? "بدهکار به مشتری وصل شد" : "با موفقیت ادغام شد", "success");
      setMergeModal(null);
      setMergeCustomerName("");
      setMergeCustomerId(null);
      fetchData();
      fetchMergeSuggestions();
    } finally {
      setLoading(false);
    }
  }

  async function handleMergeToDebtor(debtorId: number, targetDebtorId: number) {
    setLoading(true);
    try {
      const res = await fetch(`/api/debtors/${debtorId}/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetDebtorId }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "خطا در ادغام", "error");
        return;
      }
      showToast("دو بدهکار با موفقیت ادغام شدند", "success");
      fetchData();
      fetchMergeSuggestions();
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/debtors${debouncedSearch ? `?search=${debouncedSearch}` : ""}`);
      setDebtors(await res.json());
    } catch {
      showToast("خطا در دریافت بدهکاران", "error");
    }
  }, [debouncedSearch, showToast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleAddDebtor(force = false) {
    if (!debtorForm.name) { showToast("نام الزامی است", "error"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/debtors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...debtorForm, force }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showToast("بدهکار اضافه شد", "success");
        setAddDebtorModal(false);
        setDuplicateWarning(null);
        setDebtorForm({ name: "", phone: "", notes: "" });
        fetchData();
      } else if (res.status === 409 && !force) {
        setDuplicateWarning({ message: data.error, existingDebtorId: data.existingDebtorId });
      } else {
        showToast(data.error || "خطا در افزودن بدهکار", "error");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleAddDebt() {
    if (!addDebtModal || !debtForm.amount) { showToast("مبلغ الزامی است", "error"); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/debtors/${addDebtModal.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: Number(debtForm.amount),
          description: debtForm.description || null,
          jalaaliDate: debtForm.jalaaliDate,
        }),
      });
      if (res.ok) {
        showToast("بدهی اضافه شد", "success");
        setAddDebtModal(null);
        setDebtForm({ amount: "", description: "", jalaaliDate: todayJalaali() });
        fetchData();
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleSettle() {
    const { debtorId, debtId, all } = confirmSettle;
    if (!debtorId) return;
    const body: Record<string, unknown> = {};
    if (all) body.settleAll = true;
    else body.debtId = debtId;

    await fetch(`/api/debtors/${debtorId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    showToast(all ? "همه بدهی‌ها تسویه شد" : "بدهی تسویه شد", "success");
    setConfirmSettle({ open: false, debtorId: null, debtId: null, all: false });
    fetchData();
  }

  async function handleDelete() {
    if (!deleteId) return;
    await fetch(`/api/debtors/${deleteId}`, { method: "DELETE" });
    showToast("بدهکار حذف شد", "success");
    setDeleteId(null);
    fetchData();
  }

  async function handleEditDebtor() {
    if (!editDebtorModal || !editForm.name) { showToast("نام الزامی است", "error"); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/debtors/${editDebtorModal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editForm.name, phone: editForm.phone || null, notes: editForm.notes || null }),
      });
      if (res.ok) {
        showToast("اطلاعات بدهکار بروزرسانی شد", "success");
        setEditDebtorModal(null);
        fetchData();
      } else {
        showToast("خطا در ویرایش بدهکار", "error");
      }
    } finally {
      setLoading(false);
    }
  }

  const totalAllDebts = debtors.reduce((s, d) => s + Number(d.totalDebt), 0);

  const enriched = debtors
    .map((d) => {
      const unpaidDebts = d.debts.filter((x) => !x.isPaid);
      const unpaidTotal = unpaidDebts.reduce((s, x) => s + Number(x.amount), 0);
      const oldestDays = unpaidDebts.length > 0 ? Math.max(...unpaidDebts.map((x) => daysSince(x.createdAt))) : 0;
      return { debtor: d, unpaidDebts, unpaidTotal, oldestDays, isOverdue: oldestDays >= OVERDUE_DAYS };
    })
    .filter((e) => (filter === "withDebt" ? e.unpaidTotal > 0 : true))
    .sort((a, b) => b.unpaidTotal - a.unpaidTotal);

  const overdueCount = enriched.filter((e) => e.isOverdue).length;

  function handleExportExcel() {
    const headers = ["نام", "تلفن", "مجموع بدهی معوق", "تعداد ردیف بدهی", "روزهای معوقی", "یادداشت"];
    const rows = enriched.map(({ debtor, unpaidDebts, unpaidTotal, oldestDays }) => [
      debtor.name,
      debtor.phone || "",
      unpaidTotal,
      unpaidDebts.length,
      unpaidDebts.length > 0 ? oldestDays : "",
      debtor.notes || "",
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `بدهکاران-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="rounded-xl p-4" style={{ background: "linear-gradient(135deg, #3d1016, #5c1620)", border: "1px solid #8f1d2c" }}>
        <div className="text-center">
          <div className="text-slate-300 text-sm mb-1">مجموع بدهی‌های معوق</div>
          <div className="text-3xl font-bold" style={{ color: "#f27f8a" }}>{formatPrice(totalAllDebts)}</div>
          <div className="text-xs text-slate-400 mt-1">
            {debtors.filter((d) => Number(d.totalDebt) > 0).length.toLocaleString("fa-IR")} بدهکار
            {overdueCount > 0 && (
              <span className="mr-2" style={{ color: "#e0b23a" }}>
                — ⚠️ {overdueCount.toLocaleString("fa-IR")} مورد بیش از {OVERDUE_DAYS.toLocaleString("fa-IR")} روز معوق
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap">
        <input
          className="form-input flex-1 min-w-32"
          placeholder="جستجو نام یا تلفن..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="btn btn-primary" onClick={() => setAddDebtorModal(true)}>
          ➕ بدهکار جدید
        </button>
        <button className="btn btn-secondary" onClick={() => setSuggestionsModal(true)}>
          🔗 پیشنهاد ادغام{mergeSuggestions.length > 0 ? ` (${mergeSuggestions.length.toLocaleString("fa-IR")})` : ""}
        </button>
        <button className="btn btn-secondary" onClick={handleExportExcel}>
          ⬇️ اکسل
        </button>
      </div>

      <div className="flex gap-2">
        <button
          className={`btn btn-sm ${filter === "withDebt" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setFilter("withDebt")}
        >
          فقط دارای بدهی
        </button>
        <button
          className={`btn btn-sm ${filter === "all" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setFilter("all")}
        >
          همه بدهکاران
        </button>
      </div>

      {enriched.length === 0 ? (
        <div className="text-center text-slate-500 py-12">
          {filter === "withDebt" ? "کسی بدهی معوق نداره 🎉" : "بدهکاری ثبت نشده"}
        </div>
      ) : (
        <div className="space-y-3">
          {enriched.map(({ debtor, unpaidDebts, unpaidTotal, oldestDays, isOverdue }) => {
            const isExpanded = expandedId === debtor.id;

            return (
              <div
                key={debtor.id}
                className="card"
                style={isOverdue ? { borderColor: "#c9971f" } : undefined}
              >
                <div
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : debtor.id)}
                >
                  <div>
                    <div className="font-bold text-white flex items-center gap-2 flex-wrap">
                      {debtor.name}
                      {unpaidDebts.length > 0 && (
                        <span className="badge" style={{ background: "#8f1d2c33", color: "#f27f8a" }}>
                          {unpaidDebts.length.toLocaleString("fa-IR")} ردیف
                        </span>
                      )}
                      {isOverdue && (
                        <span className="badge" style={{ background: "#3a2a0c", color: "#e0b23a" }}>
                          ⚠️ {oldestDays.toLocaleString("fa-IR")} روز
                        </span>
                      )}
                      {debtor.customerId && (
                        <span className="badge" style={{ background: "#2a1a4022", color: "#b794f6" }}>
                          🔗 {debtor.customerName || "وصل به مشتری"}
                        </span>
                      )}
                    </div>
                    {debtor.phone && (
                      <a
                        href={`tel:${debtor.phone}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs text-slate-400 inline-block mt-1"
                        dir="ltr"
                        style={{ color: "#5ecfe0" }}
                      >
                        📞 {debtor.phone}
                      </a>
                    )}
                  </div>
                  <div className="text-left">
                    <div className="font-bold" style={{ color: unpaidTotal > 0 ? "#f27f8a" : "#5ee89b" }}>
                      {formatPrice(unpaidTotal)}
                    </div>
                    <div className="text-xs text-slate-500">کل بدهی</div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="mt-4 space-y-3">
                    {debtor.debts.length > 0 ? (
                      <div className="space-y-2">
                        {debtor.debts.map((debt) => (
                          <div
                            key={debt.id}
                            className="flex items-center justify-between rounded-lg px-3 py-2 text-sm"
                            style={
                              debt.isPaid
                                ? { background: "#0d3b2622", border: "1px solid #1a7a4c55" }
                                : { background: "#3d101622", border: "1px solid #8f1d2c55" }
                            }
                          >
                            <div>
                              <div className="text-white">{debt.description || "بدهی"}</div>
                              <div className="text-xs text-slate-400">
                                {debt.jalaaliDate}
                                {debt.invoiceNumber && ` | فاکتور ${debt.invoiceNumber}`}
                              </div>
                              {debt.isPaid && debt.paidAt && (
                                <div className="text-xs" style={{ color: "#5ee89b" }}>
                                  تسویه: {new Date(debt.paidAt).toLocaleDateString("fa-IR")}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span style={{ color: debt.isPaid ? "#5ee89b" : "#f27f8a" }}>
                                {formatPrice(Number(debt.amount))}
                              </span>
                              {!debt.isPaid && (
                                <button
                                  className="btn btn-success btn-sm text-xs"
                                  onClick={() => setConfirmSettle({ open: true, debtorId: debtor.id, debtId: debt.id, all: false })}
                                >
                                  ✅ تسویه
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center text-slate-500 text-sm">ردیف بدهی وجود ندارد</div>
                    )}

                    {/* ثبت پرداخت دستی — کادر جداگانه، مستقل از ردیف‌های بدهی */}
                    <div className="rounded-lg p-3 space-y-2" style={{ background: "#0d1f16", border: "1px solid #1a7a4c55" }}>
                      <div className="text-sm font-bold" style={{ color: "#5ee89b" }}>💰 ثبت پرداخت</div>
                      <div className="text-xs text-slate-500">
                        مبلغی که پرداخت کرده رو وارد کن — از کل بدهیش کم می‌شه و با تاریخ و ساعت ثبت می‌مونه.
                      </div>
                      <div className="flex gap-2">
                        <input
                          className="form-input flex-1"
                          type="number"
                          dir="ltr"
                          placeholder="مبلغ پرداختی (تومان)"
                          value={paymentForm[debtor.id]?.amount || ""}
                          onChange={(e) =>
                            setPaymentForm((p) => ({ ...p, [debtor.id]: { amount: e.target.value, note: p[debtor.id]?.note || "" } }))
                          }
                        />
                        <button
                          className="btn btn-success btn-sm"
                          disabled={payingId === debtor.id}
                          onClick={() => handleRecordPayment(debtor.id)}
                        >
                          ثبت
                        </button>
                      </div>
                      <input
                        className="form-input"
                        placeholder="توضیح (اختیاری) — مثلاً نقدی گرفتم"
                        value={paymentForm[debtor.id]?.note || ""}
                        onChange={(e) =>
                          setPaymentForm((p) => ({ ...p, [debtor.id]: { amount: p[debtor.id]?.amount || "", note: e.target.value } }))
                        }
                      />

                      {debtor.payments.length > 0 && (
                        <div className="space-y-1 pt-1">
                          {debtor.payments.map((pmt) => (
                            <div key={pmt.id} className="flex justify-between items-center text-xs rounded px-2 py-1.5" style={{ background: "#0e1512" }}>
                              <div>
                                <div className="text-slate-300">{toJalaaliFullLabel(new Date(pmt.createdAt))}</div>
                                {pmt.note && <div className="text-slate-500 mt-0.5">📝 {pmt.note}</div>}
                              </div>
                              <span className="font-bold" style={{ color: "#5ee89b" }}>{formatPrice(Number(pmt.amount))}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2 flex-wrap">
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => { setDebtForm({ amount: "", description: "", jalaaliDate: todayJalaali() }); setAddDebtModal(debtor); }}
                      >
                        ➕ افزودن بدهی
                      </button>
                      {unpaidTotal > 0 && (
                        <button
                          className="btn btn-success btn-sm"
                          onClick={() => setConfirmSettle({ open: true, debtorId: debtor.id, debtId: null, all: true })}
                        >
                          ✅ تسویه کامل
                        </button>
                      )}
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => { setMergeCustomerName(""); setMergeCustomerId(null); setMergeModal(debtor); }}
                      >
                        🔗 {debtor.customerId ? "تغییر اتصال به مشتری" : "ادغام با مشتری"}
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => { setEditForm({ name: debtor.name, phone: debtor.phone || "", notes: debtor.notes || "" }); setEditDebtorModal(debtor); }}
                      >
                        ✏️ ویرایش
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => setDeleteId(debtor.id)}
                      >
                        🗑 حذف
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add Debtor Modal */}
      <Modal open={addDebtorModal} onClose={() => setAddDebtorModal(false)} title="بدهکار جدید">
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">نام *</label>
            <CustomerNameAutocomplete
              value={debtorForm.name}
              directory={customerDirectory}
              onChange={(name, phone) => setDebtorForm((p) => ({ ...p, name, phone: phone && !p.phone ? phone : p.phone }))}
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">شماره تلفن</label>
            <input className="form-input" type="tel" dir="ltr" value={debtorForm.phone} onChange={(e) => setDebtorForm((p) => ({ ...p, phone: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">یادداشت</label>
            <input className="form-input" value={debtorForm.notes} onChange={(e) => setDebtorForm((p) => ({ ...p, notes: e.target.value }))} />
          </div>
          <div className="flex gap-3">
            <button className="btn btn-secondary flex-1" onClick={() => setAddDebtorModal(false)}>انصراف</button>
            <button className="btn btn-primary flex-1" onClick={() => handleAddDebtor()} disabled={loading}>ثبت</button>
          </div>
        </div>
      </Modal>

      {/* Add Debt Modal */}
      <Modal open={!!addDebtModal} onClose={() => setAddDebtModal(null)} title={`افزودن بدهی برای ${addDebtModal?.name || ""}`}>
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">مبلغ (تومان) *</label>
            <input className="form-input" type="number" dir="ltr" value={debtForm.amount} onChange={(e) => setDebtForm((p) => ({ ...p, amount: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">شرح</label>
            <input className="form-input" value={debtForm.description} onChange={(e) => setDebtForm((p) => ({ ...p, description: e.target.value }))} placeholder="شرح بدهی..." />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">تاریخ (شمسی)</label>
            <input className="form-input" value={debtForm.jalaaliDate} onChange={(e) => setDebtForm((p) => ({ ...p, jalaaliDate: e.target.value }))} dir="ltr" />
            <button
              type="button"
              className="btn btn-secondary btn-sm text-xs mt-1"
              onClick={() => setDebtForm((p) => ({ ...p, jalaaliDate: todayJalaali() }))}
            >
              امروز
            </button>
          </div>
          <div className="flex gap-3">
            <button className="btn btn-secondary flex-1" onClick={() => setAddDebtModal(null)}>انصراف</button>
            <button className="btn btn-primary flex-1" onClick={handleAddDebt} disabled={loading}>ثبت بدهی</button>
          </div>
        </div>
      </Modal>

      {/* Edit Debtor Modal */}
      <Modal open={!!editDebtorModal} onClose={() => setEditDebtorModal(null)} title="ویرایش بدهکار">
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">نام *</label>
            <input className="form-input" value={editForm.name} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">شماره تلفن</label>
            <input className="form-input" type="tel" dir="ltr" value={editForm.phone} onChange={(e) => setEditForm((p) => ({ ...p, phone: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">یادداشت</label>
            <input className="form-input" value={editForm.notes} onChange={(e) => setEditForm((p) => ({ ...p, notes: e.target.value }))} />
          </div>
          <div className="flex gap-3">
            <button className="btn btn-secondary flex-1" onClick={() => setEditDebtorModal(null)}>انصراف</button>
            <button className="btn btn-primary flex-1" onClick={handleEditDebtor} disabled={loading}>ذخیره</button>
          </div>
        </div>
      </Modal>

      {/* Merge with customer Modal */}
      <Modal open={!!mergeModal} onClose={() => setMergeModal(null)} title={`ادغام «${mergeModal?.name || ""}» با باشگاه مشتریان`}>
        <div className="space-y-4">
          <div className="text-sm text-slate-400">
            مشتری موردنظر رو از باشگاه مشتریان پیدا کن. اگه اون مشتری از قبل بدهکار دیگه‌ای وصل داشته باشه، بدهی‌های این بدهکار به همون منتقل و رکورد تکراری حذف می‌شه.
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">نام مشتری</label>
            <CustomerNameAutocomplete
              value={mergeCustomerName}
              directory={customerDirectory}
              placeholder="جستجوی نام..."
              onChange={(name) => {
                setMergeCustomerName(name);
                const match = customerDirectory.find((c) => c.name === name);
                setMergeCustomerId(match ? match.id : null);
              }}
            />
          </div>
          <div className="flex gap-3">
            <button className="btn btn-secondary flex-1" onClick={() => setMergeModal(null)}>انصراف</button>
            <button
              className="btn btn-primary flex-1"
              disabled={!mergeCustomerId || loading}
              onClick={() => mergeModal && mergeCustomerId && handleMergeToCustomer(mergeModal.id, mergeCustomerId)}
            >
              🔗 ادغام
            </button>
          </div>
        </div>
      </Modal>

      {/* Merge Suggestions Modal */}
      <Modal open={suggestionsModal} onClose={() => setSuggestionsModal(false)} title="پیشنهادهای ادغام">
        <div className="space-y-3">
          {mergeSuggestions.length === 0 ? (
            <div className="text-center text-slate-500 py-8">هیچ رکورد مشکوک به تکراری‌بودن پیدا نشد 🎉</div>
          ) : (
            mergeSuggestions.map((s, idx) => (
              <div key={idx} className="rounded-lg p-3 space-y-2" style={{ background: "#0e1512", border: "1px solid #26332a" }}>
                <div className="flex items-center justify-between">
                  <div className="text-sm">
                    <span className="text-white font-bold">{s.debtorName}</span>
                    <span className="text-slate-500"> (بدهکار)</span>
                    <span className="text-slate-500 mx-1">↔</span>
                    <span className="text-white font-bold">
                      {s.type === "debtor-customer" ? s.customerName : s.targetDebtorName}
                    </span>
                    <span className="text-slate-500"> ({s.type === "debtor-customer" ? "مشتری" : "بدهکار دیگر"})</span>
                  </div>
                  <span
                    className="badge text-xs"
                    style={{ background: s.confidence === "high" ? "#0d3b2622" : "#3d2c0f33", color: s.confidence === "high" ? "#5ee89b" : "#e0b23a" }}
                  >
                    {s.reason}
                  </span>
                </div>
                <button
                  className="btn btn-primary btn-sm btn-full"
                  disabled={loading}
                  onClick={() =>
                    s.type === "debtor-customer"
                      ? handleMergeToCustomer(s.debtorId, s.customerId!)
                      : handleMergeToDebtor(s.debtorId, s.targetDebtorId!)
                  }
                >
                  🔗 بله، همون یک نفرن — ادغام کن
                </button>
              </div>
            ))
          )}
        </div>
      </Modal>

      {/* Duplicate debtor warning */}
      <ConfirmDialog
        open={!!duplicateWarning}
        message={duplicateWarning?.message || ""}
        confirmText="بازم به‌عنوان بدهکار جدید ثبت کن"
        onConfirm={() => { setDuplicateWarning(null); handleAddDebtor(true); }}
        onCancel={() => setDuplicateWarning(null)}
      />

      {/* Confirm Settle */}
      <ConfirmDialog
        open={confirmSettle.open}
        message={confirmSettle.all ? "آیا از تسویه همه بدهی‌های این مشتری مطمئنید؟" : "آیا این ردیف بدهی تسویه شده است؟"}
        onConfirm={handleSettle}
        onCancel={() => setConfirmSettle({ open: false, debtorId: null, debtId: null, all: false })}
        confirmText="بله، تسویه شد"
      />
      <ConfirmDialog
        open={!!deleteId}
        message="آیا از حذف این بدهکار و تمام بدهی‌های او مطمئنید؟"
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
        danger
      />
    </div>
  );
}
