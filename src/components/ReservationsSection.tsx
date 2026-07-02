"use client";
import { useState, useEffect, useCallback } from "react";
import Modal from "./Modal";
import ConfirmDialog from "./ConfirmDialog";
import { useToast } from "./Toast";
import { todayJalaali, toJalaali } from "@/lib/jalaali";

interface Reservation {
  id: number;
  customerName: string;
  customerPhone: string | null;
  tableId: number | null;
  tableType: string;
  reservationDate: string;
  startTime: string;
  durationMinutes: number | null;
  playerCount: number | null;
  notes: string | null;
  status: string;
  sessionId: number | null;
}

interface Table {
  id: number;
  name: string;
  type: string;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  registered: { label: "ثبت شده", color: "#d97706" },
  done: { label: "انجام شده", color: "#16a34a" },
  cancelled: { label: "لغو شده", color: "#dc2626" },
  expired: { label: "منقضی شده", color: "#64748b" },
};

const TYPE_LABELS: Record<string, string> = {
  snooker: "اسنوکر",
  eightball: "ایت‌بال",
  playstation: "پلی‌استیشن",
};

export default function ReservationsSection() {
  const { showToast } = useToast();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [filterDate, setFilterDate] = useState(todayJalaali());
  const [search, setSearch] = useState("");
  const [addModal, setAddModal] = useState(false);
  const [editRes, setEditRes] = useState<Reservation | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    customerName: "",
    customerPhone: "",
    tableType: "snooker",
    tableId: "",
    reservationDate: todayJalaali(),
    startTime: "",
    durationMinutes: "",
    playerCount: "",
    notes: "",
  });

  const fetchData = useCallback(async () => {
    try {
      const [resRes, tableRes] = await Promise.all([
        fetch(`/api/reservations?${search ? `search=${search}` : ""}`),
        fetch("/api/tables"),
      ]);
      setReservations(await resRes.json());
      setTables(await tableRes.json());
    } catch {
      showToast("خطا در دریافت رزروها", "error");
    }
  }, [search, showToast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = reservations
    .filter((r) => !filterDate || r.reservationDate === filterDate)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  function resetForm() {
    setForm({
      customerName: "",
      customerPhone: "",
      tableType: "snooker",
      tableId: "",
      reservationDate: todayJalaali(),
      startTime: "",
      durationMinutes: "",
      playerCount: "",
      notes: "",
    });
  }

  function openEditModal(res: Reservation) {
    setEditRes(res);
    setForm({
      customerName: res.customerName,
      customerPhone: res.customerPhone || "",
      tableType: res.tableType,
      tableId: res.tableId ? String(res.tableId) : "",
      reservationDate: res.reservationDate,
      startTime: res.startTime,
      durationMinutes: res.durationMinutes ? String(res.durationMinutes) : "",
      playerCount: res.playerCount ? String(res.playerCount) : "",
      notes: res.notes || "",
    });
  }

  async function handleSave() {
    if (!form.customerName || !form.startTime) {
      showToast("نام مشتری و ساعت شروع الزامی است", "error");
      return;
    }
    setLoading(true);
    try {
      const body = {
        customerName: form.customerName,
        customerPhone: form.customerPhone || null,
        tableType: form.tableType,
        tableId: form.tableId ? Number(form.tableId) : null,
        reservationDate: form.reservationDate,
        startTime: form.startTime,
        durationMinutes: form.durationMinutes ? Number(form.durationMinutes) : null,
        playerCount: form.playerCount ? Number(form.playerCount) : null,
        notes: form.notes || null,
      };

      if (editRes) {
        const res = await fetch(`/api/reservations/${editRes.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (res.ok) { showToast("رزرو ویرایش شد", "success"); }
        else showToast("خطا در ویرایش", "error");
        setEditRes(null);
      } else {
        const res = await fetch("/api/reservations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (res.ok) { showToast("رزرو ثبت شد", "success"); }
        else showToast("خطا در ثبت رزرو", "error");
        setAddModal(false);
      }
      resetForm();
      fetchData();
    } finally {
      setLoading(false);
    }
  }

  async function handleStatusChange(id: number, status: string) {
    await fetch(`/api/reservations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    showToast("وضعیت رزرو بروز شد", "success");
    fetchData();
  }

  async function handleDelete() {
    if (!deleteId) return;
    await fetch(`/api/reservations/${deleteId}`, { method: "DELETE" });
    showToast("رزرو حذف شد", "success");
    setDeleteId(null);
    fetchData();
  }

  async function convertToSession(res: Reservation) {
    const settings = await fetch("/api/settings").then((r) => r.json());
    let price = 100000;
    if (res.tableType === "snooker") price = Number(settings.snooker_price || 150000);
    if (res.tableType === "eightball") price = Number(settings.eightball_price || 100000);
    if (res.tableType === "playstation") price = Number(settings.playstation_price || 80000);

    const sessionRes = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tableId: res.tableId,
        customerName: res.customerName,
        customerPhone: res.customerPhone,
        startTime: new Date().toISOString(),
        pricePerHour: price,
      }),
    });
    if (sessionRes.ok) {
      const session = await sessionRes.json();
      await fetch(`/api/reservations/${res.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "done", sessionId: session.id }),
      });
      showToast("رزرو به سشن فعال تبدیل شد", "success");
      fetchData();
    } else {
      showToast("خطا در تبدیل رزرو", "error");
    }
  }

  const formModal = (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">نام مشتری *</label>
          <input className="form-input" value={form.customerName} onChange={(e) => setForm((p) => ({ ...p, customerName: e.target.value }))} />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">شماره تلفن</label>
          <input className="form-input" type="tel" dir="ltr" value={form.customerPhone} onChange={(e) => setForm((p) => ({ ...p, customerPhone: e.target.value }))} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">نوع میز</label>
          <select className="form-input" value={form.tableType} onChange={(e) => setForm((p) => ({ ...p, tableType: e.target.value }))}>
            <option value="snooker">اسنوکر</option>
            <option value="eightball">ایت‌بال</option>
            <option value="playstation">پلی‌استیشن</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">میز مشخص</label>
          <select className="form-input" value={form.tableId} onChange={(e) => setForm((p) => ({ ...p, tableId: e.target.value }))}>
            <option value="">هر میزی</option>
            {tables.filter((t) => t.type === form.tableType).map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">تاریخ رزرو (شمسی)</label>
          <input className="form-input" placeholder="1403/04/25" value={form.reservationDate} onChange={(e) => setForm((p) => ({ ...p, reservationDate: e.target.value }))} dir="ltr" />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">ساعت شروع *</label>
          <input className="form-input" type="time" value={form.startTime} onChange={(e) => setForm((p) => ({ ...p, startTime: e.target.value }))} dir="ltr" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">مدت (دقیقه)</label>
          <input className="form-input" type="number" dir="ltr" value={form.durationMinutes} onChange={(e) => setForm((p) => ({ ...p, durationMinutes: e.target.value }))} placeholder="60" />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">تعداد نفرات</label>
          <input className="form-input" type="number" dir="ltr" value={form.playerCount} onChange={(e) => setForm((p) => ({ ...p, playerCount: e.target.value }))} placeholder="2" />
        </div>
      </div>
      <div>
        <label className="block text-xs text-slate-400 mb-1">یادداشت</label>
        <input className="form-input" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} placeholder="توضیحات رزرو..." />
      </div>
      <div className="flex gap-3">
        <button className="btn btn-secondary flex-1" onClick={() => { setAddModal(false); setEditRes(null); resetForm(); }}>انصراف</button>
        <button className="btn btn-primary flex-1" onClick={handleSave} disabled={loading}>
          {loading ? "در حال ذخیره..." : editRes ? "💾 ذخیره" : "➕ ثبت رزرو"}
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex gap-3 items-center flex-wrap">
        <input
          className="form-input flex-1 min-w-32"
          placeholder="جستجو نام یا تلفن..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <input
          className="form-input w-40"
          placeholder="تاریخ شمسی"
          value={filterDate}
          onChange={(e) => setFilterDate(e.target.value)}
          dir="ltr"
        />
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => setFilterDate("")}
        >همه</button>
        <button className="btn btn-primary" onClick={() => { resetForm(); setAddModal(true); }}>
          ➕ رزرو جدید
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center text-slate-500 py-12">رزروی یافت نشد</div>
      ) : (
        <div className="space-y-3">
          {filtered.map((res) => {
            const s = STATUS_LABELS[res.status] || { label: res.status, color: "#64748b" };
            return (
              <div key={res.id} className="card">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-bold text-white">{res.customerName}</span>
                      {res.customerPhone && (
                        <span className="text-xs text-slate-400 dir-ltr" dir="ltr">{res.customerPhone}</span>
                      )}
                      <span className="badge" style={{ background: s.color + "33", color: s.color }}>
                        {s.label}
                      </span>
                    </div>
                    <div className="text-sm text-slate-400 flex gap-4 flex-wrap">
                      <span>📅 {res.reservationDate}</span>
                      <span>⏰ {res.startTime}</span>
                      <span>🎯 {TYPE_LABELS[res.tableType]}</span>
                      {res.durationMinutes && <span>⏱ {res.durationMinutes} دقیقه</span>}
                      {res.playerCount && <span>👥 {res.playerCount} نفر</span>}
                    </div>
                    {res.notes && <div className="text-xs text-slate-500 mt-1">{res.notes}</div>}
                  </div>
                  <div className="flex flex-col gap-1">
                    {res.status === "registered" && (
                      <>
                        {res.tableId && (
                          <button
                            className="btn btn-success btn-sm"
                            onClick={() => convertToSession(res)}
                          >▶ شروع</button>
                        )}
                        <button className="btn btn-secondary btn-sm" onClick={() => openEditModal(res)}>✏️</button>
                        <button className="btn btn-sm" style={{ background: "#78350f", color: "#fde68a" }} onClick={() => handleStatusChange(res.id, "cancelled")}>❌ لغو</button>
                      </>
                    )}
                    <button className="btn btn-danger btn-sm" onClick={() => setDeleteId(res.id)}>🗑</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={addModal} onClose={() => { setAddModal(false); resetForm(); }} title="رزرو جدید">
        {formModal}
      </Modal>
      <Modal open={!!editRes} onClose={() => { setEditRes(null); resetForm(); }} title="ویرایش رزرو">
        {formModal}
      </Modal>
      <ConfirmDialog
        open={!!deleteId}
        message="آیا از حذف این رزرو مطمئنید؟"
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
        danger
      />
    </div>
  );
}
