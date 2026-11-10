// Web: the report shown in a frame, just as the .html file will look. The frame has no scripts and
// no way to reach the app (sandbox), and the report has none of its own anyway.
export function ReportPreview({ html }: { html: string }) {
  return (
    <iframe title="Report preview" srcDoc={html} sandbox=""
      style={{ flex: 1, width: '100%', height: '100%', border: 0, borderRadius: 12, background: 'transparent' }} />
  );
}
