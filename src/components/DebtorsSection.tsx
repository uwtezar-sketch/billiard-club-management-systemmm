"use client";
import { useState, useEffect, useCallback } from "react";
import Modal from "./Modal";
import ConfirmDialog from "./ConfirmDialog";
import { useToast } from "./Toast";
import { formatPrice, todayJalaali } from "@/lib/jalaali";

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

interface Debtor {
  id: number;
  name: string;
  phone: string | null;
  notes: string | null;
  totalDebt: string;
  createdAt: string;
  debts: Debt[];
}

export default function DebtorsSection() {
  const { showToast } = useToast();
  const [debtors, setDebtors] = useState<Debtor[]>([]);
  const [search, setSearch] = useState("");
  const [addDebtorModal, setAddDebtorModal] = useState(false);
  const [addDebtModal, setAddDebtModal] = useState<Debtor | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [confirmSettle, setConfirmSettle] = useState<{ open: boolean; debtorId: number | null; debtId: number | null; all: boolean }>({
    open: false, debtorId: null, debtId: null, all: false,
  });
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const [debtorForm, setDebtorForm] = useState({ name: "", phone: "", notes: "" });
  const [debtForm, setDebtForm] = useState({ amount: "", description: "", jalaaliDate: todayJalaali() });

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/debtors${search ? `?search=${search}` : ""}`);
      setDebtors(await res.json());
    } catch {
      showToast("خطا در دریافت بدهکاران", "error");
    }
  }, [search, showToast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleAddDebtor() {
    if (!debtorForm.name) { showToast("نام الزامی است", "error"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/debtors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(debtorForm),
      });
      if (res.ok) {
        showToast("بدهکار اضافه شد", "success");
        setAddDebtorModal(false);
        setDebtorForm({ name: "", phone: "", notes: "" });
        fetchData();
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

  const totalAllDebts = debtors.reduce((s, d) => s + Number(d.totalDebt), 0);

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="card" style={{ background: "linear-gradient(135deg, #7f1d1d, #991b1b)", border: "1px solid #dc2626" }}>
        <div className="text-center">
          <div className="text-slate-300 text-sm mb-1">مجموع بدهی‌های معوق</div>
          <div className="text-3xl font-bold text-red-300">{formatPrice(totalAllDebts)}</div>
          <div className="text-xs text-slate-400 mt-1">{debtors.length} بدهکار</div>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap">
        <input
          className="form-input flex-1 min-w-32"
          placeholder="جستجو نام یا تلفن..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="btn btn-danger" onClick={() => setAddDebtorModal(true)}>
          ➕ بدهکار جدید
        </button>
      </div>

      {debtors.length === 0 ? (
        <div className="text-center text-slate-500 py-12">بدهکاری ثبت نشده</div>
      ) : (
        <div className="space-y-3">
          {debtors.map((debtor) => {
            const unpaidDebts = debtor.debts.filter((d) => !d.isPaid);
            const unpaidTotal = unpaidDebts.reduce((s, d) => s + Number(d.amount), 0);
            const isExpanded = expandedId === debtor.id;

            return (
              <div key={debtor.id} className="card">
                <div
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : debtor.id)}
                >
                  <div>
                    <div className="font-bold text-white flex items-center gap-2">
                      {debtor.name}
                      {unpaidTotal > 0 && (
                        <span className="badge" style={{ background: "#7f1d1d", color: "#fca5a5" }}>
                          {unpaidDebts.length} ردیف
                        </span>
                      )}
                    </div>
                    {debtor.phone && (
                      <div className="text-xs text-slate-400" dir="ltr">{debtor.phone}</div>
                    )}
                  </div>
                  <div className="text-left">
                    <div className="text-red-400 font-bold">{formatPrice(unpaidTotal)}</div>
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
                            className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
                              debt.isPaid ? "bg-green-950/40 border border-green-800" : "bg-red-950/40 border border-red-800"
                            }`}
                          >
                            <div>
                              <div className="text-white">{debt.description || "بدهی"}</div>
                              <div className="text-xs text-slate-400">
                                {debt.jalaaliDate}
                                {debt.invoiceNumber && ` | فاکتور ${debt.invoiceNumber}`}
                              </div>
                              {debt.isPaid && debt.paidAt && (
                                <div className="text-xs text-green-400">
                                  تسویه: {new Date(debt.paidAt).toLocaleDateString("fa-IR")}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={debt.isPaid ? "text-green-400" : "text-red-400"}>
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
            <input className="form-input" value={debtorForm.name} onChange={(e) => setDebtorForm((p) => ({ ...p, name: e.target.value }))} />
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
            <button className="btn btn-danger flex-1" onClick={handleAddDebtor} disabled={loading}>ثبت</button>
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
          </div>
          <div className="flex gap-3">
            <button className="btn btn-secondary flex-1" onClick={() => setAddDebtModal(null)}>انصراف</button>
            <button className="btn btn-danger flex-1" onClick={handleAddDebt} disabled={loading}>ثبت بدهی</button>
          </div>
        </div>
      </Modal>

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
