import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SHORTCUT_LIST } from '@/lib/shortcuts';

interface ShortcutSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ShortcutSheet({ open, onOpenChange }: ShortcutSheetProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Single-key shortcuts are disabled while you are typing in a field.</DialogDescription>
        </DialogHeader>
        <ul className="divide-y divide-slate-100">
          {SHORTCUT_LIST.map((s) => (
            <li key={s.label} className="flex items-center justify-between py-2 text-sm">
              <span className="text-slate-700">{s.label}</span>
              <span className="flex items-center gap-1">
                {s.keys.map((k, i) => (
                  <span key={i} className="flex items-center gap-1">
                    {i > 0 && <span className="text-[10px] text-slate-400">then</span>}
                    <kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-xs font-semibold text-slate-600">{k}</kbd>
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
