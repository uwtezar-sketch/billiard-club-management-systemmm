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
  totalPaid: number;
  totalDebtCreated: number;
  totalPendingAmount: number;
  outstandingDebt: number;
  cafeSpent: number;
  lastVisit: string | null;
  daysSinceVisit: number | null;
  oldestUnpaidDebtDays: number | null;
  tier: "good" | "watch" | "bad" | "new";
  loyaltyPoints: number;
}

interface HistoryEntry {
  invoiceId: number;
  shareId: number | null;
  invoiceNumber: string;
  jalaaliDate: string | null;
  issuedAt: string;
  tableName: string | null;
  tableType: string | null;
  amount: number;
  status: string;
  paymentMethod: string | null;
  isSplit: boolean;
  partnerLabel: string | null;
}

interface CustomerDetail extends Customer {
  gameSpent: number;
  favoriteType: string | null;
  favoriteCafeItems: { name: string; quantity: number }[];
  history: HistoryEntry[];
  pointValue: number;
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

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  paid: { label: "✅ تسویه‌شده", color: "#5ee89b" },
  debt: { label: "📋 بدهی", color: "#f27f8a" },
  pending: { label: "⏳ در انتظار", color: "#e0b23a" },
};

const PAYMENT_MAP: Record<string, string> = {
  cash: "💵 نقدی",
  card: "💳 کارت",
  debt: "📋 بدهکاری",
};

const INACTIVE_DAYS = 30;

const TIER_MAP: Record<Customer["tier"], { label: string; color: string; bg: string }> = {
  good: { label: "🟢 خوش‌حساب", color: "#5ee89b", bg: "#123024" },
  watch: { label: "🟡 بدهیِ تازه", color: "#e0b23a", bg: "#3a2a0c" },
  bad: { label: "🔴 بدحساب مزمن", color: "#f27f8a", bg: "#3d1016" },
  new: { label: "", color: "", bg: "" },
};

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
  const [showInsights, setShowInsights] = useState(true);
  const [redeemModal, setRedeemModal] = useState(false);
  const [redeemPoints, setRedeemPoints] = useState("");
  const [redeemNote, setRedeemNote] = useState("");
  const [redeemLoading, setRedeemLoading] = useState(false);

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

  const [duplicateConfirm, setDuplicateConfirm] = useState<string | null>(null);

  async function handleAdd(force = false) {
    if (!form.name || !form.phone) {
      showToast("نام و شماره تلفن الزامی است", "error");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, force }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.duplicateName && !force) {
          setDuplicateConfirm(data.error);
          return;
        }
        showToast(data.error || "خطا در ثبت مشتری", "error");
        return;
      }
      showToast("مشتری به باشگاه اضافه شد", "success");
      setAddModal(false);
      setDuplicateConfirm(null);
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

  async function handleRedeemPoints() {
    if (!detail) return;
    const points = Number(redeemPoints);
    if (!points || points <= 0) {
      showToast("تعداد امتیاز نامعتبره", "error");
      return;
    }
    setRedeemLoading(true);
    try {
      const res = await fetch(`/api/customers/${detail.id}/points`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ points, note: redeemNote || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || "خطا در ثبت استفاده از امتیاز", "error");
        return;
      }
      showToast("امتیاز استفاده شد", "success");
      setRedeemModal(false);
      setRedeemPoints("");
      setRedeemNote("");
      openDetail(detail.id);
      fetchCustomers();
    } finally {
      setRedeemLoading(false);
    }
  }

  const showInsightsPanel = !debouncedSearch && customers.length >= 3;
  const topProfitable = [...customers].sort((a, b) => b.totalPaid - a.totalPaid).slice(0, 5);
  const discountCandidates = customers
    .filter((c) => c.tier === "good")
    .sort((a, b) => b.totalPaid - a.totalPaid)
    .slice(0, 5);
  const chronicDebtors = customers
    .filter((c) => c.tier === "bad")
    .sort((a, b) => (b.oldestUnpaidDebtDays || 0) - (a.oldestUnpaidDebtDays || 0));
  const absentGoodCustomers = customers
    .filter((c) => c.tier === "good" && c.daysSinceVisit !== null && c.daysSinceVisit >= INACTIVE_DAYS)
    .sort((a, b) => (b.daysSinceVisit || 0) - (a.daysSinceVisit || 0))
    .slice(0, 8);

  return (
    <div className="space-y-4">
      {/* Insights: پرسودترین‌ها، کاندید تخفیف، بدحساب‌های مزمن */}
      {showInsightsPanel && (topProfitable.length > 0 || discountCandidates.length > 0 || chronicDebtors.length > 0 || absentGoodCustomers.length > 0) && (
        <div className="card" style={{ borderColor: "#2f6b4f" }}>
          <button className="flex items-center justify-between w-full" onClick={() => setShowInsights((v) => !v)}>
            <h3 className="font-bold" style={{ color: "#5ee89b" }}>📈 تحلیل سوددهی مشتریان</h3>
            <span className="text-slate-500">{showInsights ? "▲" : "▼"}</span>
          </button>
          {showInsights && (
            <div className="space-y-4 mt-3">
              {topProfitable.length > 0 && (
                <div>
                  <div className="text-xs text-slate-400 mb-2">🏆 پرسودترین مشتریان</div>
                  <div className="space-y-1">
                    {topProfitable.map((c, i) => (
                      <div key={c.id} className="flex items-center justify-between rounded-lg px-3 py-1.5 cursor-pointer" style={{ background: "#0e1512" }} onClick={() => openDetail(c.id)}>
                        <span className="text-white text-sm">{i + 1}. {c.name}</span>
                        <span className="text-sm font-bold" style={{ color: "#5ee89b" }}>{formatPrice(c.totalPaid)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {discountCandidates.length > 0 && (
                <div>
                  <div className="text-xs text-slate-400 mb-2">🟢 کاندیدهای تخفیف (خوش‌حساب و ثابت)</div>
                  <div className="space-y-1">
                    {discountCandidates.map((c) => (
                      <div key={c.id} className="flex items-center justify-between rounded-lg px-3 py-1.5 cursor-pointer" style={{ background: "#0e1512" }} onClick={() => openDetail(c.id)}>
                        <span className="text-white text-sm">{c.name}</span>
                        <span className="text-xs text-slate-500">{c.visitCount.toLocaleString("fa-IR")} بار — بدون بدهی باز</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {chronicDebtors.length > 0 && (
                <div>
                  <div className="text-xs text-slate-400 mb-2">🔴 بدحساب‌های مزمن (بدهی ≥ ۱۵ روز تسویه‌نشده)</div>
                  <div className="space-y-1">
                    {chronicDebtors.map((c) => (
                      <div key={c.id} className="flex items-center justify-between rounded-lg px-3 py-1.5 cursor-pointer" style={{ background: "#0e1512" }} onClick={() => openDetail(c.id)}>
                        <span className="text-white text-sm">{c.name}</span>
                        <span className="text-xs font-bold" style={{ color: "#f27f8a" }}>
                          {formatPrice(c.outstandingDebt)} — {c.oldestUnpaidDebtDays?.toLocaleString("fa-IR")} روز
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {absentGoodCustomers.length > 0 && (
                <div>
                  <div className="text-xs text-slate-400 mb-2">🔔 خوش‌حساب‌هایی که مدتیه نیومدن — برای تماس/پیام یادآوری</div>
                  <div className="space-y-1">
                    {absentGoodCustomers.map((c) => (
                      <div key={c.id} className="flex items-center justify-between rounded-lg px-3 py-1.5 cursor-pointer" style={{ background: "#0e1512" }} onClick={() => openDetail(c.id)}>
                        <div>
                          <span className="text-white text-sm">{c.name}</span>
                          <a href={`tel:${c.phone}`} onClick={(e) => e.stopPropagation()} className="text-xs mr-2" style={{ color: "#5ecfe0" }} dir="ltr">{c.phone}</a>
                        </div>
                        <span className="text-xs" style={{ color: "#8a9488" }}>{c.daysSinceVisit?.toLocaleString("fa-IR")} روز غایب</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

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
                      {TIER_MAP[c.tier].label && (
                        <span className="badge" style={{ background: TIER_MAP[c.tier].bg, color: TIER_MAP[c.tier].color }}>
                          {TIER_MAP[c.tier].label}
                        </span>
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
                    <div className="font-bold" style={{ color: "#5ee89b" }}>{formatPrice(c.totalPaid)}</div>
                    <div className="text-xs text-slate-500">واقعاً پرداخت‌کرده</div>
                    {c.outstandingDebt > 0 && (
                      <div className="text-xs font-bold mt-0.5" style={{ color: "#f27f8a" }}>بدهی: {formatPrice(c.outstandingDebt)}</div>
                    )}
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
            <button className="btn btn-primary flex-1" onClick={() => handleAdd()} disabled={loading}>ثبت</button>
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
                      {TIER_MAP[detail.tier].label && (
                        <span className="badge" style={{ background: TIER_MAP[detail.tier].bg, color: TIER_MAP[detail.tier].color }}>
                          {TIER_MAP[detail.tier].label}
                        </span>
                      )}
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
                <div className="text-sm font-bold" style={{ color: "#5ee89b" }}>{formatPrice(detail.totalPaid)}</div>
                <div className="text-[10px] text-slate-500">واقعاً پرداخت‌کرده</div>
              </div>
              <div className="rounded-lg p-2 text-center" style={{ background: "#0e1512" }}>
                <div className="text-sm font-bold" style={{ color: "#e0b23a" }}>{formatPrice(detail.cafeSpent)}</div>
                <div className="text-[10px] text-slate-500">خرج کافه</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg p-2 text-center" style={{ background: "#3d101633", border: "1px solid #8f1d2c" }}>
                <div className="text-sm font-bold" style={{ color: "#f27f8a" }}>{formatPrice(detail.outstandingDebt)}</div>
                <div className="text-[10px] text-red-300">
                  بدهیِ باز الان{detail.oldestUnpaidDebtDays !== null ? ` — ${detail.oldestUnpaidDebtDays.toLocaleString("fa-IR")} روز` : ""}
                </div>
              </div>
              <div className="rounded-lg p-2 text-center" style={{ background: "#3d2c0f33", border: "1px solid #8f6f1d" }}>
                <div className="text-sm font-bold text-yellow-400">{formatPrice(detail.totalPendingAmount)}</div>
                <div className="text-[10px] text-yellow-300">در انتظار تسویه</div>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg p-3" style={{ background: "#123024", border: "1px solid #2f6b4f" }}>
              <div>
                <div className="text-sm font-bold" style={{ color: "#5ee89b" }}>🎁 {detail.loyaltyPoints.toLocaleString("fa-IR")} امتیاز</div>
                <div className="text-[10px] text-slate-500">هر {formatPrice(detail.pointValue)} پرداخت‌شده = ۱ امتیاز</div>
              </div>
              <button
                className="btn btn-secondary btn-sm"
                disabled={detail.loyaltyPoints <= 0}
                onClick={() => { setRedeemPoints(""); setRedeemNote(""); setRedeemModal(true); }}
              >
                استفاده از امتیاز
              </button>
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

            {detail.history.length > 0 && (
              <div>
                <div className="text-slate-400 mb-2">📂 تاریخچه‌ی کامل (پرداخت‌ها و بدهی‌ها):</div>
                <div className="space-y-1">
                  {detail.history.map((h) => {
                    const st = STATUS_MAP[h.status] || { label: h.status, color: "#8a9488" };
                    return (
                      <div key={`${h.invoiceId}-${h.shareId || "full"}`} className="rounded px-3 py-1.5 text-xs" style={{ background: "#0e1512" }}>
                        <div className="flex justify-between items-center">
                          <span className="text-slate-300">
                            {h.jalaaliDate} — {h.tableName || ""}
                            {h.isSplit && <span style={{ color: "#b794f6" }}> (تقسیم‌شده)</span>}
                          </span>
                          <span className="font-bold" style={{ color: st.color }}>{formatPrice(h.amount)}</span>
                        </div>
                        <div className="flex justify-between items-center mt-0.5">
                          <span style={{ color: st.color }}>{st.label}{h.paymentMethod && h.status === "paid" ? ` — ${PAYMENT_MAP[h.paymentMethod] || ""}` : ""}</span>
                          {h.partnerLabel && <span style={{ color: "#b794f6" }}>🤝 با {h.partnerLabel}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <button className="btn btn-danger btn-full" onClick={() => setDeleteId(detail.id)}>
              🗑️ حذف از باشگاه مشتریان
            </button>
          </div>
        ) : null}
      </Modal>

      {/* Redeem Points Modal */}
      <Modal open={redeemModal} onClose={() => setRedeemModal(false)} title="استفاده از امتیاز">
        <div className="space-y-4">
          {detail && (
            <div className="text-xs text-slate-400">موجودی فعلی: <span className="text-white font-bold">{detail.loyaltyPoints.toLocaleString("fa-IR")}</span> امتیاز</div>
          )}
          <div>
            <label className="block text-xs text-slate-400 mb-1">تعداد امتیازِ استفاده‌شده</label>
            <input
              className="form-input"
              type="number"
              dir="ltr"
              value={redeemPoints}
              onChange={(e) => setRedeemPoints(e.target.value)}
              placeholder="مثلاً ۵"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">بابت چی؟ (اختیاری)</label>
            <input
              className="form-input"
              value={redeemNote}
              onChange={(e) => setRedeemNote(e.target.value)}
              placeholder="مثلاً یک ساعت رایگان اسنوکر"
            />
          </div>
          <div className="flex gap-3">
            <button className="btn btn-secondary flex-1" onClick={() => setRedeemModal(false)}>انصراف</button>
            <button className="btn btn-primary flex-1" onClick={handleRedeemPoints} disabled={redeemLoading}>ثبت</button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!duplicateConfirm}
        message={duplicateConfirm || ""}
        confirmText="بازم به‌عنوان مشتری جدید ثبت کن"
        onConfirm={() => { setDuplicateConfirm(null); handleAdd(true); }}
        onCancel={() => setDuplicateConfirm(null)}
      />

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
