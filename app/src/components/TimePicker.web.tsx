// Web version of TimePicker: the time drawn by the app (its font, its 12/24-hour setting), with the
// browser's own time input invisible on top of it, so a click or tap still opens the browser's picker.
// The input alone looks different in every browser: Edge on Windows takes the system's time format,
// which can add seconds ("10:40:00 PM"), in a font of its own.
import { formatTime, useHour24 } from '@/lib/clockFormat';
import { colors } from '@/lib/theme';

const pad = (n: number) => String(n).padStart(2, '0');
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export function TimePicker({ value, onChange, accent }: { value: Date; onChange: (d: Date) => void; accent: string }) {
  useHour24(); // redraw when the clock style changes
  const ok = !Number.isNaN(value.getTime());
  return (
    <div style={{
      position: 'relative', display: 'inline-block', background: colors.bg, color: accent,
      border: `1px solid ${colors.cardBorder}`, borderRadius: 8, padding: '6px 12px',
      fontSize: 16, fontWeight: 600, fontFamily: FONT, lineHeight: '22px', whiteSpace: 'nowrap',
    }}>
      {ok ? formatTime(value.getHours(), value.getMinutes()) : '—'}
      <input
        type="time"
        step={300}
        aria-label="Time"
        value={ok ? `${pad(value.getHours())}:${pad(value.getMinutes())}` : ''}
        onClick={(e) => { try { e.currentTarget.showPicker?.(); } catch { /* the browser opens it itself */ } }}
        onChange={(e) => {
          const t = e.target.value.match(/^(\d{2}):(\d{2})/); // half typed or cleared: keep the time there was
          if (!t) return;
          const h = Number(t[1]), m = Number(t[2]);
          const d = ok ? new Date(value) : new Date();
          d.setHours(h, m, 0, 0);
          onChange(d);
        }}
        style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer',
          border: 0, padding: 0, margin: 0, colorScheme: 'dark', fontSize: 16,
        }}
      />
    </div>
  );
}
