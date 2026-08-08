"use client";
import { useState, useEffect, useCallback } from "react";
import Modal from "./Modal";
import ConfirmDialog from "./ConfirmDialog";
import { useToast } from "./Toast";

interface InventoryItem {
  id: number;
  name: string;
  category: string | null;
  notes: string | null;
  lastUpdatedAt: string;
  lastUpdatedByUsername: string | null;
  status: "out" | "low" | "ok";
}

const STATUS_MAP: Record<string, { label: string; short: string; color: string; bg: string }> = {
  out: { label: "تمام شده", short: "🔴 تمام", color: "#f27f8a", bg: "#3d101633" },
  low: { label: "کم داریم", short: "🟡 کم", color: "#e0b23a", bg: "#3d2c0f33" },
  ok: { label: "کافیه", short: "🟢 کافی", color: "#5ee89b", bg: "#0d3b2622" },
};

const DEFAULT_CATEGORY = "سایر";

function relativeTimeFa(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "همین الان";
  if (mins < 60) return `${mins.toLocaleString("fa-IR")} دقیقه پیش`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours.toLocaleString("fa-IR")} ساعت پیش`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days.toLocaleString("fa-IR")} روز پیش`;
  const months = Math.floor(days / 30);
  return `${months.toLocaleString("fa-IR")} ماه پیش`;
}

export default function InventorySection() {
  const { showToast } = useToast();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [onlyLow, setOnlyLow] = useState(false);
  const [addModal, setAddModal] = useState(false);
  const [editModal, setEditModal] = useState<InventoryItem | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const [addForm, setAddForm] = useState({ name: "", category: "" });
  const [editForm, setEditForm] = useState({ name: "", category: "" });

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/inventory");
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  async function handleAdd() {
    if (!addForm.name.trim()) { showToast("نام کالا الزامی است", "error"); return; }
    const res = await fetch("/api/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: addForm.name, category: addForm.category || null }),
    });
    if (res.ok) {
      showToast("کالا اضافه شد", "success");
      setAddModal(false);
      setAddForm({ name: "", category: "" });
      fetchItems();
    } else {
      const data = await res.json().catch(() => ({}));
      showToast(data.error || "خطا در افزودن کالا", "error");
    }
  }

  async function handleSetStatus(item: InventoryItem, status: "ok" | "low" | "out") {
    setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, status } : it)));
    const res = await fetch(`/api/inventory/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      const updated = await res.json();
      setItems((prev) => prev.map((it) => (it.id === item.id ? updated : it)));
    } else {
      fetchItems();
    }
  }

  async function handleSaveEdit() {
    if (!editModal) return;
    const res = await fetch(`/api/inventory/${editModal.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editForm.name, category: editForm.category || null }),
    });
    if (res.ok) {
      showToast("مشخصات کالا ذخیره شد", "success");
      setEditModal(null);
      fetchItems();
    } else {
      showToast("خطا در ذخیره", "error");
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    const res = await fetch(`/api/inventory/${deleteId}`, { method: "DELETE" });
    if (res.ok) {
      showToast("کالا حذف شد", "success");
      setDeleteId(null);
      fetchItems();
    }
  }

  async function copyShoppingList() {
    const lines = shoppingList.map((i) => `- ${i.name}${i.status === "out" ? " (تمام شده)" : " (کم)"}`);
    const text = `🛒 لیست خرید:\n${lines.join("\n")}`;
    try {
      await navigator.clipboard.writeText(text);
      showToast("لیست خرید کپی شد", "success");
    } catch {
      showToast("کپی نشد — دستی انتخاب کن", "error");
    }
  }

  const filtered = onlyLow ? items.filter((i) => i.status !== "ok") : items;
  const grouped = filtered.reduce((acc, item) => {
    const cat = item.category || DEFAULT_CATEGORY;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {} as Record<string, InventoryItem[]>);

  const shoppingList = [...items]
    .filter((i) => i.status !== "ok")
    .sort((a, b) => (a.status === b.status ? 0 : a.status === "out" ? -1 : 1));

  if (loading) {
    return <div className="text-center text-slate-500 py-12">در حال بارگذاری...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-bold text-white">📦 انبار و موجودی</h2>
        <button className="btn btn-primary btn-sm" onClick={() => setAddModal(true)}>➕ کالای جدید</button>
      </div>

      {/* لیست خرید — برای وقتی می‌خوان برن خرید */}
      {shoppingList.length > 0 && (
        <div className="card" style={{ borderColor: "#8f1d2c55" }}>
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-sm" style={{ color: "#f27f8a" }}>🛒 لیست خرید ({shoppingList.length.toLocaleString("fa-IR")})</h3>
            <button className="btn btn-secondary btn-sm" onClick={copyShoppingList}>📋 کپی</button>
          </div>
          <div className="space-y-1">
            {shoppingList.map((i) => (
              <div key={i.id} className="flex items-center justify-between text-xs py-1">
                <span className="text-white">
                  {i.status === "out" ? "🔴" : "🟡"} {i.name}
                </span>
                <span className="text-slate-500">{relativeTimeFa(i.lastUpdatedAt)}{i.lastUpdatedByUsername && ` — ${i.lastUpdatedByUsername}`}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <label className="flex items-center gap-2 text-sm text-slate-300">
        <input type="checkbox" checked={onlyLow} onChange={(e) => setOnlyLow(e.target.checked)} />
        فقط کم‌ها و تمام‌شده‌ها رو نشون بده
      </label>

      {filtered.length === 0 ? (
        <div className="text-center text-slate-500 py-12">
          {items.length === 0 ? "هنوز کالایی توی انبار ثبت نشده." : "همه‌چی کافیه 🎉"}
        </div>
      ) : (
        Object.entries(grouped).map(([category, catItems]) => (
          <div key={category} className="space-y-1.5">
            <div className="text-xs text-slate-500 font-bold">{category}</div>
            {catItems.map((item) => {
              const st = STATUS_MAP[item.status];
              return (
                <div
                  key={item.id}
                  className="rounded-lg px-3 py-2 flex items-center gap-2"
                  style={{ background: "#141a17", border: `1px solid ${item.status !== "ok" ? st.color + "40" : "#22282490"}` }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-white text-sm truncate">{item.name}</div>
                    <div className="text-[10px] text-slate-500 truncate">
                      {relativeTimeFa(item.lastUpdatedAt)}
                      {item.lastUpdatedByUsername && ` — ${item.lastUpdatedByUsername}`}
                      {item.notes && ` — 📝 ${item.notes}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {(["ok", "low", "out"] as const).map((s) => (
                      <button
                        key={s}
                        className="rounded-md text-[10px] px-1.5 py-1 leading-none"
                        style={{
                          background: item.status === s ? STATUS_MAP[s].bg : "transparent",
                          color: STATUS_MAP[s].color,
                          border: `1px solid ${STATUS_MAP[s].color}55`,
                          opacity: item.status === s ? 1 : 0.45,
                        }}
                        onClick={() => handleSetStatus(item, s)}
                      >
                        {STATUS_MAP[s].short}
                      </button>
                    ))}
                    <button
                      className="text-slate-500 text-xs px-1"
                      onClick={() => { setEditForm({ name: item.name, category: item.category || "" }); setEditModal(item); }}
                    >
                      ✏️
                    </button>
                    <button className="text-xs px-1" style={{ color: "#f27f8a99" }} onClick={() => setDeleteId(item.id)}>
                      🗑️
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ))
      )}

      {/* Add Modal */}
      <Modal open={addModal} onClose={() => setAddModal(false)} title="کالای جدید">
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">نام کالا *</label>
            <input className="form-input" placeholder="مثلاً سوسیس" value={addForm.name} onChange={(e) => setAddForm((p) => ({ ...p, name: e.target.value }))} autoFocus />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">دسته (اختیاری)</label>
            <input className="form-input" placeholder="مثلاً یخچال" value={addForm.category} onChange={(e) => setAddForm((p) => ({ ...p, category: e.target.value }))} />
          </div>
          <button className="btn btn-primary btn-full" onClick={handleAdd}>ثبت</button>
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal open={!!editModal} onClose={() => setEditModal(null)} title="ویرایش مشخصات کالا">
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">نام کالا</label>
            <input className="form-input" value={editForm.name} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">دسته</label>
            <input className="form-input" value={editForm.category} onChange={(e) => setEditForm((p) => ({ ...p, category: e.target.value }))} />
          </div>
          <button className="btn btn-primary btn-full" onClick={handleSaveEdit}>💾 ذخیره</button>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteId}
        message="این کالا از انبار حذف بشه؟"
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
        danger
      />
    </div>
  );
}
