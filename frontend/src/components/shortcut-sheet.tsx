import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SHORTCUT_LIST } from '@/lib/shortcuts';

interface ShortcutSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ShortcutSheet({ open, onOpenChange }: ShortcutSheetProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Single-key shortcuts are disabled while you are typing in a field.</DialogDescription>
        </DialogHeader>
      <DialogBody>
        <ul className="divide-y divide-hairline">
          {SHORTCUT_LIST.map((s) => (
            <li key={s.label} className="flex items-center justify-between text-sm">
              <span className="text-fg-body">{s.label}</span>
              <span className="flex items-center gap-1">
                {s.keys.map((k, i) => (
                  <span key={i} className="flex items-center gap-1">
                    {i > 0 && <span className="text-[10px] text-fg-faint">then</span>}
                    <kbd className="rounded border border-border bg-subtle px-1.5 py-0.5 text-xs font-semibold text-fg-soft">{k}</kbd>
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
