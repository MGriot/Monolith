import { useState, useEffect, useMemo } from 'react';
import {
  Excalidraw,
  exportToBlob,
  restore,
  WelcomeScreen,
  LiveCollaborationTrigger
} from '@excalidraw/excalidraw';
import { Button } from '@/components/ui/button';
import { Save, Loader2, MessageSquarePlus, AlertTriangle, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';

// Import Excalidraw styles - critical for correct UI rendering
import "@excalidraw/excalidraw/index.css";

interface WhiteboardEditorProps {
  id?: string;
  projectId: string;
  taskId?: string;
  initialData?: any;
  title?: string;
  onSave?: (id: string) => void;
  onClose?: () => void;
}

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
  const [excalidrawAPI, setExcalidrawAPI] = useState<any>(null);
  const [title, setTitle] = useState(initialTitle);
  const [id, setId] = useState<string | undefined>(initialId);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isCollaborating, setIsCollaborating] = useState(false);

  // Sync basic state if props change
  useEffect(() => {
    setTitle(initialTitle);
    setId(initialId);
  }, [initialTitle, initialId]);

  // Check if the data is from the old tldraw engine
  const isLegacyData = useMemo(() => {
    if (!initialData) return false;
    // Tldraw data has 'document' or 'store', Excalidraw has 'elements'
    return !initialData.elements && (initialData.document || initialData.store || initialData.schema);
  }, [initialData]);

  // Process and restore data for Excalidraw
  const processedData = useMemo(() => {
    if (!initialData || isLegacyData) return null;

    // Ensure we have at least an empty elements array if initialData exists but is empty
    const elements = initialData.elements || [];
    // Omit initialData.appState to prevent restoring problematic internal state that causes blank canvases
    const files = initialData.files || {};

    try {
      return restore(
        {
          elements,
          appState: {
            isLoading: false
          },
          files,
        },
        null,
        null
      );
    } catch (e) {
      console.error("Failed to restore elements:", e);
      return null;
    }
  }, [initialData, isLegacyData]);

  // Imperative update when API is ready or data changes
  useEffect(() => {
    if (!excalidrawAPI || !processedData) return;

    // Slight delay to ensure the canvas has calculated its dimensions
    const timer = setTimeout(() => {
      try {
        // Force recalculate the canvas bounds mapping because of surrounding Flex layouts
        excalidrawAPI.refresh();
        excalidrawAPI.updateScene({
          elements: processedData.elements,
          appState: { scrollToContent: true },
          files: processedData.files,
          commitToHistory: false
        });
      } catch (err) {
        console.error("Error updating scene:", err);
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [excalidrawAPI, processedData, id]);

  const generatePreview = async () => {
    if (!excalidrawAPI) return null;
    try {
      const elements = excalidrawAPI.getSceneElements();
      if (!elements || elements.length === 0) return null;

      const blob = await exportToBlob({
        elements,
        appState: {
          ...excalidrawAPI.getAppState(),
          exportWithBackground: true,
        },
        files: excalidrawAPI.getFiles(),
        mimeType: "image/png",
      });

      return new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      console.error("Failed to generate preview:", e);
      return null;
    }
  };

  const handleSave = async () => {
    if (!excalidrawAPI) return;

    setIsSaving(true);
    try {
      const elements = excalidrawAPI.getSceneElements();
      const files = excalidrawAPI.getFiles();

      const preview_image = await generatePreview();

      const payload = {
        title,
        data: {
          type: "excalidraw",
          version: 2,
          source: window.location.origin,
          elements,
          files
        },
        preview_image,
        project_id: projectId,
        task_id: taskId || null,
      };

      let response;
      if (id) {
        response = await api.put(`/whiteboards/${id}`, payload);
        toast.success("Sketch updated");
      } else {
        response = await api.post('/whiteboards/', payload);
        toast.success("Sketch saved");
        setId(response.data.id);
      }

      queryClient.invalidateQueries({ queryKey: ['whiteboards', projectId] });
      if (taskId) queryClient.invalidateQueries({ queryKey: ['whiteboards', taskId] });

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
        appState: {
          ...excalidrawAPI.getAppState(),
          exportWithBackground: true,
        },
        files: excalidrawAPI.getFiles(),
        mimeType: "image/png",
      });

      const file = new File([blob], `${title.replace(/\s+/g, '_')}.png`, { type: 'image/png' });
      const formData = new FormData();
      formData.append("file", file);

      await api.post(`/tasks/${taskId}/attachments`, formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });

      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.success("Attached to task");
    } catch (error) {
      console.error("Failed to export:", error);
      toast.error("Failed to export sketch");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
      <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
        <div className="flex items-center gap-4 flex-1">
          {onClose && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2 bg-white border-slate-200 hover:bg-slate-100 mr-2"
              onClick={onClose}
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </Button>
          )}
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="bg-transparent border-none font-bold text-slate-700 focus:outline-none focus:ring-0 text-lg w-full max-w-md"
            placeholder="Sketch Title"
          />
          {isLegacyData && (
            <div className="flex items-center gap-2 text-amber-600 bg-amber-50 px-3 py-1 rounded-full border border-amber-100 text-xs font-medium">
              <AlertTriangle className="w-3.5 h-3.5" />
              Legacy Format: Drawing may be lost
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {taskId && (
            <Button variant="outline" size="sm" onClick={handleExportToTask} disabled={isExporting} className="gap-2">
              {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquarePlus className="w-4 h-4" />}
              Export to Task
            </Button>
          )}
          <Button onClick={handleSave} disabled={isSaving} className="gap-2">
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {id ? "Update" : "Save"}
          </Button>
        </div>
      </div>
      <div className="flex-1 relative w-full h-full min-h-0 min-w-0 overflow-hidden">
        <Excalidraw
          key={initialId || 'new'}
          excalidrawAPI={(api) => setExcalidrawAPI(api)}
          initialData={processedData || undefined}
          theme="light"
          UIOptions={{
            canvasActions: {
              loadScene: false,
              saveToActiveFile: false,
              export: false,
              saveAsImage: false,
            },
          }}
          renderTopRightUI={() => (
            <LiveCollaborationTrigger
              isCollaborating={isCollaborating}
              onSelect={() => {
                const newCollabState = !isCollaborating;
                setIsCollaborating(newCollabState);

                if (newCollabState && excalidrawAPI) {
                  // Simulate some collaborators for visual feedback
                  const collaborators = new Map();
                  collaborators.set("user1", {
                    username: "Matteo (You)",
                    color: { background: "#4dabf7", stroke: "#1971c2" }
                  });
                  collaborators.set("user2", {
                    username: "Antigravity",
                    color: { background: "#ff922b", stroke: "#d9480f" }
                  });

                  excalidrawAPI.updateScene({ collaborators });
                  toast.info("Collaboration mode activated (Visual Demo)");
                } else if (excalidrawAPI) {
                  excalidrawAPI.updateScene({ collaborators: new Map() });
                }
              }}
            />
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
    </div>
  );
}
