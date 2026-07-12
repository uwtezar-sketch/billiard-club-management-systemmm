"use client";
import { useState, useEffect, useCallback } from "react";
import ConfirmDialog from "./ConfirmDialog";
import { useToast } from "./Toast";

interface UserRow {
  id: number;
  username: string;
  role: string;
}

export default function UsersSection() {
  const { showToast } = useToast();
  const [list, setList] = useState<UserRow[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "employee">("employee");
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [backupLoading, setBackupLoading] = useState(false);

  async function handleBackup() {
    setBackupLoading(true);
    try {
      const res = await fetch("/api/backup");
      if (!res.ok) {
        showToast("خطا در ساخت نسخه پشتیبان", "error");
        return;
      }
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      a.href = url;
      a.download = `billiard-backup-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast("نسخه پشتیبان دانلود شد", "success");
    } catch {
      showToast("خطا در دانلود نسخه پشتیبان", "error");
    } finally {
      setBackupLoading(false);
    }
  }

  const fetchList = useCallback(async () => {
    const res = await fetch("/api/users");
    if (res.ok) setList(await res.json());
  }, []);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  async function handleAdd() {
    if (!username || !password) {
      showToast("نام کاربری و رمز عبور را وارد کنید", "error");
      return;
    }
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, role }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      showToast(data.error || "خطا در ساخت کاربر", "error");
      return;
    }
    showToast("کاربر ساخته شد", "success");
    setUsername("");
    setPassword("");
    setRole("employee");
    fetchList();
  }

  async function handleDelete() {
    if (!deleteId) return;
    await fetch(`/api/users?id=${deleteId}`, { method: "DELETE" });
    showToast("کاربر حذف شد", "success");
    setDeleteId(null);
    fetchList();
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <h3 className="font-bold text-slate-300 mb-2">💾 نسخه پشتیبان</h3>
        <p className="text-xs text-slate-500 mb-3">
          یه فایل کامل از تمام اطلاعات باشگاه (میزها، فاکتورها، بدهکاران، رزروها و...) دانلود می‌کنی. بهتره هر چند وقت یه‌بار (مثلاً هفته‌ای یه‌بار) این کارو بکنی و فایل رو یه‌جای امن (گوگل‌درایو، ایمیل خودت) نگه داری.
        </p>
        <button className="btn btn-primary btn-full" onClick={handleBackup} disabled={backupLoading}>
          {backupLoading ? "در حال آماده‌سازی..." : "⬇️ دانلود نسخه پشتیبان"}
        </button>
      </div>
      <div className="card">
        <h3 className="font-bold text-slate-300 mb-3">➕ افزودن کاربر جدید</h3>
        <div className="space-y-2">
          <input
            placeholder="نام کاربری"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="form-input"
          />
          <input
            placeholder="رمز عبور"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="form-input"
          />
          <div className="flex gap-2">
            <button
              onClick={() => setRole("employee")}
              className={`btn flex-1 ${role === "employee" ? "btn-primary" : "btn-secondary"}`}
            >
              کارمند
            </button>
            <button
              onClick={() => setRole("admin")}
              className={`btn flex-1 ${role === "admin" ? "btn-primary" : "btn-secondary"}`}
            >
              مدیر
            </button>
          </div>
          <button onClick={handleAdd} className="btn btn-success btn-full">
            افزودن کاربر
          </button>
        </div>
      </div>

      <div className="card">
        <h3 className="font-bold text-slate-300 mb-3">👥 لیست کاربران</h3>
        {list.length === 0 ? (
          <div className="text-center text-slate-500 text-sm py-4">کاربری ثبت نشده</div>
        ) : (
          <div className="space-y-2">
            {list.map((u) => (
              <div key={u.id} className="flex justify-between items-center rounded-lg px-3 py-2" style={{ background: "#0e1512" }}>
                <div>
                  <div className="text-white text-sm font-medium">{u.username}</div>
                  <div className="text-xs" style={{ color: u.role === "admin" ? "#e0b23a" : "#8a9488" }}>
                    {u.role === "admin" ? "مدیر" : "کارمند"}
                  </div>
                </div>
                <button onClick={() => setDeleteId(u.id)} className="btn btn-danger btn-sm">
                  🗑️ حذف
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteId}
        message="آیا از حذف این کاربر مطمئنید؟"
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
        danger
      />
    </div>
  );
}
