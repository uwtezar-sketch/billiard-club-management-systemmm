"use client";
import { useState, useEffect, useCallback } from "react";
import Modal from "./Modal";
import ConfirmDialog from "./ConfirmDialog";
import { useToast } from "./Toast";
import { toJalaaliFullLabel } from "@/lib/jalaali";

interface InventoryItem {
  id: number;
  name: string;
  category: string | null;
  unit: string;
  currentQuantity: string;
  notes: string | null;
  lastUpdatedAt: string;
  lastUpdatedByUsername: string | null;
  status: "out" | "low" | "ok";
}

interface InventoryLog {
  id: number;
  itemId: number;
  previousQuantity: string;
  newQuantity: string;
  note: string | null;
  byUsername: string | null;
  createdAt: string;
}

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  out: { label: "🔴 تمام شده", color: "#f27f8a", bg: "#3d101633" },
  low: { label: "🟡 کم", color: "#e0b23a", bg: "#3d2c0f33" },
  ok: { label: "🟢 کافی", color: "#5ee89b", bg: "#0d3b2622" },
};

const DEFAULT_CATEGORY = "سایر";

export default function InventorySection() {
  const { showToast } = useToast();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [onlyLow, setOnlyLow] = useState(false);
  const [addModal, setAddModal] = useState(false);
  const [editModal, setEditModal] = useState<InventoryItem | null>(null);
  const [updateModal, setUpdateModal] = useState<InventoryItem | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [historyModal, setHistoryModal] = useState<InventoryItem | null>(null);
  const [historyLogs, setHistoryLogs] = useState<InventoryLog[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [addForm, setAddForm] = useState({ name: "", category: "", unit: "عدد", currentQuantity: "" });
  const [editForm, setEditForm] = useState({ name: "", category: "", unit: "" });
  const [updateForm, setUpdateForm] = useState({ quantity: "", note: "" });

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
      body: JSON.stringify({
        name: addForm.name,
        category: addForm.category || null,
        unit: addForm.unit || "عدد",
        currentQuantity: addForm.currentQuantity || 0,
      }),
    });
    if (res.ok) {
      showToast("کالا اضافه شد", "success");
      setAddModal(false);
      setAddForm({ name: "", category: "", unit: "عدد", currentQuantity: "" });
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

  async function handleQuickStep(item: InventoryItem, delta: number) {
    const newQty = Math.max(0, Number(item.currentQuantity) + delta);
    // خوش‌بینانه به‌روز می‌کنیم که سریع حس بشه، بعد سرور رو صدا می‌زنیم
    setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, currentQuantity: newQty.toString() } : it)));
    const res = await fetch(`/api/inventory/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentQuantity: newQty }),
    });
    if (res.ok) {
      const updated = await res.json();
      setItems((prev) => prev.map((it) => (it.id === item.id ? updated : it)));
    } else {
      fetchItems();
    }
  }

  async function handleQuickUpdate() {
    if (!updateModal) return;
    const res = await fetch(`/api/inventory/${updateModal.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentQuantity: Number(updateForm.quantity), note: updateForm.note || undefined }),
    });
    if (res.ok) {
      showToast("موجودی بروزرسانی شد", "success");
      setUpdateModal(null);
      fetchItems();
    } else {
      showToast("خطا در بروزرسانی", "error");
    }
  }

  async function handleSaveEdit() {
    if (!editModal) return;
    const res = await fetch(`/api/inventory/${editModal.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editForm.name,
        category: editForm.category || null,
        unit: editForm.unit,
      }),
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

  async function openHistory(item: InventoryItem) {
    setHistoryModal(item);
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/inventory/${item.id}`);
      const data = await res.json();
      setHistoryLogs(Array.isArray(data.logs) ? data.logs : []);
    } finally {
      setHistoryLoading(false);
    }
  }

  const filtered = onlyLow ? items.filter((i) => i.status !== "ok") : items;
  const grouped = filtered.reduce((acc, item) => {
    const cat = item.category || DEFAULT_CATEGORY;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {} as Record<string, InventoryItem[]>);

  const lowCount = items.filter((i) => i.status === "low").length;
  const outCount = items.filter((i) => i.status === "out").length;

  if (loading) {
    return <div className="text-center text-slate-500 py-12">در حال بارگذاری...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-bold text-white">📦 انبار و موجودی</h2>
        <button className="btn btn-primary btn-sm" onClick={() => setAddModal(true)}>➕ کالای جدید</button>
      </div>

      {(lowCount > 0 || outCount > 0) && (
        <div className="rounded-lg p-3 text-sm flex gap-4" style={{ background: "#3d101633", border: "1px solid #8f1d2c" }}>
          {outCount > 0 && <span style={{ color: "#f27f8a" }}>🔴 {outCount.toLocaleString("fa-IR")} کالا تمام شده</span>}
          {lowCount > 0 && <span style={{ color: "#e0b23a" }}>🟡 {lowCount.toLocaleString("fa-IR")} کالا کم داریم</span>}
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
          <div key={category} className="space-y-2">
            <div className="text-xs text-slate-500 font-bold">{category}</div>
            {catItems.map((item) => {
              const st = STATUS_MAP[item.status];
              return (
                <div key={item.id} className="card" style={{ borderColor: item.status !== "ok" ? st.color + "55" : undefined }}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-white font-medium">{item.name}</span>
                        <span className="badge text-xs" style={{ background: st.bg, color: st.color }}>{st.label}</span>
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        آخرین بروزرسانی: {toJalaaliFullLabel(new Date(item.lastUpdatedAt))}
                        {item.lastUpdatedByUsername && <span> — {item.lastUpdatedByUsername}</span>}
                      </div>
                      {item.notes && <div className="text-xs text-slate-400 mt-1">📝 {item.notes}</div>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button className="btn btn-secondary btn-sm" onClick={() => handleQuickStep(item, -1)}>−</button>
                      <div className="text-center min-w-[3rem]">
                        <div className="font-bold text-white">{Number(item.currentQuantity).toLocaleString("fa-IR")}</div>
                        <div className="text-[10px] text-slate-500">{item.unit}</div>
                      </div>
                      <button className="btn btn-secondary btn-sm" onClick={() => handleQuickStep(item, 1)}>+</button>
                    </div>
                  </div>

                  <div className="flex gap-1 mt-2">
                    {(["ok", "low", "out"] as const).map((s) => (
                      <button
                        key={s}
                        className="btn btn-sm flex-1"
                        style={{
                          background: item.status === s ? STATUS_MAP[s].bg : "transparent",
                          color: STATUS_MAP[s].color,
                          border: `1px solid ${STATUS_MAP[s].color}55`,
                          opacity: item.status === s ? 1 : 0.55,
                        }}
                        onClick={() => handleSetStatus(item, s)}
                      >
                        {STATUS_MAP[s].label}
                      </button>
                    ))}
                  </div>

                  <div className="flex gap-2 mt-2">
                    <button
                      className="btn btn-secondary btn-sm flex-1"
                      onClick={() => { setUpdateForm({ quantity: item.currentQuantity, note: "" }); setUpdateModal(item); }}
                    >
                      🔄 ثبت موجودی دقیق
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => openHistory(item)}>
                      📈 روند مصرف
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        setEditForm({
                          name: item.name,
                          category: item.category || "",
                          unit: item.unit,
                        });
                        setEditModal(item);
                      }}
                    >
                      ✏️
                    </button>
                    <button className="btn btn-secondary btn-sm" style={{ color: "#f27f8a" }} onClick={() => setDeleteId(item.id)}>
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
            <input className="form-input" placeholder="مثلاً سوسیس" value={addForm.name} onChange={(e) => setAddForm((p) => ({ ...p, name: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">دسته (اختیاری)</label>
              <input className="form-input" placeholder="مثلاً یخچال" value={addForm.category} onChange={(e) => setAddForm((p) => ({ ...p, category: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">واحد</label>
              <input className="form-input" placeholder="عدد / کیلوگرم / بسته..." value={addForm.unit} onChange={(e) => setAddForm((p) => ({ ...p, unit: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">موجودی فعلی</label>
            <input className="form-input" type="number" dir="ltr" value={addForm.currentQuantity} onChange={(e) => setAddForm((p) => ({ ...p, currentQuantity: e.target.value }))} />
          </div>
          <button className="btn btn-primary btn-full" onClick={handleAdd}>ثبت</button>
        </div>
      </Modal>

      {/* Quick Update Modal */}
      <Modal open={!!updateModal} onClose={() => setUpdateModal(null)} title={`ثبت موجودی — ${updateModal?.name || ""}`}>
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">موجودی الان ({updateModal?.unit})</label>
            <input
              className="form-input"
              type="number"
              dir="ltr"
              value={updateForm.quantity}
              onChange={(e) => setUpdateForm((p) => ({ ...p, quantity: e.target.value }))}
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">یادداشت (اختیاری)</label>
            <input className="form-input" placeholder="مثلاً سفارش دادیم، فردا می‌رسه" value={updateForm.note} onChange={(e) => setUpdateForm((p) => ({ ...p, note: e.target.value }))} />
          </div>
          <button className="btn btn-primary btn-full" onClick={handleQuickUpdate}>✅ ثبت</button>
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal open={!!editModal} onClose={() => setEditModal(null)} title="ویرایش مشخصات کالا">
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">نام کالا</label>
            <input className="form-input" value={editForm.name} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">دسته</label>
              <input className="form-input" value={editForm.category} onChange={(e) => setEditForm((p) => ({ ...p, category: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">واحد</label>
              <input className="form-input" value={editForm.unit} onChange={(e) => setEditForm((p) => ({ ...p, unit: e.target.value }))} />
            </div>
          </div>
          <button className="btn btn-primary btn-full" onClick={handleSaveEdit}>💾 ذخیره</button>
        </div>
      </Modal>

      {/* Consumption Trend Modal */}
      <Modal open={!!historyModal} onClose={() => setHistoryModal(null)} title={`روند مصرف — ${historyModal?.name || ""}`}>
        {historyLoading ? (
          <div className="text-center text-slate-500 py-8">در حال بارگذاری...</div>
        ) : historyLogs.length === 0 ? (
          <div className="text-center text-slate-500 py-8">هنوز هیچ تغییری برای این کالا ثبت نشده.</div>
        ) : (
          (() => {
            const sorted = [...historyLogs].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
            const recent = sorted.slice(-15);
            const maxQty = Math.max(...recent.map((l) => Number(l.newQuantity)), 1);
            const totalConsumed = sorted.reduce((s, l) => {
              const delta = Number(l.newQuantity) - Number(l.previousQuantity);
              return delta < 0 ? s + Math.abs(delta) : s;
            }, 0);
            const totalRestocked = sorted.reduce((s, l) => {
              const delta = Number(l.newQuantity) - Number(l.previousQuantity);
              return delta > 0 ? s + delta : s;
            }, 0);
            const firstDate = new Date(sorted[0].createdAt);
            const daysSinceFirst = Math.max(1, Math.ceil((Date.now() - firstDate.getTime()) / 86400000));
            const avgPerDay = totalConsumed / daysSinceFirst;

            return (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-lg p-2 text-center" style={{ background: "#0e1512" }}>
                    <div className="text-sm font-bold" style={{ color: "#f27f8a" }}>
                      {totalConsumed.toLocaleString("fa-IR")} {historyModal?.unit}
                    </div>
                    <div className="text-[10px] text-slate-500">کل مصرف‌شده</div>
                  </div>
                  <div className="rounded-lg p-2 text-center" style={{ background: "#0e1512" }}>
                    <div className="text-sm font-bold" style={{ color: "#5ee89b" }}>
                      {totalRestocked.toLocaleString("fa-IR")} {historyModal?.unit}
                    </div>
                    <div className="text-[10px] text-slate-500">کل اضافه‌شده</div>
                  </div>
                  <div className="rounded-lg p-2 text-center" style={{ background: "#0e1512" }}>
                    <div className="text-sm font-bold text-white">
                      {avgPerDay.toLocaleString("fa-IR", { maximumFractionDigits: 1 })}
                    </div>
                    <div className="text-[10px] text-slate-500">میانگین مصرف روزانه</div>
                  </div>
                </div>

                {/* نمودار میله‌ای ساده — هر میله موجودیِ بعد از یک تغییر رو نشون می‌ده */}
                <div>
                  <div className="text-xs text-slate-500 mb-2">موجودی در طول زمان (۱۵ تغییر اخیر)</div>
                  <div className="flex items-end gap-1 h-32 rounded-lg p-2" style={{ background: "#0e1512" }}>
                    {recent.map((log) => {
                      const delta = Number(log.newQuantity) - Number(log.previousQuantity);
                      const heightPct = Math.max(4, (Number(log.newQuantity) / maxQty) * 100);
                      const color = delta > 0 ? "#5ee89b" : delta < 0 ? "#f27f8a" : "#8a9488";
                      const d = new Date(log.createdAt);
                      const dayLabel = d.toLocaleDateString("fa-IR", { day: "2-digit", month: "2-digit", timeZone: "Asia/Tehran" });
                      return (
                        <div key={log.id} className="flex-1 flex flex-col items-center justify-end h-full" title={`${dayLabel} — ${Number(log.newQuantity)} ${historyModal?.unit}`}>
                          <div className="w-full rounded-t" style={{ height: `${heightPct}%`, background: color, minWidth: "6px" }} />
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-600 mt-1">
                    <span>{new Date(recent[0].createdAt).toLocaleDateString("fa-IR", { day: "2-digit", month: "2-digit", timeZone: "Asia/Tehran" })}</span>
                    <span>{new Date(recent[recent.length - 1].createdAt).toLocaleDateString("fa-IR", { day: "2-digit", month: "2-digit", timeZone: "Asia/Tehran" })}</span>
                  </div>
                </div>

                <div>
                  <div className="text-xs text-slate-500 mb-2">تاریخچه‌ی کامل</div>
                  <div className="space-y-1 max-h-64 overflow-y-auto">
                    {[...sorted].reverse().map((log) => {
                      const delta = Number(log.newQuantity) - Number(log.previousQuantity);
                      return (
                        <div key={log.id} className="rounded px-3 py-2 text-xs" style={{ background: "#0e1512" }}>
                          <div className="flex justify-between items-center">
                            <span className="text-slate-300">{toJalaaliFullLabel(new Date(log.createdAt))}</span>
                            <span className="font-bold" style={{ color: delta >= 0 ? "#5ee89b" : "#f27f8a" }}>
                              {delta >= 0 ? "+" : ""}{delta.toLocaleString("fa-IR")} {historyModal?.unit}
                            </span>
                          </div>
                          <div className="flex justify-between items-center mt-0.5 text-slate-500">
                            <span>{log.byUsername || ""}</span>
                            {log.note && <span>📝 {log.note}</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })()
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteId}
        message="این کالا از انبار حذف بشه؟ تاریخچه‌ی موجودی‌اش هم پاک می‌شه."
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
        danger
      />
    </div>
  );
}
