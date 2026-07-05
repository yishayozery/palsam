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
  const fromName = t.fromHolder?.name ?? "חטיבה (גורם חיצוני)";
  const toName = t.toSoldier?.fullName ?? t.toHolder?.name ?? "חטיבה (גורם חיצוני)";
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
            {t.toSoldier?.personalNumber && <Text style={s.gridLabel}> (מ.א. {t.toSoldier.personalNumber})</Text>}
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
