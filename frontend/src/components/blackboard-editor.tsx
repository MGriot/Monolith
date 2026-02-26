import { useState, useMemo } from 'react';
import { Excalidraw, exportToBlob } from '@excalidraw/excalidraw';
import { Button } from '@/components/ui/button';
import { Save, Loader2, MessageSquarePlus } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';

interface BlackboardEditorProps {
  projectId: string;
  taskId?: string;
  initialData?: any;
  title?: string;
  onSave?: (id: string) => void;
}

export default function BlackboardEditor({ 
  projectId, 
  taskId, 
  initialData, 
  title: initialTitle = "New Sketch",
  onSave 
}: BlackboardEditorProps) {
  const queryClient = useQueryClient();
  const [excalidrawAPI, setExcalidrawAPI] = useState<any>(null);
  const [title, setTitle] = useState(initialTitle);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Process initial data - handle potential tldraw compatibility issues
  const processedInitialData = useMemo(() => {
    if (!initialData) return null;
    // Basic check: Excalidraw data usually has 'elements' array
    if (initialData.elements && Array.isArray(initialData.elements)) {
        return initialData;
    }
    // If it's old tldraw data or unknown format, start fresh to avoid crashes
    console.warn("Incompatible sketch data format detected. Starting fresh.");
    return null;
  }, [initialData]);

  const handleSave = async () => {
    if (!excalidrawAPI) return;

    setIsSaving(true);
    try {
      const elements = excalidrawAPI.getSceneElements();
      const appState = excalidrawAPI.getAppState();
      const files = excalidrawAPI.getFiles();
      
      const payload = {
        title,
        data: { elements, appState, files },
        project_id: projectId,
        task_id: taskId || null,
      };

      const response = await api.post('/blackboards/', payload);
      toast.success("Sketch saved successfully");
      if (onSave) onSave(response.data.id);
    } catch (error) {
      console.error("Failed to save sketch:", error);
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
      toast.success("Sketch exported and attached to task");
    } catch (error) {
      console.error("Failed to export sketch:", error);
      toast.error("Failed to export sketch");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
      <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
        <div className="flex items-center gap-4 flex-1">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="bg-transparent border-none font-bold text-slate-700 focus:outline-none focus:ring-0 text-lg w-full max-w-md"
            placeholder="Sketch Title"
          />
        </div>
        <div className="flex items-center gap-2">
          {taskId && (
            <Button variant="outline" size="sm" onClick={handleExportToTask} disabled={isExporting} className="gap-2 border-blue-200 hover:bg-blue-50 text-blue-600">
              {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquarePlus className="w-4 h-4" />}
              Export to Task
            </Button>
          )}
          <Button onClick={handleSave} disabled={isSaving} className="gap-2">
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Sketch
          </Button>
        </div>
      </div>
      <div className="flex-1 relative">
        <Excalidraw 
            excalidrawAPI={(api) => setExcalidrawAPI(api)}
            initialData={processedInitialData}
            theme="light"
            UIOptions={{
                canvasActions: {
                    loadScene: false,
                    saveToActiveFile: false,
                    export: false,
                    saveAsImage: false,
                },
            }}
        />
      </div>
    </div>
  );
}
