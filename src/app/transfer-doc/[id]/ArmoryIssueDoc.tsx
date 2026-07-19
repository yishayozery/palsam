import type { ReactNode } from "react";
import PrintButton from "@/components/PrintButton";
import { ARMORY_ISSUE_TITLE, ARMORY_ISSUE_CLAUSES, ARMORY_ISSUE_WARNING } from "@/lib/armory-issue-text";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sig = { signatureData: string | null; signedAt: Date | null; soldier: { fullName: string; personalNumber: string | null } | null; signerUser: { fullName: string; title: string | null } | null };

export type ArmoryIssueData = {
  docNumber: string;
  battalionName: string;
  logoData: string | null;
  motto: string | null;
  soldier: { fullName: string; personalNumber: string | null; companyName: string | null } | null;
  externalName: string | null; // מקבל חיצוני אם אין soldier
  issueDate: Date;
  endDate: Date | null; // סיום תעסוקה
  purpose: string | null; // לצורך
  issuerName: string; // מנפק (מוסר)
  issuerHolderName: string | null;
  declarationText: string | null; // טקסט הצהרה מותאם למחסן (weaponsAgreementText), אחרת ברירת מחדל
  lines: { name: string; sku: string | null; quantity: number; serial: string | null }[];
  signature: Sig | null;
  approverName: string | null;
  approverPersonalNumber: string | null;
  approverTitle: string | null;
  approvedAt: Date | null;
  approverSignature: string | null;
};

function fmt(d: Date | null | undefined): string {
  if (!d) return "—";
  return d.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" });
}

export default function ArmoryIssueDoc({ d, hideToolbar = false, extraToolbar }: { d: ArmoryIssueData; hideToolbar?: boolean; extraToolbar?: ReactNode }) {
  const recipientName = d.soldier?.fullName ?? d.externalName ?? "________________";
  const recipientPn = d.soldier?.personalNumber ?? null;
  const clauses = d.declarationText
    ? d.declarationText.split("\n").map((s) => s.trim()).filter(Boolean)
    : ARMORY_ISSUE_CLAUSES;

  return (
    <div className="aid-wrap" dir="rtl">
      <style>{CSS}</style>

      <div className="aid-toolbar">
        <div className="aid-hint">אישור ניפוק נשק אישי — הופק אוטומטית ממערכת PALMY לאחר ההחתמה.</div>
        <PrintButton />
      </div>

      <div className="aid-sheet">
        {/* Letterhead */}
        <div className="aid-head">
          <div className="aid-unit">
            {d.logoData && (
              // eslint-disable-next-line @next/next/no-img-element
              <div className="aid-seal"><img src={d.logoData} alt="סמל הגדוד" /></div>
            )}
            <div>
              <div className="aid-uname">{d.battalionName}</div>
              {d.motto && <div className="aid-umotto">״{d.motto}״</div>}
              <div className="aid-usys">Palmy · מערכת ניהול מלאי</div>
            </div>
          </div>
          <div className="aid-meta">
            <div className="aid-mrow"><span>טופס</span><b>1008</b></div>
            <div className="aid-mrow"><span>אסמכתא</span><b>{d.docNumber}</b></div>
            <div className="aid-mrow"><span>תאריך</span><b>{fmt(d.issueDate)}</b></div>
          </div>
        </div>

        {/* Title */}
        <div className="aid-title-wrap">
          <div className="aid-eyebrow">במרום טופס 1008 · אישור שלישות חטיבה 2</div>
          <h1 className="aid-title">{ARMORY_ISSUE_TITLE}</h1>
          <div className="aid-title-rule" />
        </div>

        {/* Recipient / validity */}
        <div className="aid-slabel">פרטי מקבל הנשק</div>
        <div className="aid-grid">
          <div className="aid-cell"><div className="aid-k">שם מלא</div><div className="aid-v">{recipientName}</div></div>
          <div className="aid-cell"><div className="aid-k">מספר אישי (מ.א.)</div><div className="aid-v mono">{recipientPn ?? "—"}</div></div>
          <div className="aid-cell"><div className="aid-k">פלוגה</div><div className="aid-v">{d.soldier?.companyName ?? "—"}</div></div>
          <div className="aid-cell"><div className="aid-k">מתאריך</div><div className="aid-v mono">{fmt(d.issueDate)}</div></div>
          <div className="aid-cell"><div className="aid-k">עד תאריך (סיום תעסוקה)</div><div className="aid-v mono">{fmt(d.endDate)}</div></div>
          <div className="aid-cell"><div className="aid-k">לצורך</div><div className="aid-v">{d.purpose ?? "תע\"מ"}</div></div>
        </div>

        {/* Declaration */}
        <div className="aid-slabel">הצהרת החייל</div>
        <div className="aid-declare">
          <h3>הנני מצהיר/ה בזאת כי:</h3>
          <ol>
            {clauses.map((c, i) => <li key={i}>{c}</li>)}
          </ol>
        </div>
        <div className="aid-warn">⚠ {ARMORY_ISSUE_WARNING}</div>

        {/* חתימת החייל — מתחת להצהרה ("החתימה למטה מהווה אישור...") */}
        <div className="aid-declare-sig">
          <div className="aid-ds-fields">
            <span>שם מלא: <b>{recipientName}</b></span>
            <span>מ.א.: <b className="mono">{recipientPn ?? "—"}</b></span>
            <span>תאריך: <b className="mono">{fmt(d.signature?.signedAt ?? d.issueDate)}</b></span>
          </div>
          <div className="aid-ds-sig">
            <span className="aid-ds-label">חתימת החייל:</span>
            {d.signature?.signatureData ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={d.signature.signatureData} alt="חתימת חייל" className="aid-ds-img" />
            ) : (
              <span className="aid-ds-slot" />
            )}
          </div>
        </div>

        {/* Items */}
        <div className="aid-slabel">פירוט הנשק והציוד המנופק</div>
        <div className="aid-tbl-wrap">
          <table className="aid-tbl">
            <thead>
              <tr>
                <th className="num">#</th>
                <th>מק&quot;ט</th>
                <th>שם פריט</th>
                <th className="num">כמות</th>
                <th>מסט&quot;ב / צ׳</th>
              </tr>
            </thead>
            <tbody>
              {d.lines.map((l, i) => (
                <tr key={i}>
                  <td className="num">{i + 1}</td>
                  <td className="mono">{l.sku ?? "—"}</td>
                  <td className="iname">{l.name}</td>
                  <td className="qty">{l.quantity}</td>
                  <td className="mono">{l.serial ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* חתימות — מוסר (מפקד הארמון) · מקבל (חתימה חוזרת) · מאשר הנשק */}
        <div className="aid-slabel">חתימות</div>
        <div className="aid-sigs">
          {/* מוסר — מפקד הארמון */}
          <div className="aid-sig">
            <div className="aid-role">מוסר (מפקד הארמון)</div>
            <div className="aid-f">שם: <b>{d.issuerName}</b></div>
            {d.issuerHolderName && <div className="aid-f">מחסן: <b>{d.issuerHolderName}</b></div>}
            <div className="aid-sig-slot">חתימת המוסר</div>
          </div>
          {/* מקבל — חתימה חוזרת + פרטים */}
          <div className="aid-sig">
            <div className="aid-role">מקבל (החייל)</div>
            <div className="aid-f">שם: <b>{recipientName}</b></div>
            <div className="aid-f">מ.א.: <b className="mono">{recipientPn ?? "—"}</b></div>
            <div className="aid-f">תאריך: <b className="mono">{fmt(d.signature?.signedAt ?? d.issueDate)}</b></div>
            {d.signature?.signatureData ? (
              <div className="aid-sig-img">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={d.signature.signatureData} alt="חתימת חייל" />
              </div>
            ) : (
              <div className="aid-sig-slot">חתימה</div>
            )}
          </div>
          {/* מאשר הנשק */}
          <div className="aid-sig">
            <div className="aid-role">מאשר נשיאת הנשק</div>
            <div className="aid-f">שם: <b>{d.approverName ?? "________________"}</b></div>
            <div className="aid-f">מ.א.: <b className="mono">{d.approverPersonalNumber ?? "—"}</b></div>
            <div className="aid-f">תפקיד: <b>{d.approverTitle ?? 'מג"ד / סמג"ד / קמב"ץ'}</b></div>
            <div className="aid-f">תאריך: <b className="mono">{d.approvedAt ? fmt(d.approvedAt) : "____ / ____ / ____"}</b></div>
            {d.approverSignature ? (
              <div className="aid-sig-img">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={d.approverSignature} alt="חתימת מאשר" />
              </div>
            ) : (
              <div className="aid-sig-slot">חתימת המאשר</div>
            )}
          </div>
        </div>

        <div className="aid-foot">
          <div className="aid-stamp">מסמך זה הופק אוטומטית ממערכת PALMY · אסמכתא {d.docNumber}</div>
          <div className="aid-brand">🛡 PALMY</div>
        </div>
      </div>
    </div>
  );
}

const CSS = `
.aid-wrap{
  --paper:#fff; --paper-edge:#f4f4ef; --ink:#181c17; --ink-soft:#3b4038; --label:#6b6f61;
  --olive:#38471f; --olive-2:#4c5c2c; --olive-tint:#eef0e4; --brass:#8a7440;
  --rule:#cdd0c0; --rule-strong:#9aa085; --danger:#7a2a1e; --danger-bg:#f7ece7;
  --mono:"SF Mono",ui-monospace,"Consolas","Menlo",monospace;
  --serif:"Frank Ruhl Libre","David Libre","Narkisim","Times New Roman",serif;
  font-family:system-ui,"Segoe UI","Arial Hebrew",Arial,sans-serif;
  direction:rtl;text-align:right;color:var(--ink);
  display:flex;flex-direction:column;align-items:center;gap:16px;
  background:#dfe0d8;padding:24px 14px;min-height:100vh;
}
.aid-toolbar{width:min(820px,100%);display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;}
.aid-hint{font-size:12.5px;color:var(--ink-soft);opacity:.85;}
.aid-sheet{position:relative;width:min(820px,100%);background:var(--paper);border:1px solid var(--rule);
  box-shadow:0 12px 40px rgba(24,28,23,.18);padding:34px 40px 30px;overflow:hidden;}
.aid-sheet::before{content:"";position:absolute;inset:0 0 auto 0;height:6px;
  background:linear-gradient(90deg,var(--olive) 0%,var(--olive-2) 60%,var(--brass) 100%);}
.aid-head{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;
  padding-bottom:16px;border-bottom:2px solid var(--olive);margin-top:6px;}
.aid-unit{display:flex;gap:14px;align-items:center;}
.aid-seal{width:74px;height:74px;flex:0 0 auto;border-radius:50%;border:2px solid var(--olive);
  padding:4px;background:#fff;display:flex;align-items:center;justify-content:center;}
.aid-seal img{width:100%;height:100%;object-fit:contain;border-radius:50%;}
.aid-uname{font-family:var(--serif);font-size:23px;font-weight:700;color:var(--olive);line-height:1.15;}
.aid-umotto{font-size:12.5px;color:var(--brass);font-style:italic;margin-top:2px;}
.aid-usys{font-size:10.5px;letter-spacing:.34em;color:var(--label);margin-top:5px;text-transform:uppercase;}
.aid-meta{text-align:left;direction:ltr;font-size:12px;color:var(--ink-soft);min-width:168px;}
.aid-mrow{display:flex;justify-content:space-between;gap:14px;padding:2px 0;border-bottom:1px dotted var(--rule);}
.aid-mrow span{color:var(--label);}
.aid-mrow b{font-family:var(--mono);font-variant-numeric:tabular-nums;}
.aid-title-wrap{text-align:center;margin:20px 0 18px;}
.aid-eyebrow{font-size:11px;letter-spacing:.3em;color:var(--brass);font-weight:700;}
.aid-title{font-family:var(--serif);font-size:30px;font-weight:800;color:var(--ink);margin:6px 0 0;text-wrap:balance;}
.aid-title-rule{width:120px;height:2px;background:var(--rule-strong);margin:12px auto 0;position:relative;}
.aid-title-rule::after{content:"";position:absolute;top:-3px;right:50%;transform:translateX(50%);
  width:8px;height:8px;border-radius:50%;background:var(--olive);}
.aid-slabel{font-size:12px;font-weight:700;color:var(--olive);letter-spacing:.04em;display:flex;align-items:center;gap:8px;margin:0 0 8px;}
.aid-slabel::before{content:"";width:4px;height:14px;background:var(--olive);border-radius:2px;display:inline-block;}
.aid-grid{display:grid;grid-template-columns:repeat(3,1fr);border:1px solid var(--rule);margin-bottom:18px;}
.aid-cell{padding:9px 12px;border-inline-start:1px solid var(--rule);border-bottom:1px solid var(--rule);min-height:44px;}
.aid-cell:nth-child(3n+1){border-inline-start:none;}
.aid-k{font-size:10.5px;color:var(--label);}
.aid-v{font-size:14.5px;font-weight:600;color:var(--ink);margin-top:3px;}
.aid-v.mono{font-family:var(--mono);font-variant-numeric:tabular-nums;}
.aid-declare{border:1px solid var(--rule-strong);background:var(--olive-tint);padding:14px 16px;margin-bottom:8px;}
.aid-declare h3{margin:0 0 9px;font-size:13px;color:var(--olive);font-weight:700;}
.aid-declare ol{margin:0;padding-inline-start:20px;display:flex;flex-direction:column;gap:5px;}
.aid-declare li{font-size:12.3px;line-height:1.5;color:var(--ink-soft);}
.aid-warn{margin:10px 0 12px;padding:8px 12px;border:1px solid var(--danger);background:var(--danger-bg);
  color:var(--danger);font-size:11.6px;font-weight:600;}
.aid-declare-sig{display:flex;justify-content:space-between;align-items:flex-end;gap:14px;flex-wrap:wrap;
  border:1px solid var(--rule);border-inline-start:3px solid var(--olive);padding:8px 12px;margin-bottom:20px;}
.aid-ds-fields{display:flex;flex-direction:column;gap:3px;font-size:11px;color:var(--label);}
.aid-ds-fields b{color:var(--ink);font-size:12.5px;}
.aid-ds-sig{display:flex;align-items:flex-end;gap:8px;}
.aid-ds-label{font-size:10px;color:var(--label);}
.aid-ds-img{max-height:46px;max-width:150px;object-fit:contain;}
.aid-ds-slot{display:inline-block;width:150px;border-bottom:1px solid var(--ink-soft);height:36px;}
.aid-sigs-one{display:flex;}
.aid-sigs-one .aid-sig{width:50%;}
.aid-tbl-wrap{overflow-x:auto;margin-bottom:22px;}
.aid-tbl{width:100%;border-collapse:collapse;font-size:12.5px;}
.aid-tbl thead th{background:var(--olive);color:#fff;font-weight:600;padding:8px 10px;text-align:right;
  border:1px solid var(--olive);white-space:nowrap;}
.aid-tbl tbody td{padding:8px 10px;border:1px solid var(--rule);vertical-align:middle;}
.aid-tbl tbody tr:nth-child(even){background:var(--paper-edge);}
.aid-tbl .num{text-align:center;width:34px;}
.aid-tbl .mono{font-family:var(--mono);font-variant-numeric:tabular-nums;font-size:11.8px;}
.aid-tbl .qty{text-align:center;font-family:var(--mono);font-weight:700;width:52px;}
.aid-tbl .iname{font-weight:600;color:var(--ink);}
.aid-sigs{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:6px;}
.aid-sig{border:1px solid var(--rule);border-top:3px solid var(--olive);padding:12px 13px 14px;
  display:flex;flex-direction:column;gap:7px;}
.aid-role{font-size:11.5px;font-weight:700;color:var(--olive);}
.aid-f{font-size:11px;color:var(--label);}
.aid-f b{display:inline;color:var(--ink);font-size:12.8px;font-weight:600;}
.aid-f b.mono{font-family:var(--mono);font-variant-numeric:tabular-nums;}
.aid-sig-slot{margin-top:auto;height:52px;border:1px dashed var(--rule-strong);border-radius:3px;
  display:flex;align-items:center;justify-content:center;background:var(--paper-edge);
  font-size:10px;color:var(--label);letter-spacing:.04em;}
.aid-sig-img{margin-top:auto;border:1px solid var(--rule);border-radius:3px;padding:4px;background:var(--paper-edge);}
.aid-sig-img img{max-height:52px;object-fit:contain;display:block;margin:0 auto;}
.aid-foot{margin-top:24px;padding-top:12px;border-top:1px solid var(--rule);display:flex;
  justify-content:space-between;align-items:center;gap:10px;font-size:10.5px;color:var(--label);}
.aid-stamp{font-family:var(--mono);letter-spacing:.04em;}
.aid-brand{display:flex;align-items:center;gap:6px;font-weight:600;color:var(--olive);letter-spacing:.14em;}
@media (max-width:640px){
  .aid-sheet{padding:22px 18px;}
  .aid-grid{grid-template-columns:1fr 1fr;}
  .aid-cell:nth-child(3n+1){border-inline-start:1px solid var(--rule);}
  .aid-cell:nth-child(2n+1){border-inline-start:none;}
  .aid-sigs{grid-template-columns:1fr;}
  .aid-title{font-size:24px;}
  .aid-head{flex-direction:column;}
  .aid-meta{direction:rtl;text-align:right;width:100%;}
}
@media print{
  /* 🎯 יעד: התעודה כולה בעמוד A4 אחד. דחיסה טיפוגרפית — לא scale (שמשאיר שוליים ריקים). */
  @page{size:A4;margin:7mm;}
  .aid-wrap{background:#fff;padding:0;min-height:0;gap:0;}
  .aid-toolbar{display:none;}
  /* overflow:hidden חתך את התעודה — חייב visible */
  .aid-sheet{box-shadow:none;border:none;width:100%;overflow:visible;padding:8px 10px 6px;}
  .aid-sheet::before{height:3px;}

  /* כותרת עליונה */
  .aid-head{padding-bottom:6px;margin-top:2px;gap:10px;}
  .aid-seal{width:46px;height:46px;padding:2px;}
  .aid-uname{font-size:15px;}
  .aid-umotto{font-size:9px;margin-top:1px;}
  .aid-usys{font-size:7.5px;letter-spacing:.2em;margin-top:2px;}
  .aid-meta{font-size:8.5px;min-width:130px;}
  .aid-mrow{padding:0;}

  /* כותרת ראשית */
  .aid-title-wrap{margin:7px 0 6px;}
  .aid-eyebrow{font-size:8px;letter-spacing:.18em;}
  .aid-title{font-size:18px;margin:2px 0 0;}
  .aid-title-rule{margin:5px auto 0;height:1.5px;width:90px;}

  /* מקטעים ופרטי מקבל */
  .aid-slabel{font-size:9px;margin:0 0 4px;gap:5px;}
  .aid-slabel::before{height:10px;width:3px;}
  .aid-grid{margin-bottom:7px;}
  .aid-cell{padding:3px 7px;min-height:0;}
  .aid-k{font-size:7.5px;}
  .aid-v{font-size:10px;margin-top:1px;}

  /* הצהרה — הבלוק הארוך ביותר */
  .aid-declare{padding:6px 8px;margin-bottom:4px;}
  .aid-declare h3{font-size:9.5px;margin:0 0 4px;}
  .aid-declare ol{gap:1px;padding-inline-start:14px;}
  .aid-declare li{font-size:8px;line-height:1.28;}
  .aid-warn{margin:4px 0 5px;padding:4px 7px;font-size:8px;}
  .aid-declare-sig{padding:4px 8px;margin-bottom:7px;gap:8px;}
  .aid-ds-fields{font-size:8px;gap:1px;}
  .aid-ds-fields b{font-size:9px;}
  .aid-ds-label{font-size:7.5px;}
  .aid-ds-img{max-height:30px;max-width:110px;}
  .aid-ds-slot{width:110px;height:22px;}

  /* טבלת הפריטים */
  .aid-tbl-wrap{overflow:visible;margin-bottom:7px;}
  .aid-tbl{font-size:8.5px;}
  .aid-tbl thead th{padding:3px 6px;}
  .aid-tbl tbody td{padding:2.5px 6px;}
  .aid-tbl .mono{font-size:8px;}

  /* חתימות */
  .aid-sigs{gap:8px;margin-top:2px;}
  .aid-sig{padding:6px 8px 7px;gap:3px;border-top-width:2px;}
  .aid-role{font-size:8.5px;}
  .aid-f{font-size:8px;}
  .aid-f b{font-size:9px;}
  .aid-sig-slot{height:30px;font-size:7.5px;}
  .aid-sig-img{padding:2px;}
  .aid-sig-img img{max-height:32px;}
  .aid-foot{margin-top:7px;padding-top:5px;font-size:7.5px;}

  /* לא לפצל בלוקים — ואם בכל זאת חורג, שלא ייחתך */
  .aid-tbl tr,.aid-sig,.aid-warn,.aid-declare li,.aid-declare-sig{break-inside:avoid;page-break-inside:avoid;}
  .aid-tbl thead{display:table-header-group;}
  .aid-tbl thead th,.aid-declare,.aid-warn,.aid-sheet::before{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
}
`;
