import React from "react";
import { renderToBuffer, Document, Page, View, Text, Font, StyleSheet, Image } from "@react-pdf/renderer";
import { TRANSFER_TYPE, TRANSFER_STATUS } from "./labels";

Font.register({
  family: "Heebo",
  fonts: [
    { src: "https://fonts.gstatic.com/s/heebo/v28/NGSpv5_NC0k9P_v6ZUCbLRAHxK1EiSyccg.ttf", fontWeight: 400 },
    { src: "https://fonts.gstatic.com/s/heebo/v28/NGSpv5_NC0k9P_v6ZUCbLRAHxK1Ebiuccg.ttf", fontWeight: 700 },
  ],
});

const s = StyleSheet.create({
  page: { fontFamily: "Heebo", fontSize: 11, padding: 40, direction: "rtl" as never },
  header: { borderBottomWidth: 2, borderBottomColor: "#1e293b", paddingBottom: 12, marginBottom: 16, flexDirection: "row-reverse", justifyContent: "space-between" },
  title: { fontSize: 18, fontWeight: 700, color: "#1e293b" },
  subtitle: { fontSize: 10, color: "#64748b", marginTop: 4 },
  meta: { textAlign: "left" as never, fontSize: 10 },
  metaBold: { fontWeight: 700 },
  metaLight: { color: "#64748b" },
  grid: { flexDirection: "row-reverse", flexWrap: "wrap", marginBottom: 16, gap: 8 },
  gridItem: { width: "48%", flexDirection: "row-reverse", gap: 4, fontSize: 10 },
  gridLabel: { color: "#64748b" },
  gridValue: { fontWeight: 700 },
  table: { marginBottom: 16 },
  tableHeader: { flexDirection: "row-reverse", backgroundColor: "#f1f5f9" },
  tableRow: { flexDirection: "row-reverse", borderBottomWidth: 1, borderBottomColor: "#e2e8f0" },
  th: { padding: 6, fontSize: 9, fontWeight: 700, borderWidth: 1, borderColor: "#cbd5e1", textAlign: "right" as never },
  td: { padding: 6, fontSize: 9, borderWidth: 1, borderColor: "#cbd5e1", textAlign: "right" as never },
  colIdx: { width: "6%" },
  colItem: { width: "30%" },
  colSerial: { width: "22%" },
  colQty: { width: "12%", textAlign: "center" as never },
  colStatus: { width: "15%" },
  colUnit: { width: "15%" },
  signatureRow: { flexDirection: "row-reverse", marginTop: 32, gap: 24 },
  signatureBox: { flex: 1, borderTopWidth: 1, borderTopColor: "#94a3b8", paddingTop: 8 },
  sigLabel: { fontSize: 9, color: "#64748b" },
  sigName: { fontSize: 10, fontWeight: 700, marginTop: 4 },
  clause: { marginTop: 24, borderWidth: 2, borderColor: "#1e293b", borderRadius: 6, padding: 12, backgroundColor: "#f8fafc" },
  clauseTitle: { fontSize: 9, fontWeight: 700, marginBottom: 6 },
  clauseText: { fontSize: 10, lineHeight: 1.6 },
  footer: { fontSize: 8, color: "#94a3b8", textAlign: "center" as never, marginTop: 24 },
  totalRow: { flexDirection: "row-reverse", backgroundColor: "#f1f5f9" },
  bold: { fontWeight: 700 },
  logo: { width: 46, height: 46, marginBottom: 4, alignSelf: "flex-end" as never, objectFit: "contain" as never },
});

type TransferData = {
  id: string;
  type: string;
  status: string;
  reason: string | null;
  createdAt: Date;
  battalion: { name: string; code: string; motto: string | null; logoData?: string | null } | null;
  fromHolder: { name: string; signatureClause: string | null } | null;
  toHolder: { name: string } | null;
  toSoldier: { fullName: string; personalNumber: string | null } | null;
  createdBy: { fullName: string };
  approvedBy: { fullName: string } | null;
  approvedAt: Date | null;
  lines: Array<{
    itemType: { name: string; sku: string | null; unit: string };
    serialUnit: { serialNumber: string; lotQuantity: number | null } | null;
    status: { name: string } | null;
    quantity: number;
  }>;
  signatures: Array<{
    signedAt: Date | null;
    soldier: { fullName: string; personalNumber: string | null } | null;
    signerUser: { fullName: string; title: string | null } | null;
  }>;
};

function TransferPDF({ t }: { t: TransferData }) {
  const docNumber = t.id.slice(-8).toUpperCase();
  const unitName = t.battalion?.name || "גדוד";
  const dateStr = t.createdAt.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" });
  const timeStr = t.createdAt.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem" });
  // זיכוי מחייל: הכיוון הפוך — החייל הוא המקור והמחסן הוא היעד
  const isSoldierReturn = t.type === "CHECKIN" && !!t.toSoldier;
  const fromName = isSoldierReturn
    ? (t.toSoldier?.fullName ?? "חייל")
    : (t.fromHolder?.name ?? "חטיבה (גורם חיצוני)");
  const toName = isSoldierReturn
    ? (t.toHolder?.name ?? "מחסן")
    : (t.toSoldier?.fullName ?? t.toHolder?.name ?? "חטיבה (גורם חיצוני)");
  const sig = t.signatures?.[0];
  const approverName = t.approvedBy?.fullName ?? sig?.soldier?.fullName ?? sig?.signerUser?.fullName ?? "________________";
  const totalQty = t.lines.reduce((sum, l) => sum + (l.quantity || (l.serialUnit?.lotQuantity ?? 1)), 0);

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View>
            <Text style={s.title}>תעודת העברת ציוד</Text>
            <Text style={s.subtitle}>{TRANSFER_TYPE[t.type as keyof typeof TRANSFER_TYPE] ?? t.type}</Text>
          </View>
          <View style={s.meta}>
            {t.battalion?.logoData && <Image src={t.battalion.logoData} style={s.logo} />}
            <Text style={s.metaBold}>{unitName}</Text>
            {t.battalion?.motto && <Text style={s.metaLight}>״{t.battalion.motto}״</Text>}
            <Text style={s.metaLight}>מס׳ תעודה: {docNumber}</Text>
            <Text style={s.metaLight}>{dateStr} {timeStr}</Text>
          </View>
        </View>

        <View style={s.grid}>
          <View style={s.gridItem}>
            <Text style={s.gridLabel}>מאת: </Text>
            <Text style={s.gridValue}>{fromName}</Text>
          </View>
          <View style={s.gridItem}>
            <Text style={s.gridLabel}>אל: </Text>
            <Text style={s.gridValue}>{toName}</Text>
            {!isSoldierReturn && t.toSoldier?.personalNumber && <Text style={s.gridLabel}> (מ.א. {t.toSoldier.personalNumber})</Text>}
          </View>
          <View style={s.gridItem}>
            <Text style={s.gridLabel}>סטטוס: </Text>
            <Text>{TRANSFER_STATUS[t.status as keyof typeof TRANSFER_STATUS] ?? t.status}</Text>
          </View>
          <View style={s.gridItem}>
            <Text style={s.gridLabel}>בוצע ע״י: </Text>
            <Text>{t.createdBy.fullName}</Text>
          </View>
          {t.reason && (
            <View style={s.gridItem}>
              <Text style={s.gridLabel}>הערה: </Text>
              <Text>{t.reason}</Text>
            </View>
          )}
        </View>

        <View style={s.table}>
          <View style={s.tableHeader}>
            <Text style={[s.th, s.colIdx]}>#</Text>
            <Text style={[s.th, s.colItem]}>פריט</Text>
            <Text style={[s.th, s.colSerial]}>מספר סריאלי</Text>
            <Text style={[s.th, s.colQty]}>כמות</Text>
            <Text style={[s.th, s.colStatus]}>סטטוס</Text>
          </View>
          {t.lines.map((l, i) => (
            <View style={s.tableRow} key={i}>
              <Text style={[s.td, s.colIdx]}>{i + 1}</Text>
              <Text style={[s.td, s.colItem]}>{l.itemType.name}</Text>
              <Text style={[s.td, s.colSerial]}>{l.serialUnit?.serialNumber ?? "—"}</Text>
              <Text style={[s.td, s.colQty]}>{l.quantity}</Text>
              <Text style={[s.td, s.colStatus]}>{l.status?.name ?? "—"}</Text>
            </View>
          ))}
          <View style={s.totalRow}>
            <Text style={[s.td, s.colIdx, s.bold]}></Text>
            <Text style={[s.td, s.colItem, s.bold]}>סה״כ</Text>
            <Text style={[s.td, s.colSerial]}>{t.lines.length} שורות</Text>
            <Text style={[s.td, s.colQty, s.bold]}>{totalQty}</Text>
            <Text style={[s.td, s.colStatus]}></Text>
          </View>
        </View>

        {t.fromHolder?.signatureClause && (
          <View style={s.clause}>
            <Text style={s.clauseTitle}>📝 הצהרת חייל / תניית חתימה</Text>
            <Text style={s.clauseText}>{t.fromHolder.signatureClause}</Text>
          </View>
        )}

        <View style={s.signatureRow}>
          <View style={s.signatureBox}>
            <Text style={s.sigLabel}>מוסר / יוצר התעודה</Text>
            <Text style={s.sigName}>{t.createdBy.fullName}</Text>
          </View>
          <View style={s.signatureBox}>
            <Text style={s.sigLabel}>מקבל / מאשר</Text>
            <Text style={s.sigName}>{approverName}</Text>
            {t.approvedAt && <Text style={s.sigLabel}>{t.approvedAt.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" })}</Text>}
            {sig?.signedAt && <Text style={s.sigLabel}>נחתם: {sig.signedAt.toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" })}</Text>}
          </View>
        </View>

        <Text style={s.footer}>מסמך זה הופק אוטומטית ממערכת ניהול המלאי הגדודי · {docNumber}</Text>
      </Page>
    </Document>
  );
}

export async function buildTransferPdfBuffer(transferData: TransferData): Promise<Buffer> {
  const buffer = await renderToBuffer(<TransferPDF t={transferData} />);
  return Buffer.from(buffer);
}

// ===================== אישור ניפוק נשק אישי (טופס 1008) — פורמט ארמון =====================
export type ArmoryPdfData = {
  docNumber: string;
  battalionName: string;
  logoData: string | null;
  motto: string | null;
  soldier: { fullName: string; personalNumber: string | null; companyName: string | null } | null;
  recipientName: string;
  issueDate: Date;
  endDate: Date | null;
  purpose: string | null;
  issuerName: string;
  issuerHolderName: string | null;
  declarationClauses: string[];
  warning: string;
  lines: { name: string; sku: string | null; quantity: number; serial: string | null }[];
  soldierSignature: string | null;
  signedAt: Date | null;
  approverName: string | null;
  approverTitle: string | null;
  approvedAt: Date | null;
  approverSignature: string | null;
};

const a = StyleSheet.create({
  page: { fontFamily: "Heebo", fontSize: 10, padding: 34, direction: "rtl" as never, color: "#181c17" },
  head: { borderBottomWidth: 2, borderBottomColor: "#38471f", paddingBottom: 12, marginBottom: 10, flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "flex-start" },
  unitBox: { flexDirection: "row-reverse", gap: 8, alignItems: "center" },
  logo: { width: 54, height: 54, objectFit: "contain" as never },
  uname: { fontSize: 16, fontWeight: 700, color: "#38471f" },
  umotto: { fontSize: 9, color: "#8a7440" },
  usys: { fontSize: 8, color: "#6b6f61", marginTop: 3 },
  meta: { textAlign: "left" as never, fontSize: 9, color: "#3b4038" },
  metaRow: { flexDirection: "row-reverse", justifyContent: "space-between", gap: 10 },
  titleWrap: { alignItems: "center", marginBottom: 12 },
  eyebrow: { fontSize: 8, color: "#8a7440", fontWeight: 700, letterSpacing: 1 },
  docTitle: { fontSize: 20, fontWeight: 700, marginTop: 3 },
  slabel: { fontSize: 9, fontWeight: 700, color: "#38471f", marginBottom: 5, marginTop: 4 },
  grid: { flexDirection: "row-reverse", flexWrap: "wrap", borderWidth: 1, borderColor: "#cdd0c0", marginBottom: 12 },
  cell: { width: "33.33%", padding: 6, borderColor: "#cdd0c0", borderLeftWidth: 1, borderBottomWidth: 1 },
  ck: { fontSize: 7.5, color: "#6b6f61" },
  cv: { fontSize: 11, fontWeight: 700, marginTop: 2 },
  declare: { borderWidth: 1, borderColor: "#9aa085", backgroundColor: "#eef0e4", padding: 10, marginBottom: 6 },
  clauseLine: { fontSize: 8.5, marginBottom: 3, lineHeight: 1.4 },
  warn: { borderWidth: 1, borderColor: "#7a2a1e", backgroundColor: "#f7ece7", color: "#7a2a1e", fontSize: 8.5, padding: 6, marginBottom: 12 },
  table: { marginBottom: 14 },
  tHead: { flexDirection: "row-reverse", backgroundColor: "#38471f" },
  tRow: { flexDirection: "row-reverse", borderColor: "#cdd0c0" },
  th: { padding: 5, fontSize: 8, fontWeight: 700, color: "#fff", borderWidth: 0.5, borderColor: "#38471f", textAlign: "right" as never },
  td: { padding: 5, fontSize: 8.5, borderWidth: 0.5, borderColor: "#cdd0c0", textAlign: "right" as never },
  cNum: { width: "7%", textAlign: "center" as never },
  cSku: { width: "20%" },
  cName: { width: "38%" },
  cQty: { width: "12%", textAlign: "center" as never },
  cSerial: { width: "23%" },
  sigs: { flexDirection: "row-reverse", gap: 10, marginTop: 4 },
  sig: { flex: 1, borderWidth: 1, borderColor: "#cdd0c0", borderTopWidth: 3, borderTopColor: "#38471f", padding: 8, minHeight: 90 },
  sigRole: { fontSize: 8.5, fontWeight: 700, color: "#38471f", marginBottom: 4 },
  sigF: { fontSize: 8, color: "#6b6f61", marginBottom: 2 },
  sigFb: { fontSize: 9.5, fontWeight: 700, color: "#181c17" },
  sigImg: { height: 40, objectFit: "contain" as never, marginTop: 4 },
  sigSlot: { marginTop: 6, height: 34, borderWidth: 1, borderColor: "#9aa085", borderStyle: "dashed" as never },
  foot: { fontSize: 7.5, color: "#6b6f61", textAlign: "center" as never, marginTop: 16, borderTopWidth: 1, borderTopColor: "#cdd0c0", paddingTop: 6 },
});

function fmtD(d: Date | null | undefined): string {
  return d ? new Date(d).toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" }) : "—";
}

function ArmoryIssuePDF({ d }: { d: ArmoryPdfData }) {
  return (
    <Document>
      <Page size="A4" style={a.page}>
        <View style={a.head}>
          <View style={a.unitBox}>
            {d.logoData && <Image src={d.logoData} style={a.logo} />}
            <View>
              <Text style={a.uname}>{d.battalionName}</Text>
              {d.motto && <Text style={a.umotto}>״{d.motto}״</Text>}
              <Text style={a.usys}>PALMY · מערכת ניהול מלאי</Text>
            </View>
          </View>
          <View style={a.meta}>
            <View style={a.metaRow}><Text>טופס</Text><Text style={{ fontWeight: 700 }}>1008</Text></View>
            <View style={a.metaRow}><Text>אסמכתא</Text><Text style={{ fontWeight: 700 }}>{d.docNumber}</Text></View>
            <View style={a.metaRow}><Text>תאריך</Text><Text style={{ fontWeight: 700 }}>{fmtD(d.issueDate)}</Text></View>
          </View>
        </View>

        <View style={a.titleWrap}>
          <Text style={a.eyebrow}>אישור שלישות · חטיבה 2</Text>
          <Text style={a.docTitle}>אישור לניפוק נשק אישי</Text>
        </View>

        <Text style={a.slabel}>פרטי מקבל הנשק</Text>
        <View style={a.grid}>
          <View style={a.cell}><Text style={a.ck}>שם מלא</Text><Text style={a.cv}>{d.recipientName}</Text></View>
          <View style={a.cell}><Text style={a.ck}>מספר אישי (מ.א.)</Text><Text style={a.cv}>{d.soldier?.personalNumber ?? "—"}</Text></View>
          <View style={a.cell}><Text style={a.ck}>פלוגה</Text><Text style={a.cv}>{d.soldier?.companyName ?? "—"}</Text></View>
          <View style={a.cell}><Text style={a.ck}>מתאריך</Text><Text style={a.cv}>{fmtD(d.issueDate)}</Text></View>
          <View style={a.cell}><Text style={a.ck}>עד תאריך (סיום תעסוקה)</Text><Text style={a.cv}>{fmtD(d.endDate)}</Text></View>
          <View style={a.cell}><Text style={a.ck}>לצורך</Text><Text style={a.cv}>{d.purpose ?? "תע\"מ"}</Text></View>
        </View>

        <Text style={a.slabel}>הצהרת החייל</Text>
        <View style={a.declare}>
          {d.declarationClauses.map((c, i) => <Text key={i} style={a.clauseLine}>{i + 1}. {c}</Text>)}
        </View>
        <Text style={a.warn}>⚠ {d.warning}</Text>

        <Text style={a.slabel}>פירוט הנשק והציוד המנופק</Text>
        <View style={a.table}>
          <View style={a.tHead}>
            <Text style={[a.th, a.cNum]}>#</Text>
            <Text style={[a.th, a.cSku]}>מק״ט</Text>
            <Text style={[a.th, a.cName]}>שם פריט</Text>
            <Text style={[a.th, a.cQty]}>כמות</Text>
            <Text style={[a.th, a.cSerial]}>מסט״ב</Text>
          </View>
          {d.lines.map((l, i) => (
            <View style={a.tRow} key={i}>
              <Text style={[a.td, a.cNum]}>{i + 1}</Text>
              <Text style={[a.td, a.cSku]}>{l.sku ?? "—"}</Text>
              <Text style={[a.td, a.cName]}>{l.name}</Text>
              <Text style={[a.td, a.cQty]}>{l.quantity}</Text>
              <Text style={[a.td, a.cSerial]}>{l.serial ?? "—"}</Text>
            </View>
          ))}
        </View>

        <Text style={a.slabel}>חתימות</Text>
        <View style={a.sigs}>
          <View style={a.sig}>
            <Text style={a.sigRole}>מנפק (מוסר)</Text>
            <Text style={a.sigF}>שם: <Text style={a.sigFb}>{d.issuerName}</Text></Text>
            {d.issuerHolderName && <Text style={a.sigF}>מחסן: <Text style={a.sigFb}>{d.issuerHolderName}</Text></Text>}
            <View style={a.sigSlot} />
          </View>
          <View style={a.sig}>
            <Text style={a.sigRole}>מקבל (החייל)</Text>
            <Text style={a.sigF}>שם: <Text style={a.sigFb}>{d.recipientName}</Text></Text>
            <Text style={a.sigF}>מ.א.: <Text style={a.sigFb}>{d.soldier?.personalNumber ?? "—"}</Text></Text>
            <Text style={a.sigF}>תאריך: <Text style={a.sigFb}>{fmtD(d.signedAt ?? d.issueDate)}</Text></Text>
            {d.soldierSignature ? <Image src={d.soldierSignature} style={a.sigImg} /> : <View style={a.sigSlot} />}
          </View>
          <View style={a.sig}>
            <Text style={a.sigRole}>מאשר הנשק</Text>
            <Text style={a.sigF}>שם: <Text style={a.sigFb}>{d.approverName ?? "________"}</Text></Text>
            <Text style={a.sigF}>תפקיד: <Text style={a.sigFb}>{d.approverTitle ?? "מג\"ד / סמג\"ד / קמב\"ץ"}</Text></Text>
            <Text style={a.sigF}>תאריך: <Text style={a.sigFb}>{d.approvedAt ? fmtD(d.approvedAt) : "____"}</Text></Text>
            {d.approverSignature ? <Image src={d.approverSignature} style={a.sigImg} /> : <View style={a.sigSlot} />}
          </View>
        </View>

        <Text style={a.foot}>מסמך זה הופק אוטומטית ממערכת PALMY · אסמכתא {d.docNumber}</Text>
      </Page>
    </Document>
  );
}

export async function buildArmoryIssuePdfBuffer(d: ArmoryPdfData): Promise<Buffer> {
  const buffer = await renderToBuffer(<ArmoryIssuePDF d={d} />);
  return Buffer.from(buffer);
}
