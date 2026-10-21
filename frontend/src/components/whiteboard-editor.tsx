import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Excalidraw,
  exportToBlob,
  restore,
  reconcileElements,
  getSceneVersion,
  CaptureUpdateAction,
  WelcomeScreen,
  LiveCollaborationTrigger
} from '@excalidraw/excalidraw';
import { Button } from '@/components/ui/button';
import { Save, Loader2, MessageSquarePlus, AlertTriangle, ArrowLeft, Share2, Eye } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { canAdmin, canEdit } from '@/lib/roles';
import { WhiteboardCollab, type CollabPeer } from '@/lib/whiteboard-collab';
import { WhiteboardShareDialog } from '@/components/whiteboard-share-dialog';
import { cn } from '@/lib/utils';

// Import Excalidraw styles - critical for correct UI rendering
import "@excalidraw/excalidraw/index.css";
import { useTheme } from "@/hooks/use-theme";

interface WhiteboardEditorProps {
  id?: string;
  projectId: string;
  taskId?: string;
  /** The scene; fetched from the API when omitted for an existing board. */
  initialData?: any;
  title?: string;
  onSave?: (id: string) => void;
  onClose?: () => void;
}

const PREVIEW_IDLE_MS = 10000;

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });

export default function WhiteboardEditor({
  id: initialId,
  projectId,
  taskId,
  initialData,
  title: initialTitle = "New Sketch",
  onSave,
  onClose
}: WhiteboardEditorProps) {
  const queryClient = useQueryClient();
  const { resolved: theme } = useTheme();
  const [excalidrawAPI, setExcalidrawAPI] = useState<any>(null);
  const [title, setTitle] = useState(initialTitle);
  const [id, setId] = useState<string | undefined>(initialId);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [status, setStatus] = useState<'connecting' | 'live' | 'offline'>('offline');
  const [peers, setPeers] = useState<CollabPeer[]>([]);
  const [selfId, setSelfId] = useState<string | undefined>();
  const [leader, setLeader] = useState<string | null>(null);
  const [liveRole, setLiveRole] = useState<string | undefined>();
  const collabRef = useRef<WhiteboardCollab | null>(null);
  const collaboratorsRef = useRef(new Map<string, any>());
  const sceneVersionRef = useRef(0);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const framedRef = useRef(false);

  // Sync basic state if props change
  useEffect(() => {
    setTitle(initialTitle);
    setId(initialId);
  }, [initialTitle, initialId]);

  // The caller's project role decides edit vs. view-only (the API enforces it as well).
  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => (await api.get(`/projects/${projectId}`)).data,
    enabled: !!projectId,
  });
  // The room's view of your role wins: it is re-checked while you are connected.
  const role: string | undefined = liveRole ?? project?.my_role;
  const editable = role === undefined ? true : canEdit(role);

  // Lists do not carry scenes: load the board when the caller only knows its id.
  const { data: fetched } = useQuery({
    queryKey: ['whiteboard', initialId],
    queryFn: async () => (await api.get(`/whiteboards/${initialId}`)).data,
    enabled: !!initialId && initialData === undefined,
  });
  const sceneData = initialData ?? fetched?.data;
  useEffect(() => {
    if (fetched?.title && initialData === undefined) setTitle(fetched.title);
  }, [fetched?.title, initialData]);

  // Check if the data is from the old tldraw engine
  const isLegacyData = useMemo(() => {
    if (!sceneData) return false;
    // Tldraw data has 'document' or 'store', Excalidraw has 'elements'
    return !sceneData.elements && (sceneData.document || sceneData.store || sceneData.schema);
  }, [sceneData]);

  // Process and restore data for Excalidraw
  const processedData = useMemo(() => {
    if (!sceneData || isLegacyData) return null;
    try {
      // Omit the saved appState: restoring internal state can leave a blank canvas
      return restore({ elements: sceneData.elements || [], appState: { isLoading: false }, files: sceneData.files || {} }, null, null);
    } catch (e) {
      console.error("Failed to restore elements:", e);
      return null;
    }
  }, [sceneData, isLegacyData]);

  // Imperative update when API is ready or data changes
  useEffect(() => {
    if (!excalidrawAPI || !processedData) return;
    // Slight delay to ensure the canvas has calculated its dimensions
    const timer = setTimeout(() => {
      try {
        excalidrawAPI.refresh();
        excalidrawAPI.updateScene({
          elements: processedData.elements,
          appState: { scrollToContent: true },
          captureUpdate: CaptureUpdateAction.NEVER,
        });
        excalidrawAPI.addFiles(Object.values(processedData.files || {}));
      } catch (err) {
        console.error("Error updating scene:", err);
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [excalidrawAPI, processedData]);

  const pushCollaborators = useCallback(() => {
    excalidrawAPI?.updateScene({ collaborators: new Map(collaboratorsRef.current), captureUpdate: CaptureUpdateAction.NEVER });
  }, [excalidrawAPI]);

  // --- live room ------------------------------------------------------------------------------------------
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!id || !excalidrawAPI || !token) return;

    const applyPeers = (list: CollabPeer[], me?: string) => {
      setPeers(list);
      const next = new Map<string, any>();
      for (const p of list) {
        if (p.id === me) continue;
        const prev = collaboratorsRef.current.get(p.id);
        next.set(p.id, { ...prev, id: p.user_id, socketId: p.id, username: p.name, color: p.color });
      }
      collaboratorsRef.current = next;
      pushCollaborators();
    };
    let me: string | undefined;

    const collab = new WhiteboardCollab(id, token, {
      onStatus: setStatus,
      onInit: (msg) => {
        me = msg.self.id;
        setSelfId(me);
        setLiveRole(msg.role);
        setLeader(msg.leader);
        const local = excalidrawAPI.getSceneElementsIncludingDeleted();
        const merged = reconcileElements(local, msg.elements as any, excalidrawAPI.getAppState());
        excalidrawAPI.updateScene({ elements: merged, captureUpdate: CaptureUpdateAction.NEVER });
        excalidrawAPI.addFiles(Object.values(msg.files || {}));
        if (!framedRef.current && merged.length) {
          framedRef.current = true; // frame the drawing once, not on every reconnect
          excalidrawAPI.scrollToContent(undefined, { fitToContent: true, animate: false });
        }
        applyPeers(msg.peers, me);
        // anything drawn here that the room did not have yet (e.g. while offline) goes out now
        collab.sceneChanged(excalidrawAPI.getSceneElementsIncludingDeleted(), excalidrawAPI.getFiles());
      },
      onElements: (remote) => {
        const merged = reconcileElements(excalidrawAPI.getSceneElementsIncludingDeleted(), remote as any, excalidrawAPI.getAppState());
        excalidrawAPI.updateScene({ elements: merged, captureUpdate: CaptureUpdateAction.NEVER });
      },
      onReplace: (elements, files) => {
        excalidrawAPI.updateScene({ elements: restore({ elements: elements as any }, null, null).elements, captureUpdate: CaptureUpdateAction.NEVER });
        excalidrawAPI.addFiles(Object.values(files));
        toast.info('The sketch was updated from outside the editor');
      },
      onFiles: (files) => excalidrawAPI.addFiles(Object.values(files)),
      onPeers: (list, lead) => {
        setLeader(lead);
        applyPeers(list, me);
      },
      onPointer: (peerId, pointer, button) => {
        const prev = collaboratorsRef.current.get(peerId);
        if (!prev) return;
        collaboratorsRef.current.set(peerId, { ...prev, pointer, button });
        pushCollaborators();
      },
      onRole: (next) => {
        setLiveRole(next);
        toast.info(canEdit(next) ? 'You can edit this sketch now' : 'Your access changed: view only');
      },
      onError: (message) => toast.error(message),
    });
    collabRef.current = collab;
    collab.connect();
    return () => {
      collab.close();
      collabRef.current = null;
      collaboratorsRef.current = new Map();
      setPeers([]);
      setStatus('offline');
    };
  }, [id, excalidrawAPI, pushCollaborators]);

  const generatePreview = useCallback(async () => {
    if (!excalidrawAPI) return null;
    try {
      const elements = excalidrawAPI.getSceneElements();
      if (!elements || elements.length === 0) return null;
      const blob = await exportToBlob({
        elements,
        appState: { ...excalidrawAPI.getAppState(), exportBackground: true, exportWithDarkMode: false },
        files: excalidrawAPI.getFiles(),
        mimeType: "image/png",
        maxWidthOrHeight: 960,
      });
      return blobToDataUrl(blob);
    } catch (e) {
      console.error("Failed to generate preview:", e);
      return null;
    }
  }, [excalidrawAPI]);

  const isLeader = !!selfId && leader === selfId;

  const handleChange = useCallback((elements: readonly any[], _appState: any, files: Record<string, unknown>) => {
    const version = getSceneVersion(elements);
    if (version === sceneVersionRef.current) return;
    sceneVersionRef.current = version;
    if (editable) collabRef.current?.sceneChanged(elements as any, files);
    // The room saves the scene; one editor (the "leader") refreshes the shared preview once things settle.
    if (id && isLeader && editable) {
      if (previewTimer.current) clearTimeout(previewTimer.current);
      previewTimer.current = setTimeout(async () => {
        const preview = await generatePreview();
        if (!preview) return;
        try {
          await api.put(`/whiteboards/${id}/preview`, { preview_image: preview });
          queryClient.invalidateQueries({ queryKey: ['whiteboards'] });
        } catch {
          /* best effort: the next save retries */
        }
      }, PREVIEW_IDLE_MS);
    }
  }, [editable, id, isLeader, generatePreview, queryClient]);

  useEffect(() => () => { if (previewTimer.current) clearTimeout(previewTimer.current); }, []);

  const handleSave = async () => {
    if (!excalidrawAPI) return;

    setIsSaving(true);
    try {
      const elements = excalidrawAPI.getSceneElements();
      const files = excalidrawAPI.getFiles();
      const preview_image = await generatePreview();

      const payload = {
        title,
        data: { type: "excalidraw", version: 2, source: window.location.origin, elements, files },
        preview_image: preview_image || undefined,
        project_id: projectId,
        task_id: taskId || null,
      };

      let response;
      if (id) {
        response = await api.put(`/whiteboards/${id}`, payload);
        toast.success("Sketch updated");
      } else {
        response = await api.post('/whiteboards/', payload);
        toast.success("Sketch saved — live editing is on");
        setId(response.data.id);
      }

      queryClient.invalidateQueries({ queryKey: ['whiteboards'] });
      if (onSave) onSave(response.data.id);
    } catch (error) {
      console.error("Failed to save:", error);
      toast.error("Failed to save sketch");
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportToTask = async () => {
    if (!excalidrawAPI || !taskId) return;

    setIsExporting(true);
    try {
      const elements = excalidrawAPI.getSceneElements();
      if (!elements || elements.length === 0) {
        toast.error("Sketch is empty");
        return;
      }
      const blob = await exportToBlob({
        elements,
        appState: { ...excalidrawAPI.getAppState(), exportBackground: true },
        files: excalidrawAPI.getFiles(),
        mimeType: "image/png",
      });
      const file = new File([blob], `${title.replace(/\s+/g, '_')}.png`, { type: 'image/png' });
      const formData = new FormData();
      formData.append("file", file);
      await api.post(`/tasks/${taskId}/attachments`, formData, { headers: { "Content-Type": "multipart/form-data" } });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.success("Attached to task");
    } catch (error) {
      console.error("Failed to export:", error);
      toast.error("Failed to export sketch");
    } finally {
      setIsExporting(false);
    }
  };

  const others = peers.filter((p) => p.id !== selfId).length;

  return (
    <div className="flex flex-col h-full bg-background rounded-xl border border-border overflow-hidden shadow-sm">
      <div className="p-4 border-b border-hairline flex items-center justify-between gap-3 bg-subtle/50">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          {onClose && (
            <Button variant="outline" size="sm" className="gap-2 bg-background border-border hover:bg-muted mr-2" onClick={onClose}>
              <ArrowLeft className="w-4 h-4" /> Back
            </Button>
          )}
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            readOnly={!editable}
            className="bg-transparent border-none font-bold text-fg-body focus:outline-none focus:ring-0 text-lg w-full max-w-md"
            placeholder="Sketch Title"
            aria-label="Sketch title"
          />
          {isLegacyData && (
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 px-3 py-1 rounded-full border border-amber-100 dark:border-amber-500/20 text-xs font-medium">
              <AlertTriangle className="w-3.5 h-3.5" />
              Legacy Format: Drawing may be lost
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {id && (
            <span
              data-testid="collab-status"
              className={cn(
                "hidden sm:inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium",
                status === 'live' ? 'bg-success-soft text-success' : status === 'connecting' ? 'bg-muted text-muted-foreground' : 'bg-warning-soft text-warning',
              )}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", status === 'live' ? 'bg-success' : status === 'connecting' ? 'bg-muted-foreground animate-pulse' : 'bg-warning')} />
              {status === 'live' ? (others ? `Live · ${others} other${others > 1 ? 's' : ''}` : 'Live') : status === 'connecting' ? 'Connecting…' : 'Offline'}
            </span>
          )}
          {!editable && (
            <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-muted px-2.5 text-xs font-medium text-muted-foreground"><Eye className="h-3.5 w-3.5" /> View only</span>
          )}
          <Button variant="outline" size="sm" onClick={() => setShareOpen(true)} className="gap-2">
            <Share2 className="w-4 h-4" /> Share
          </Button>
          {taskId && (
            <Button variant="outline" size="sm" onClick={handleExportToTask} disabled={isExporting} className="gap-2">
              {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquarePlus className="w-4 h-4" />}
              Export to Task
            </Button>
          )}
          {editable && (
            <Button onClick={handleSave} disabled={isSaving} className="gap-2">
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {id ? "Save" : "Create"}
            </Button>
          )}
        </div>
      </div>
      <div className="flex-1 relative w-full h-full min-h-0 min-w-0 overflow-hidden">
        <Excalidraw
          key={initialId || 'new'}
          excalidrawAPI={(api) => setExcalidrawAPI(api)}
          initialData={processedData || undefined}
          theme={theme}
          viewModeEnabled={!editable}
          isCollaborating={status === 'live'}
          onChange={handleChange as any}
          onPointerUpdate={({ pointer, button }) => collabRef.current?.pointerMoved(pointer, button)}
          UIOptions={{
            canvasActions: {
              loadScene: false,
              saveToActiveFile: false,
              export: false,
              saveAsImage: false,
            },
          }}
          renderTopRightUI={() => (
            <LiveCollaborationTrigger isCollaborating={status === 'live'} onSelect={() => setShareOpen(true)} />
          )}
        >
          <WelcomeScreen>
            <WelcomeScreen.Hints.MenuHint />
            <WelcomeScreen.Hints.ToolbarHint />
            <WelcomeScreen.Hints.HelpHint />
            <WelcomeScreen.Center>
              <WelcomeScreen.Center.Logo />
              <WelcomeScreen.Center.Heading>
                {title || "Monolith Whiteboard"}
              </WelcomeScreen.Center.Heading>
              <WelcomeScreen.Center.Menu />
            </WelcomeScreen.Center>
          </WelcomeScreen>
        </Excalidraw>
      </div>
      <WhiteboardShareDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        projectId={projectId}
        whiteboardId={id}
        peers={peers}
        selfId={selfId}
        canManage={canAdmin(role)}
      />
    </div>
  );
}
