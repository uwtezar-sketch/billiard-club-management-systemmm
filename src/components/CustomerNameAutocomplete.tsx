"use client";
import { useState, useRef, useEffect } from "react";

interface DirectoryItem {
  name: string;
  phone: string;
}

interface Props {
  value: string;
  onChange: (name: string, matchedPhone?: string) => void;
  directory: DirectoryItem[];
  placeholder?: string;
  className?: string;
}

// برخلاف <datalist> مرورگر که برای متن فارسی و توی موبایل قابل‌اعتماد نیست،
// این کامپوننت هر جای اسم رو جستجو می‌کنه (نه فقط از اول) — یعنی تایپ «مروی» توی
// «محمد مروی» هم پیدا می‌شه.
export default function CustomerNameAutocomplete({ value, onChange, directory, placeholder, className }: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const query = value.trim().toLowerCase();
  const matches =
    query.length >= 1
      ? directory
          .filter((d) => d.name.toLowerCase().includes(query))
          .sort((a, b) => a.name.toLowerCase().indexOf(query) - b.name.toLowerCase().indexOf(query))
          .slice(0, 6)
      : [];

  return (
    <div className="relative" ref={containerRef}>
      <input
        className={className || "form-input w-full"}
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        autoComplete="off"
      />
      {open && matches.length > 0 && (
        <div
          className="absolute z-50 mt-1 w-full rounded-lg overflow-hidden shadow-lg max-h-48 overflow-y-auto"
          style={{ background: "#1a2420", border: "1px solid #2a3a30" }}
        >
          {matches.map((m) => (
            <button
              key={m.phone + m.name}
              type="button"
              className="w-full text-right px-3 py-2 text-sm flex justify-between items-center gap-2"
              style={{ borderBottom: "1px solid #26332a" }}
              onMouseDown={(e) => {
                e.preventDefault(); // تا قبل از onBlur اجرا بشه
                onChange(m.name, m.phone);
                setOpen(false);
              }}
            >
              <span className="text-white">{m.name}</span>
              {m.phone && (
                <span className="text-slate-400 text-xs shrink-0" dir="ltr">{m.phone}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
