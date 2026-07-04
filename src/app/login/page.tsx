"use client";
import { useState, FormEvent } from "react";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "خطا در ورود");
        setLoading(false);
        return;
      }
      window.location.href = "/";
    } catch {
      setError("خطا در ارتباط با سرور");
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)" }}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl p-6"
        style={{ background: "#1e293b", border: "1px solid #334155" }}
      >
        <div className="text-center mb-6">
          <div className="text-3xl mb-2">🎱</div>
          <h1 className="text-lg font-black text-white">بیلیارد ارم</h1>
          <p className="text-xs text-slate-400">ورود به سامانه</p>
        </div>

        {error && (
          <div className="mb-4 text-sm text-red-300 bg-red-950/40 border border-red-800 rounded-lg px-3 py-2 text-center">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-400 block mb-1">نام کاربری</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-lg px-3 py-2 bg-slate-800 border border-slate-700 text-white outline-none"
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">رمز عبور</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg px-3 py-2 bg-slate-800 border border-slate-700 text-white outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg py-2.5 font-bold text-white bg-blue-600 disabled:opacity-50"
          >
            {loading ? "..." : "ورود"}
          </button>
        </div>
      </form>
    </div>
  );
}
