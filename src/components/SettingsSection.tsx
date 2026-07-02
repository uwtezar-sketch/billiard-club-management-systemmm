"use client";
import { useState, useEffect, useCallback } from "react";
import Modal from "./Modal";
import ConfirmDialog from "./ConfirmDialog";
import { useToast } from "./Toast";
import { formatPrice } from "@/lib/jalaali";

interface CafeMenuItem {
  id: number;
  name: string;
  price: string;
  isActive: boolean;
}

interface Table {
  id: number;
  name: string;
  type: string;
  isActive: boolean;
}

export default function SettingsSection() {
  const { showToast } = useToast();
  const [settings, setSettings] = useState({
    snooker_price: "150000",
    eightball_price: "100000",
    playstation_price: "80000",
  });
  const [menuItems, setMenuItems] = useState<CafeMenuItem[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [savingPrices, setSavingPrices] = useState(false);

  const [menuModal, setMenuModal] = useState<{ open: boolean; item: CafeMenuItem | null }>({ open: false, item: null });
  const [menuForm, setMenuForm] = useState({ name: "", price: "" });

  const [tableModal, setTableModal] = useState(false);
  const [tableForm, setTableForm] = useState({ name: "", type: "playstation" });
  const [deleteTableId, setDeleteTableId] = useState<number | null>(null);
  const [deleteMenuId, setDeleteMenuId] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    const [settingsRes, menuRes, tablesRes] = await Promise.all([
      fetch("/api/settings"),
      fetch("/api/cafe"),
      fetch("/api/tables"),
    ]);
    const s = await settingsRes.json();
    setSettings({
      snooker_price: s.snooker_price || "150000",
      eightball_price: s.eightball_price || "100000",
      playstation_price: s.playstation_price || "80000",
    });
    const m = await menuRes.json();
    setMenuItems(Array.isArray(m) ? m : []);
    const t = await tablesRes.json();
    setTables(Array.isArray(t) ? t : []);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleSavePrices() {
    setSavingPrices(true);
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      showToast("قیمت‌ها ذخیره شد", "success");
    } finally {
      setSavingPrices(false);
    }
  }

  async function handleSaveMenuItem() {
    if (!menuForm.name || !menuForm.price) {
      showToast("نام و قیمت الزامی است", "error");
      return;
    }
    if (menuModal.item) {
      await fetch(`/api/cafe/${menuModal.item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: menuForm.name, price: Number(menuForm.price) }),
      });
      showToast("آیتم ویرایش شد", "success");
    } else {
      await fetch("/api/cafe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: menuForm.name, price: Number(menuForm.price) }),
      });
      showToast("آیتم اضافه شد", "success");
    }
    setMenuModal({ open: false, item: null });
    setMenuForm({ name: "", price: "" });
    fetchData();
  }

  async function handleDeleteMenuItem() {
    if (!deleteMenuId) return;
    await fetch(`/api/cafe/${deleteMenuId}`, { method: "DELETE" });
    showToast("آیتم حذف شد", "success");
    setDeleteMenuId(null);
    fetchData();
  }

  async function handleAddTable() {
    if (!tableForm.name) { showToast("نام الزامی است", "error"); return; }
    await fetch("/api/tables", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tableForm),
    });
    showToast("میز/دستگاه اضافه شد", "success");
    setTableModal(false);
    setTableForm({ name: "", type: "playstation" });
    fetchData();
  }

  async function handleDeleteTable() {
    if (!deleteTableId) return;
    const res = await fetch(`/api/tables?id=${deleteTableId}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      showToast(data.error || "خطا در حذف میز/دستگاه", "error");
      setDeleteTableId(null);
      return;
    }
    showToast("میز/دستگاه حذف شد", "success");
    setDeleteTableId(null);
    fetchData();
  }

  return (
    <div className="space-y-6">
      {/* Price Settings */}
      <div className="card">
        <h2 className="text-lg font-bold text-white mb-4">💰 قیمت‌گذاری (تومان / ساعت)</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-green-400 mb-1">🎱 اسنوکر</label>
            <input
              className="form-input"
              type="number"
              dir="ltr"
              value={settings.snooker_price}
              onChange={(e) => setSettings((p) => ({ ...p, snooker_price: e.target.value }))}
            />
            <div className="text-xs text-slate-500 mt-1">{formatPrice(Number(settings.snooker_price))} در ساعت</div>
          </div>
          <div>
            <label className="block text-sm text-blue-400 mb-1">🎳 ایت‌بال</label>
            <input
              className="form-input"
              type="number"
              dir="ltr"
              value={settings.eightball_price}
              onChange={(e) => setSettings((p) => ({ ...p, eightball_price: e.target.value }))}
            />
            <div className="text-xs text-slate-500 mt-1">{formatPrice(Number(settings.eightball_price))} در ساعت</div>
          </div>
          <div>
            <label className="block text-sm text-purple-400 mb-1">🎮 پلی‌استیشن</label>
            <input
              className="form-input"
              type="number"
              dir="ltr"
              value={settings.playstation_price}
              onChange={(e) => setSettings((p) => ({ ...p, playstation_price: e.target.value }))}
            />
            <div className="text-xs text-slate-500 mt-1">{formatPrice(Number(settings.playstation_price))} در ساعت</div>
          </div>
          <button
            className="btn btn-success btn-full"
            onClick={handleSavePrices}
            disabled={savingPrices}
          >
            {savingPrices ? "در حال ذخیره..." : "💾 ذخیره قیمت‌ها"}
          </button>
        </div>
      </div>

      {/* Cafe Menu */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">☕ منوی کافه</h2>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => { setMenuForm({ name: "", price: "" }); setMenuModal({ open: true, item: null }); }}
          >
            ➕ آیتم جدید
          </button>
        </div>
        <div className="space-y-2">
          {menuItems.map((item) => (
            <div key={item.id} className="flex items-center justify-between bg-slate-800 rounded-lg px-3 py-2">
              <div>
                <span className="text-white font-medium">{item.name}</span>
                <span className="text-green-400 text-sm mr-3">{formatPrice(Number(item.price))}</span>
              </div>
              <div className="flex gap-2">
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setMenuForm({ name: item.name, price: item.price });
                    setMenuModal({ open: true, item });
                  }}
                >✏️</button>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => setDeleteMenuId(item.id)}
                >🗑</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tables/Devices Management */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">🎮 مدیریت میزها و دستگاه‌ها</h2>
          <button className="btn btn-primary btn-sm" onClick={() => { setTableForm({ name: "", type: "playstation" }); setTableModal(true); }}>
            ➕ اضافه کردن
          </button>
        </div>
        <div className="space-y-2">
          {tables.map((table) => (
            <div key={table.id} className="flex items-center justify-between bg-slate-800 rounded-lg px-3 py-2">
              <div>
                <span className="text-white font-medium">{table.name}</span>
                <span className="text-slate-400 text-xs mr-2">
                  {table.type === "snooker" ? "🎱 اسنوکر" : table.type === "eightball" ? "🎳 ایت‌بال" : "🎮 پلی‌استیشن"}
                </span>
              </div>
              {!table.isActive && (
                <button className="btn btn-danger btn-sm" onClick={() => setDeleteTableId(table.id)}>🗑</button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Menu Modal */}
      <Modal
        open={menuModal.open}
        onClose={() => setMenuModal({ open: false, item: null })}
        title={menuModal.item ? "ویرایش آیتم" : "آیتم جدید"}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">نام آیتم</label>
            <input
              className="form-input"
              value={menuForm.name}
              onChange={(e) => setMenuForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="مثلاً: ساندویچ مرغ"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">قیمت (تومان)</label>
            <input
              className="form-input"
              type="number"
              dir="ltr"
              value={menuForm.price}
              onChange={(e) => setMenuForm((p) => ({ ...p, price: e.target.value }))}
              placeholder="150000"
            />
          </div>
          <div className="flex gap-3">
            <button className="btn btn-secondary flex-1" onClick={() => setMenuModal({ open: false, item: null })}>انصراف</button>
            <button className="btn btn-primary flex-1" onClick={handleSaveMenuItem}>ذخیره</button>
          </div>
        </div>
      </Modal>

      {/* Table Modal */}
      <Modal open={tableModal} onClose={() => setTableModal(false)} title="افزودن میز / دستگاه">
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">نام</label>
            <input
              className="form-input"
              value={tableForm.name}
              onChange={(e) => setTableForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="مثلاً: پلی‌استیشن ۳"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">نوع</label>
            <select
              className="form-input"
              value={tableForm.type}
              onChange={(e) => setTableForm((p) => ({ ...p, type: e.target.value }))}
            >
              <option value="snooker">🎱 اسنوکر</option>
              <option value="eightball">🎳 ایت‌بال</option>
              <option value="playstation">🎮 پلی‌استیشن</option>
            </select>
          </div>
          <div className="flex gap-3">
            <button className="btn btn-secondary flex-1" onClick={() => setTableModal(false)}>انصراف</button>
            <button className="btn btn-primary flex-1" onClick={handleAddTable}>اضافه کردن</button>
          </div>
        </div>
      </Modal>

      {/* Confirm Deletes */}
      <ConfirmDialog
        open={!!deleteMenuId}
        message="آیا از حذف این آیتم مطمئنید؟"
        onConfirm={handleDeleteMenuItem}
        onCancel={() => setDeleteMenuId(null)}
        danger
      />
      <ConfirmDialog
        open={!!deleteTableId}
        message="آیا از حذف این میز/دستگاه مطمئنید؟"
        onConfirm={handleDeleteTable}
        onCancel={() => setDeleteTableId(null)}
        danger
      />
    </div>
  );
}
