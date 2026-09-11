import "server-only";
import React from "react";
import { Document, Page, Text, View, Link, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { formatLocalDate, type YMD } from "@/lib/dates";

const styles = StyleSheet.create({
  page: { padding: 44, fontSize: 10.5, fontFamily: "Helvetica", color: "#0f2440", lineHeight: 1.5 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 },
  club: { fontSize: 14, fontFamily: "Helvetica-Bold" },
  title: { fontSize: 18, fontFamily: "Helvetica-Bold", marginTop: 4 },
  meta: { fontSize: 8.5, color: "#5b6472", textAlign: "right" },
  h2: { fontSize: 12.5, fontFamily: "Helvetica-Bold", marginTop: 16, marginBottom: 6, color: "#0f5c66" },
  para: { marginBottom: 8 },
  bold: { fontFamily: "Helvetica-Bold" },
  link: { color: "#0f2440", textDecoration: "underline" },
  listItem: { flexDirection: "row", marginBottom: 5, paddingLeft: 2 },
  bullet: { width: 16, fontFamily: "Helvetica-Bold" },
  itemText: { flex: 1 },
  codeBox: { marginTop: 4, marginBottom: 14, padding: 10, borderWidth: 1, borderColor: "#d96f22", borderRadius: 4, backgroundColor: "#fbe9db" },
  codeLabel: { fontSize: 8, textTransform: "uppercase", letterSpacing: 1, color: "#5b6472", marginBottom: 2 },
  codeValue: { fontSize: 14, fontFamily: "Helvetica-Bold" },
  linksSection: { marginTop: 18, borderTopWidth: 1, borderColor: "#d9d4c8", paddingTop: 10 },
  footer: { position: "absolute", bottom: 32, left: 44, right: 44, fontSize: 8, color: "#5b6472", borderTopWidth: 0.5, borderColor: "#d9d4c8", paddingTop: 8 },
});

/** Parse `[label](url)` and `**bold**` into styled PDF Text spans. */
function inline(text: string, keyBase: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[1] && m[2]) {
      parts.push(
        <Link key={`${keyBase}-${k++}`} src={m[2]} style={styles.link}>{m[1]}</Link>,
      );
    } else if (m[3]) {
      parts.push(<Text key={`${keyBase}-${k++}`} style={styles.bold}>{m[3]}</Text>);
    }
    last = regex.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

/** Same markdown subset the web guide page renders: ## headings, numbered/bulleted lists, bold, links, paragraphs. */
function renderBody(md: string): React.ReactNode[] {
  const blocks = md.split(/\n\n+/);
  return blocks.map((block, i) => {
    const t = block.trim();
    if (!t) return null;
    if (t.startsWith("## ")) {
      return <Text key={i} style={styles.h2}>{t.slice(3)}</Text>;
    }
    if (/^\d+\. /m.test(t)) {
      const items = t.split(/\n(?=\d+\. )/).map((s) => s.replace(/^\d+\. /, ""));
      return (
        <View key={i} style={{ marginBottom: 8 }}>
          {items.map((item, j) => (
            <View key={j} style={styles.listItem} wrap={false}>
              <Text style={styles.bullet}>{j + 1}.</Text>
              <Text style={styles.itemText}>{inline(item, `${i}-${j}`)}</Text>
            </View>
          ))}
        </View>
      );
    }
    if (/^- /m.test(t)) {
      const items = t.split(/\n(?=- )/).map((s) => s.replace(/^- /, ""));
      return (
        <View key={i} style={{ marginBottom: 8 }}>
          {items.map((item, j) => (
            <View key={j} style={styles.listItem} wrap={false}>
              <Text style={styles.bullet}>{"\u2022"}</Text>
              <Text style={styles.itemText}>{inline(item, `${i}-${j}`)}</Text>
            </View>
          ))}
        </View>
      );
    }
    return <Text key={i} style={styles.para}>{inline(t, `${i}`)}</Text>;
  });
}

export interface GuidePdfData {
  clubName: string;
  title: string;
  bodyMarkdown: string;
  clubCode: string | null;
  lastVerifiedAt: YMD | null;
  links: { label: string; url: string }[];
}

function GuideDoc({ data }: { data: GuidePdfData }) {
  const body = data.clubCode ? data.bodyMarkdown.replaceAll("{{club_code}}", data.clubCode) : data.bodyMarkdown;

  return (
    <Document title={data.title} author={data.clubName}>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.club}>{data.clubName}</Text>
            <Text style={styles.title}>{data.title}</Text>
          </View>
          {data.lastVerifiedAt && (
            <Text style={styles.meta}>Verified against the official site{"\n"}{formatLocalDate(data.lastVerifiedAt)}</Text>
          )}
        </View>

        {data.clubCode && (
          <View style={styles.codeBox}>
            <Text style={styles.codeLabel}>Club code</Text>
            <Text style={styles.codeValue}>{data.clubCode}</Text>
          </View>
        )}

        {renderBody(body)}

        {data.links.length > 0 && (
          <View style={styles.linksSection}>
            <Text style={[styles.codeLabel, { marginBottom: 6 }]}>Official links</Text>
            {data.links.map((l, i) => (
              <Text key={i} style={{ marginBottom: 4 }}>
                <Link src={l.url} style={styles.link}>{l.label}</Link>
              </Text>
            ))}
          </View>
        )}

        <View style={styles.footer} fixed>
          <Text>Fees and steps can change on the official site — this is a snapshot, not a live page.</Text>
          <Text style={{ marginTop: 3 }}>{data.clubName} · Generated {new Date().toISOString().slice(0, 10)}</Text>
        </View>
      </Page>
    </Document>
  );
}

export async function renderGuidePdf(data: GuidePdfData): Promise<Buffer> {
  return renderToBuffer(<GuideDoc data={data} />);
}
