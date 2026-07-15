"use client";
import { useState, useEffect, useCallback } from "react";
import Modal from "./Modal";
import ConfirmDialog from "./ConfirmDialog";
import { useToast } from "./Toast";
import { formatPrice } from "@/lib/jalaali";

interface Customer {
  id: number;
  name: string;
  phone: string;
  notes: string | null;
  isVip: boolean;
  createdAt: string;
  visitCount: number;
  totalSpent: number;
  cafeSpent: number;
  lastVisit: string | null;
  daysSinceVisit: number | null;
}

interface CustomerDetail extends Customer {
  gameSpent: number;
  favoriteType: string | null;
  favoriteCafeItems: { name: string; quantity: number }[];
  invoices: {
    id: number;
    invoiceNumber: string;
    jalaaliDate: string | null;
    totalAmount: string;
    tableName: string | null;
    status: string;
  }[];
}

interface Suggestion {
  phone: string;
  name: string;
  count: number;
  totalSpent: number;
}

const TYPE_LABELS: Record<string, string> = {
  snooker: "🎱 اسنوکر",
  eightball: "🎳 ایت‌بال",
  playstation: "🎮 پلی‌استیشن",
};

const INACTIVE_DAYS = 30;

export default function CustomersSection() {
  const { showToast } = useToast();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [addModal, setAddModal] = useState(false);
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({ name: "", phone: "", notes: "", isVip: false });

  const fetchCustomers = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("search", debouncedSearch);
      const res = await fetch(`/api/customers?${params}`);
      setCustomers(await res.json());
    } catch {
      showToast("خطا در دریافت باشگاه مشتریان", "error");
    }
  }, [debouncedSearch, showToast]);

  const fetchSuggestions = useCallback(async () => {
    try {
      const res = await fetch("/api/customers/suggestions");
      setSuggestions(await res.json());
    } catch {
      // بی‌سروصدا نادیده گرفته میشه
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => { fetchCustomers(); }, [fetchCustomers]);
  useEffect(() => { fetchSuggestions(); }, [fetchSuggestions]);

  function resetForm() {
    setForm({ name: "", phone: "", notes: "", isVip: false });
  }

  function openAddFromSuggestion(s: Suggestion) {
    setForm({ name: s.name, phone: s.phone, notes: "", isVip: false });
    setAddModal(true);
  }

  async function handleAdd() {
    if (!form.name || !form.phone) {
      showToast("نام و شماره تلفن الزامی است", "error");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || "خطا در ثبت مشتری", "error");
        return;
      }
      showToast("مشتری به باشگاه اضافه شد", "success");
      setAddModal(false);
      resetForm();
      fetchCustomers();
      fetchSuggestions();
    } finally {
      setLoading(false);
    }
  }

  async function openDetail(id: number) {
    setDetailLoading(true);
    setEditing(false);
    try {
      const res = await fetch(`/api/customers/${id}`);
      const data = await res.json();
      setDetail(data);
      setForm({ name: data.name, phone: data.phone, notes: data.notes || "", isVip: data.isVip });
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleSaveEdit() {
    if (!detail) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/customers/${detail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        showToast("خطا در ذخیره تغییرات", "error");
        return;
      }
      showToast("اطلاعات مشتری بروزرسانی شد", "success");
      setEditing(false);
      openDetail(detail.id);
      fetchCustomers();
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    await fetch(`/api/customers/${deleteId}`, { method: "DELETE" });
    showToast("مشتری از باشگاه حذف شد", "success");
    setDeleteId(null);
    setDetail(null);
    fetchCustomers();
    fetchSuggestions();
  }

  return (
    <div className="space-y-4">
      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div className="card" style={{ borderColor: "#c9971f" }}>
          <button
            className="flex items-center justify-between w-full"
            onClick={() => setShowSuggestions((v) => !v)}
          >
            <h3 className="font-bold" style={{ color: "#e0b23a" }}>
              💡 پیشنهاد مشتری ثابت ({suggestions.length.toLocaleString("fa-IR")})
            </h3>
            <span className="text-slate-500">{showSuggestions ? "▲" : "▼"}</span>
          </button>
          {showSuggestions && (
            <div className="space-y-2 mt-3">
              {suggestions.map((s) => (
                <div key={s.phone} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: "#0e1512" }}>
                  <div>
                    <div className="text-white text-sm">{s.name}</div>
                    <div className="text-xs text-slate-400" dir="ltr">{s.phone}</div>
                    <div className="text-xs text-slate-500">{s.count.toLocaleString("fa-IR")} بار مراجعه — {formatPrice(s.totalSpent)}</div>
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={() => openAddFromSuggestion(s)}>
                    ➕ افزودن
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex gap-3 flex-wrap">
        <input
          className="form-input flex-1 min-w-32"
          placeholder="جستجو نام یا تلفن..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="btn btn-primary" onClick={() => { resetForm(); setAddModal(true); }}>
          ➕ مشتری جدید
        </button>
      </div>

      {customers.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-4xl mb-2">🎖️</div>
          <div className="text-slate-500">هنوز مشتری‌ای به باشگاه اضافه نشده</div>
        </div>
      ) : (
        <div className="space-y-2">
          {customers.map((c) => {
            const inactive = c.daysSinceVisit !== null && c.daysSinceVisit >= INACTIVE_DAYS;
            return (
              <div key={c.id} className="card cursor-pointer" onClick={() => openDetail(c.id)}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-white">{c.name}</span>
                      {c.isVip && (
                        <span className="badge" style={{ background: "#3a2a0c", color: "#e0b23a" }}>⭐ VIP</span>
                      )}
                      {inactive && (
                        <span className="badge" style={{ background: "#26332a", color: "#8a9488" }}>
                          {c.daysSinceVisit?.toLocaleString("fa-IR")} روز غایب
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 mt-1" dir="ltr">{c.phone}</div>
                    <div className="text-xs text-slate-500 mt-1">
                      {c.visitCount.toLocaleString("fa-IR")} بار مراجعه
                      {c.cafeSpent > 0 && ` — کافه: ${formatPrice(c.cafeSpent)}`}
                    </div>
                  </div>
                  <div className="text-left">
                    <div className="font-bold" style={{ color: "#5ee89b" }}>{formatPrice(c.totalSpent)}</div>
                    <div className="text-xs text-slate-500">مجموع خرید</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Customer Modal */}
      <Modal open={addModal} onClose={() => { setAddModal(false); resetForm(); }} title="مشتری جدید">
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">نام *</label>
            <input className="form-input" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">شماره تلفن *</label>
            <input className="form-input" type="tel" dir="ltr" value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">یادداشت (سلیقه، ترجیحات و...)</label>
            <input className="form-input" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} placeholder="مثلاً همیشه دوغ سفارش می‌ده..." />
          </div>
          <button
            type="button"
            className={`btn w-full ${form.isVip ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setForm((p) => ({ ...p, isVip: !p.isVip }))}
          >
            ⭐ {form.isVip ? "مشتری VIP هست" : "علامت‌گذاری به‌عنوان VIP"}
          </button>
          <div className="flex gap-3">
            <button className="btn btn-secondary flex-1" onClick={() => { setAddModal(false); resetForm(); }}>انصراف</button>
            <button className="btn btn-primary flex-1" onClick={handleAdd} disabled={loading}>ثبت</button>
          </div>
        </div>
      </Modal>

      {/* Detail Modal */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail?.name || ""} size="lg">
        {detailLoading ? (
          <div className="text-center text-slate-400 py-8">در حال بارگذاری...</div>
        ) : detail ? (
          <div className="space-y-4 text-sm">
            {editing ? (
              <div className="space-y-3 rounded-lg p-3" style={{ background: "#0e1512" }}>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">نام</label>
                  <input className="form-input" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">شماره تلفن</label>
                  <input className="form-input" dir="ltr" value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">یادداشت</label>
                  <input className="form-input" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
                </div>
                <button
                  type="button"
                  className={`btn w-full ${form.isVip ? "btn-primary" : "btn-secondary"}`}
                  onClick={() => setForm((p) => ({ ...p, isVip: !p.isVip }))}
                >
                  ⭐ {form.isVip ? "مشتری VIP هست" : "علامت‌گذاری به‌عنوان VIP"}
                </button>
                <div className="flex gap-2">
                  <button className="btn btn-secondary flex-1" onClick={() => setEditing(false)}>انصراف</button>
                  <button className="btn btn-primary flex-1" onClick={handleSaveEdit} disabled={loading}>ذخیره</button>
                </div>
              </div>
            ) : (
              <div className="rounded-lg p-3" style={{ background: "#0e1512" }}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-white font-bold">{detail.name}</span>
                      {detail.isVip && <span className="badge" style={{ background: "#3a2a0c", color: "#e0b23a" }}>⭐ VIP</span>}
                    </div>
                    <a href={`tel:${detail.phone}`} className="text-xs" style={{ color: "#5ecfe0" }} dir="ltr">{detail.phone}</a>
                    {detail.notes && <div className="text-xs text-slate-400 mt-1">📝 {detail.notes}</div>}
                  </div>
                  <button className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>✏️ ویرایش</button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg p-2 text-center" style={{ background: "#0e1512" }}>
                <div className="text-lg font-bold text-white">{detail.visitCount.toLocaleString("fa-IR")}</div>
                <div className="text-[10px] text-slate-500">مراجعه</div>
              </div>
              <div className="rounded-lg p-2 text-center" style={{ background: "#0e1512" }}>
                <div className="text-sm font-bold" style={{ color: "#5ee89b" }}>{formatPrice(detail.totalSpent)}</div>
                <div className="text-[10px] text-slate-500">مجموع خرید</div>
              </div>
              <div className="rounded-lg p-2 text-center" style={{ background: "#0e1512" }}>
                <div className="text-sm font-bold" style={{ color: "#e0b23a" }}>{formatPrice(detail.cafeSpent)}</div>
                <div className="text-[10px] text-slate-500">خرج کافه</div>
              </div>
            </div>

            {detail.favoriteType && (
              <div className="text-slate-300">
                میز موردعلاقه: <span className="text-white font-bold">{TYPE_LABELS[detail.favoriteType] || detail.favoriteType}</span>
              </div>
            )}

            {detail.favoriteCafeItems.length > 0 && (
              <div>
                <div className="text-slate-400 mb-2">☕ آیتم‌های موردعلاقه کافه:</div>
                <div className="space-y-1">
                  {detail.favoriteCafeItems.map((item) => (
                    <div key={item.name} className="flex justify-between text-sm rounded px-3 py-1.5" style={{ background: "#0e1512" }}>
                      <span className="text-white">{item.name}</span>
                      <span style={{ color: "#e0b23a" }}>{item.quantity.toLocaleString("fa-IR")} بار</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {detail.invoices.length > 0 && (
              <div>
                <div className="text-slate-400 mb-2">📂 آخرین فاکتورها:</div>
                <div className="space-y-1">
                  {detail.invoices.slice(0, 8).map((inv) => (
                    <div key={inv.id} className="flex justify-between text-xs rounded px-3 py-1.5" style={{ background: "#0e1512" }}>
                      <span className="text-slate-300">{inv.jalaaliDate} — {inv.tableName || ""}</span>
                      <span style={{ color: "#5ee89b" }}>{formatPrice(Number(inv.totalAmount))}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button className="btn btn-danger btn-full" onClick={() => setDeleteId(detail.id)}>
              🗑️ حذف از باشگاه مشتریان
            </button>
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={!!deleteId}
        message="آیا از حذف این مشتری از باشگاه مطمئنید؟ (فاکتورهای قبلیش حذف نمی‌شن، فقط از این لیست میره)"
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
        danger
      />
    </div>
  );
}
