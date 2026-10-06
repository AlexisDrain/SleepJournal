// Web version of TimePicker: the browser's own time input.
import { colors } from '@/lib/theme';

const pad = (n: number) => String(n).padStart(2, '0');

export function TimePicker({ value, onChange, accent }: { value: Date; onChange: (d: Date) => void; accent: string }) {
  return (
    <input
      type="time"
      step={300}
      value={`${pad(value.getHours())}:${pad(value.getMinutes())}`}
      onChange={(e) => {
        const [h, m] = e.target.value.split(':').map(Number);
        if (Number.isNaN(h) || Number.isNaN(m)) return;
        const d = new Date(value);
        d.setHours(h, m, 0, 0);
        onChange(d);
      }}
      style={{
        background: colors.bg, color: accent, border: `1px solid ${colors.cardBorder}`, borderRadius: 8,
        padding: '6px 8px', fontSize: 16, fontWeight: 600, colorScheme: 'dark', fontFamily: 'inherit',
      }}
    />
  );
}
