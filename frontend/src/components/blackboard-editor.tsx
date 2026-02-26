import { useState, useCallback } from 'react';
import { Tldraw, Editor } from 'tldraw';
import 'tldraw/tldraw.css';
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
  const [editor, setEditor] = useState<Editor | null>(null);
  const [title, setTitle] = useState(initialTitle);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const handleMount = useCallback((editor: Editor) => {
    setEditor(editor);
    if (initialData) {
      editor.loadSnapshot(initialData);
    }
  }, [initialData]);

  const handleSave = async () => {
    if (!editor) return;

    setIsSaving(true);
    try {
      const snapshot = editor.getSnapshot();
      
      const payload = {
        title,
        data: snapshot,
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
    if (!editor || !taskId) return;

    setIsExporting(true);
    try {
      const shapeIds = Array.from(editor.getCurrentPageShapeIds());
      if (shapeIds.length === 0) {
        toast.error("Sketch is empty");
        return;
      }

      // In recent tldraw versions, the export logic can vary.
      // We'll try to get the SVG and convert it to a Blob.
      // If getSvg is not directly on editor, it might be on a utility or under a different name.
      // We'll use a type-safe fallback.
      
      let blob: Blob;
      
      if ((editor as any).exportToBlob) {
          blob = await (editor as any).exportToBlob({
              ids: shapeIds,
              format: 'png',
              opts: { background: true }
          });
      } else {
          // Fallback: Try to get SVG string if available
          const svg = await (editor as any).getSvg(shapeIds, {
              padding: 32,
              background: true,
          });
          
          if (svg instanceof SVGElement) {
              const svgString = new XMLSerializer().serializeToString(svg);
              blob = new Blob([svgString], { type: 'image/svg+xml' });
          } else {
              throw new Error("Could not generate export");
          }
      }

      const extension = blob.type === 'image/svg+xml' ? 'svg' : 'png';
      const file = new File([blob], `${title.replace(/\s+/g, '_')}.${extension}`, { type: blob.type });
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
        <Tldraw onMount={handleMount} />
      </div>
    </div>
  );
}
