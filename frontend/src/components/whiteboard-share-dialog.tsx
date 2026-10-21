import { Copy, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ProjectMembersCard } from '@/components/project-members';
import { ROLE_LABELS, isProjectRole } from '@/lib/roles';
import type { CollabPeer } from '@/lib/whiteboard-collab';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  whiteboardId?: string;
  peers: CollabPeer[];
  selfId?: string;
  canManage: boolean;
}

/**
 * Who can work on this sketch: everyone in the project (viewers watch, editors draw), live presence,
 * and, for project admins, adding teammates or changing their role right here.
 */
export function WhiteboardShareDialog({ open, onOpenChange, projectId, whiteboardId, peers, selfId, canManage }: Props) {
  const link = whiteboardId ? `${window.location.origin}/projects/${projectId}/whiteboards/${whiteboardId}` : '';
  const people = Array.from(new Map(peers.map((p) => [p.user_id, p])).values());

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success('Link copied');
    } catch {
      toast.error('Copy failed — select the link and copy it manually');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Share sketch</DialogTitle>
          <DialogDescription>
            Everyone in this project can open the sketch. Editors and admins draw together in real time; viewers follow along.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-5">
          {whiteboardId ? (
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="wb-share-link">Link for project members</label>
              <div className="flex gap-2">
                <Input id="wb-share-link" readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="h-9 font-mono text-xs" />
                <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5" onClick={copy}><Copy className="h-3.5 w-3.5" /> Copy</Button>
              </div>
            </div>
          ) : (
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><Link2 className="h-4 w-4" /> Save the sketch once to get a link and start live editing.</p>
          )}

          <div className="space-y-2" data-testid="whiteboard-online">
            <h3 className="text-sm font-medium">Here now ({people.length})</h3>
            {people.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nobody is connected.</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {people.map((p) => (
                  <li key={p.user_id} className="inline-flex items-center gap-2 rounded-full border border-hairline py-1 pl-1 pr-3 text-sm">
                    <span className="h-5 w-5 rounded-full border-2" style={{ background: p.color.background, borderColor: p.color.stroke }} aria-hidden />
                    {p.name}{peers.some((x) => x.id === selfId && x.user_id === p.user_id) && <span className="text-muted-foreground">(you)</span>}
                    <span className="text-xs text-muted-foreground">{isProjectRole(p.role) ? ROLE_LABELS[p.role] : p.role}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <ProjectMembersCard projectId={projectId} canManage={canManage} />
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
