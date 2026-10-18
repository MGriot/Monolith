import { useSyncExternalStore } from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { getConfirmRequest, settleConfirm, subscribeConfirm } from '@/lib/confirm';

/** Renders the dialog requested through confirmDialog(). Mount once near the root. */
export function ConfirmHost() {
  const request = useSyncExternalStore(subscribeConfirm, getConfirmRequest);
  const danger = request?.tone === 'danger';

  return (
    <Dialog open={!!request} onOpenChange={(open) => { if (!open) settleConfirm(false); }}>
      <DialogContent size="sm" hideClose>
        {request && (
          <>
            <DialogHeader className="border-b-0 pb-2">
              <div className="flex items-start gap-3">
                {danger && (
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger">
                    <AlertTriangle className="h-4 w-4" />
                  </div>
                )}
                <div className="space-y-1">
                  <DialogTitle>{request.title}</DialogTitle>
                  <DialogDescription className={request.description ? undefined : 'sr-only'}>
                    {request.description || request.title}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
            <DialogFooter className="border-t-0 bg-transparent pt-2">
              <Button variant="ghost" onClick={() => settleConfirm(false)}>
                {request.cancelLabel || 'Cancel'}
              </Button>
              <Button
                autoFocus
                variant={danger ? 'destructive' : 'default'}
                onClick={() => settleConfirm(true)}
              >
                {request.confirmLabel || 'Confirm'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
