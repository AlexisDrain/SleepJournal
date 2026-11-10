// Report: the report for the nights and columns chosen in Stats, to look at first and then save as a
// PDF (pages to print), an .html file (one long page for any browser) or Markdown (.md, plain text).
// Light for paper, or dark. Opened from Stats, which hands over what to show (reportDraft).
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { ReportPreview } from '@/components/ReportPreview';
import { Button, Chip, ErrorBox, Muted, styles } from '@/components/ui';
import { shareFile } from '@/db/files';
import { useThemeName } from '@/lib/displayMode';
import { CAN_MAKE_PDF, shareReport } from '@/lib/printReport';
import { reportFileName, reportName, type ReportLayout, type ReportTheme } from '@/lib/report';
import { getReportDraft, type ReportDraft } from '@/lib/reportDraft';
import { colors, space } from '@/lib/theme';
import { useWide } from '@/lib/useLayout';

type Format = 'pdf' | 'html' | 'md';

export default function ReportScreen() {
  useThemeName(); // redraw when the display changes (dark / light)
  const wide = useWide();
  const [draft, setDraft] = useState<ReportDraft | null>(getReportDraft);
  const [theme, setTheme] = useState<ReportTheme>('light');
  const [busy, setBusy] = useState<Format | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Each time it's opened: the nights and columns Stats has now.
  useFocusEffect(useCallback(() => { setDraft(getReportDraft()); setError(null); }, []));
  const preview = useMemo(() => draft?.html('screen', theme) ?? '', [draft, theme]);

  const save = (format: Format) => async () => {
    if (!draft) return;
    setBusy(format);
    setError(null);
    try {
      const layout: ReportLayout = format === 'pdf' ? 'print' : 'screen';
      if (format === 'pdf') await shareReport(draft.html(layout, theme), reportName());
      else if (format === 'html') await shareFile(reportFileName('screen'), draft.html(layout, theme), 'text/html', 'public.html');
      else await shareFile(`${reportName()}.md`, draft.markdown(), 'text/markdown', 'net.daringfireball.markdown');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (!draft) {
    return (
      <View style={[styles.screen, { padding: space.lg, gap: space.md }]}>
        <Muted>Open the report from Stats: it shows the nights and columns chosen there.</Muted>
        <Button title="Go to Stats" onPress={() => router.navigate('/stats')} />
      </View>
    );
  }

  // All three the same color: they're the same kind of button.
  const download = (format: Format, title: string) => (
    <View key={format} style={wide ? { width: 120 } : { flexGrow: 1, flexBasis: 60 }}>
      <Button title={title} small busy={busy === format} disabled={busy !== null && busy !== format} onPress={save(format)} />
    </View>
  );
  return (
    <View style={[styles.screen, { padding: space.lg, gap: space.md }]}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm }}>
        <Text style={[styles.cardTitle, { marginRight: space.sm }]}>Look</Text>
        <Chip label="☀ Light" selected={theme === 'light'} onPress={() => setTheme('light')} />
        <Chip label="☾ Dark" selected={theme === 'dark'} onPress={() => setTheme('dark')} />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm }}>
        <Text style={[styles.cardTitle, { marginRight: space.sm }]}>Download</Text>
        {CAN_MAKE_PDF && download('pdf', '.pdf')}
        {download('html', '.html')}
        {download('md', '.md')}
      </View>
      <Muted>
        {CAN_MAKE_PDF ? 'PDF: pages to print. ' : ''}HTML: one long page for any browser, as below. Markdown: plain text with a
        table, without the colors or the chart. Dreams stay out.
      </Muted>
      {error && <ErrorBox message={error} />}
      <View style={{ flex: 1, minHeight: 300, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: colors.cardBorder }}>
        <ReportPreview html={preview} />
      </View>
    </View>
  );
}
