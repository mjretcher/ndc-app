import "server-only";
import React from "react";
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { formatCents } from "@/lib/money";
import { formatLocalDate, monthLabel, type YMD } from "@/lib/dates";

const styles = StyleSheet.create({
  page: { padding: 44, fontSize: 10, fontFamily: "Helvetica", color: "#0f2440" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 24 },
  club: { fontSize: 18, fontFamily: "Helvetica-Bold" },
  invoiceTag: { fontSize: 14, fontFamily: "Helvetica-Bold", textAlign: "right" },
  meta: { fontSize: 9, color: "#5b6472", marginTop: 2, textAlign: "right" },
  section: { marginBottom: 16 },
  label: { fontSize: 8, color: "#5b6472", textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 },
  bold: { fontFamily: "Helvetica-Bold" },
  table: { borderTopWidth: 1, borderColor: "#0f2440", marginTop: 8 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderColor: "#d9d4c8", paddingVertical: 6 },
  headRow: { flexDirection: "row", borderBottomWidth: 1, borderColor: "#0f2440", paddingVertical: 5 },
  colDesc: { flex: 1, paddingRight: 8 },
  colAmt: { width: 80, textAlign: "right" },
  totals: { marginTop: 10, alignItems: "flex-end" },
  totalRow: { flexDirection: "row", width: 220, justifyContent: "space-between", paddingVertical: 2 },
  grand: { borderTopWidth: 1, borderColor: "#0f2440", marginTop: 4, paddingTop: 5, fontFamily: "Helvetica-Bold", fontSize: 12 },
  footer: { position: "absolute", bottom: 36, left: 44, right: 44, fontSize: 8, color: "#5b6472", borderTopWidth: 0.5, borderColor: "#d9d4c8", paddingTop: 8 },
});

export interface InvoicePdfData {
  clubName: string;
  contactEmail: string | null;
  invoiceNumber: string;
  status: string;
  cycleYear: number;
  cycleMonth: number;
  issueDate: YMD | null;
  dueDate: YMD | null;
  familyName: string;
  familyAddress: string[];
  lines: { description: string; amountCents: number; diverName: string | null }[];
  subtotalCents: number;
  discountCents: number;
  creditAppliedCents: number;
  totalCents: number;
  terms: string | null;
}

function InvoiceDoc({ data }: { data: InvoicePdfData }) {
  return (
    <Document title={`Invoice ${data.invoiceNumber}`} author={data.clubName}>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.club}>{data.clubName}</Text>
            {data.contactEmail && <Text style={{ color: "#5b6472", marginTop: 2 }}>{data.contactEmail}</Text>}
          </View>
          <View>
            <Text style={styles.invoiceTag}>INVOICE {data.invoiceNumber}</Text>
            <Text style={styles.meta}>{monthLabel(data.cycleYear, data.cycleMonth)}</Text>
            {data.issueDate && <Text style={styles.meta}>Issued {formatLocalDate(data.issueDate)}</Text>}
            {data.dueDate && <Text style={styles.meta}>Due {formatLocalDate(data.dueDate)}</Text>}
            {data.status === "void" && <Text style={[styles.meta, { color: "#b3372f", fontFamily: "Helvetica-Bold" }]}>VOID</Text>}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Bill to</Text>
          <Text style={styles.bold}>{data.familyName}</Text>
          {data.familyAddress.map((l, i) => <Text key={i}>{l}</Text>)}
        </View>

        <View style={styles.table}>
          <View style={styles.headRow}>
            <Text style={[styles.colDesc, styles.bold]}>Description</Text>
            <Text style={[styles.colAmt, styles.bold]}>Amount</Text>
          </View>
          {data.lines.map((l, i) => (
            <View key={i} style={styles.row} wrap={false}>
              <Text style={styles.colDesc}>{l.description}</Text>
              <Text style={styles.colAmt}>{formatCents(l.amountCents)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totals}>
          <View style={styles.totalRow}>
            <Text>Subtotal</Text>
            <Text>{formatCents(data.subtotalCents)}</Text>
          </View>
          {data.discountCents > 0 && (
            <View style={styles.totalRow}>
              <Text>Discounts</Text>
              <Text>-{formatCents(data.discountCents)}</Text>
            </View>
          )}
          {data.creditAppliedCents > 0 && (
            <View style={styles.totalRow}>
              <Text>Account credit applied</Text>
              <Text>-{formatCents(data.creditAppliedCents)}</Text>
            </View>
          )}
          <View style={[styles.totalRow, styles.grand]}>
            <Text>Total due</Text>
            <Text>{formatCents(data.totalCents)}</Text>
          </View>
        </View>

        <View style={styles.footer} fixed>
          <Text>{data.terms ?? "Please contact the club with any billing questions."}</Text>
          <Text style={{ marginTop: 3 }}>
            {data.clubName} · Generated {new Date().toISOString().slice(0, 10)}
          </Text>
        </View>
      </Page>
    </Document>
  );
}

export async function renderInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  return renderToBuffer(<InvoiceDoc data={data} />);
}
