"use client";

import { useRef, useState } from "react";

export default function ImportExcel({
  action,
  templateHref,
  label = "ייבוא מאקסל",
}: {
  action: (fd: FormData) => Promise<void>;
  templateHref: string;
  label?: string;
}) {
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className="flex items-center gap-2">
      <a href={templateHref} className="text-sm bg-white border border-slate-300 rounded-lg px-3 py-2 hover:bg-slate-50">
        ⬇ תבנית לדוגמה
      </a>
      <form
        ref={formRef}
        action={async (fd) => { setBusy(true); try { await action(fd); } finally { setBusy(false); setFileName(""); if (formRef.current) formRef.current.reset(); } }}
        className="flex items-center gap-2"
      >
        <label className="text-sm bg-emerald-600 text-white rounded-lg px-3 py-2 cursor-pointer hover:bg-emerald-700">
          {label}
          <input
            type="file" name="file" accept=".xlsx,.xls" className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) { setFileName(f.name); e.currentTarget.form?.requestSubmit(); }
            }}
          />
        </label>
        {busy && <span className="text-xs text-slate-500">מייבא{fileName ? ` ${fileName}` : ""}...</span>}
      </form>
    </div>
  );
}
