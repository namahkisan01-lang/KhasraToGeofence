"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Lightweight searchable single-select.
 * Items: [{ code, name, hasData? }, ...]. Filters by name + code (case-insensitive).
 */
export default function SearchableSelect({
  items,
  value,
  onChange,
  placeholder = "Select...",
  loading = false,
  disabled = false,
  emptyText = "No options",
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const selected = useMemo(
    () => (items || []).find((it) => it.code === value) || null,
    [items, value]
  );

  const filtered = useMemo(() => {
    if (!items) return [];
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => {
      const hay = `${it.name} ${it.code}`.toLowerCase();
      return hay.includes(q);
    });
  }, [items, query]);

  useEffect(() => setHighlight(0), [query, open]);

  useEffect(() => {
    function onClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function commit(item) {
    onChange(item.code, item);
    setOpen(false);
    setQuery("");
  }

  function onKey(e) {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      setOpen(true);
      e.preventDefault();
      return;
    }
    if (!open) return;
    if (e.key === "ArrowDown") {
      setHighlight((h) => Math.min(filtered.length - 1, h + 1));
      e.preventDefault();
    } else if (e.key === "ArrowUp") {
      setHighlight((h) => Math.max(0, h - 1));
      e.preventDefault();
    } else if (e.key === "Enter") {
      if (filtered[highlight]) commit(filtered[highlight]);
      e.preventDefault();
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        disabled={disabled || loading}
        onClick={() => {
          setOpen((o) => !o);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        className="input text-left flex items-center justify-between gap-2"
      >
        <span className={selected ? "text-slate-900" : "text-slate-400"}>
          {loading
            ? "Loading..."
            : selected
            ? `${selected.name} (${selected.code})`
            : placeholder}
        </span>
        <svg
          className={`w-4 h-4 text-slate-400 transition ${open ? "rotate-180" : ""}`}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 011.08 1.04l-4.25 4.4a.75.75 0 01-1.08 0l-4.25-4.4a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full bg-white rounded-lg border border-slate-200 shadow-lg overflow-hidden">
          <div className="p-2 border-b border-slate-100">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKey}
              placeholder="Type to search..."
              className="w-full px-2 py-1.5 text-sm rounded border border-slate-200
                         focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <ul ref={listRef} className="max-h-64 overflow-y-auto py-1 text-sm">
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-slate-400 text-sm">{emptyText}</li>
            )}
            {filtered.slice(0, 200).map((it, i) => (
              <li
                key={it.code}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => commit(it)}
                className={`px-3 py-2 cursor-pointer flex items-center justify-between ${
                  i === highlight ? "bg-blue-50" : ""
                } ${value === it.code ? "font-medium text-blue-700" : ""}`}
              >
                <span className="truncate">{it.name}</span>
                <span className="text-xs text-slate-400 ml-2 flex-shrink-0">
                  {it.code}
                </span>
              </li>
            ))}
            {filtered.length > 200 && (
              <li className="px-3 py-2 text-xs text-slate-400 italic border-t border-slate-100">
                {filtered.length - 200} more — keep typing to narrow
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
