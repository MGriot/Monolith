import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { 
  Paperclip, 
  X, 
  FileText, 
  Download,
  Loader2,
  Plus,
  Eye,
  Layout,
  Pencil
} from "lucide-react";
import FilePreviewDialog from "./file-preview-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import BlackboardEditor from "./blackboard-editor";
import { toast } from "sonner";

interface AttachmentManagerProps {
  taskId: string;
  projectId?: string;
  attachments: string[];
}

export default function AttachmentManager({ taskId, projectId, attachments }: AttachmentManagerProps) {
  const queryClient = useQueryClient();
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingSketch, setEditingSketch] = useState<any | null>(null);

  const { data: sketches } = useQuery({
    queryKey: ['sketches', taskId],
    queryFn: async () => (await api.get(`/blackboards/?task_id=${taskId}`)).data,
    enabled: !!taskId
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return api.post(`/tasks/${taskId}/attachments`, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setIsUploading(false);
    },
    onError: () => {
      setIsUploading(false);
    }
  });

  const removeMutation = useMutation({
    mutationFn: async (fileUrl: string) => {
      const updatedAttachments = attachments.filter(url => url !== fileUrl);
      return api.put(`/tasks/${taskId}`, { attachments: updatedAttachments });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    }
  });

  const deleteSketchMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/blackboards/${id}`),
    onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['sketches', taskId] });
        toast.success('Sketch removed');
    }
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsUploading(true);
      uploadMutation.mutate(file);
    }
  };

  const getFileName = (url: string) => {
    return url.split('/').pop() || "file";
  };

  const isImage = (url: string) => {
    const ext = url.split('.').pop()?.toLowerCase();
    return ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '');
  };

  const isPreviewable = (url: string) => {
    const ext = url.split('.').pop()?.toLowerCase() || '';
    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
    const otherExtensions = ['pdf', 'xlsx', 'xls', 'csv', 'docx', 'txt', 'log', 'sql', 'json', 'msg', 'eml'];
    return imageExtensions.includes(ext) || otherExtensions.includes(ext);
  };

  return (
    <div className="space-y-4 pt-6 border-t mt-6">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
          <Paperclip className="w-4 h-4 text-slate-400" />
          Attachments & Sketches
          <span className="text-xs font-normal text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
            {attachments.length + (sketches?.length || 0)}
          </span>
        </h4>
        
        <div className="flex items-center gap-2">
          {projectId && (
            <Button 
              variant="outline" 
              size="sm" 
              className="h-7 text-xs gap-1"
              onClick={() => {
                setEditingSketch(null);
                setIsEditorOpen(true);
              }}
            >
              <Pencil className="w-3 h-3" />
              New Sketch
            </Button>
          )}
          <div className="relative">
            <input
              type="file"
              id="file-upload"
              className="hidden"
              onChange={handleFileChange}
              disabled={isUploading}
            />
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-7 text-xs gap-1"
              asChild
              disabled={isUploading}
            >
              <label htmlFor="file-upload" className="cursor-pointer">
                {isUploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                Upload
              </label>
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Sketches */}
        {sketches?.map((bb: any) => (
            <div 
              key={bb.id} 
              className="flex items-center gap-3 p-2 rounded-lg border border-blue-100 bg-blue-50/30 group hover:border-blue-300 transition-all shadow-sm"
            >
              <div 
                className="w-10 h-10 rounded bg-white flex items-center justify-center shrink-0 overflow-hidden border border-blue-100 cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => {
                    setEditingSketch(bb);
                    setIsEditorOpen(true);
                }}
              >
                <Layout className="w-5 h-5 text-blue-500" />
              </div>
              
              <div 
                className="flex-1 min-w-0 cursor-pointer"
                onClick={() => {
                    setEditingSketch(bb);
                    setIsEditorOpen(true);
                }}
              >
                <p className="text-[10px] font-bold text-slate-700 truncate">
                  {bb.title}
                </p>
                <p className="text-[8px] text-blue-600 font-black uppercase tracking-tight">Sketch • Click to edit</p>
              </div>

              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button 
                  onClick={() => deleteSketchMutation.mutate(bb.id)}
                  className="p-1 hover:bg-white rounded text-slate-400 hover:text-destructive transition-colors"
                  title="Remove Sketch"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
        ))}

        {/* Regular Attachments */}
        {attachments.map((url) => {
          const fullUrl = url.startsWith('http') ? url : url; 
          const canPreview = isPreviewable(url);
          
          return (
            <div 
              key={url} 
              className="flex items-center gap-3 p-2 rounded-lg border bg-white group hover:border-primary/30 transition-all shadow-sm"
            >
              <div 
                className="w-10 h-10 rounded bg-slate-100 flex items-center justify-center shrink-0 overflow-hidden border cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => canPreview && setPreviewUrl(fullUrl)}
              >
                {isImage(url) ? (
                  <img 
                    src={fullUrl} 
                    alt="preview" 
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <FileText className="w-5 h-5 text-slate-400" />
                )}
              </div>
              
              <div 
                className="flex-1 min-w-0 cursor-pointer"
                onClick={() => canPreview && setPreviewUrl(fullUrl)}
              >
                <p className="text-[10px] font-bold text-slate-700 truncate">
                  {getFileName(url)}
                </p>
                {canPreview && (
                  <p className="text-[8px] text-primary font-black uppercase tracking-tight">Click to preview</p>
                )}
              </div>

              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {canPreview && (
                  <button 
                    onClick={() => setPreviewUrl(fullUrl)}
                    className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-primary transition-colors"
                    title="Preview"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                )}
                <a 
                  href={fullUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-primary transition-colors"
                  title="Download"
                >
                  <Download className="w-3.5 h-3.5" />
                </a>
                <button 
                  onClick={() => removeMutation.mutate(url)}
                  className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-destructive transition-colors"
                  title="Delete"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {attachments.length === 0 && (sketches?.length || 0) === 0 && !isUploading && (
        <p className="text-xs text-slate-400 italic">No files or sketches attached.</p>
      )}

      <FilePreviewDialog 
        url={previewUrl}
        onClose={() => setPreviewUrl(null)}
      />

      <Dialog open={isEditorOpen} onOpenChange={setIsEditorOpen}>
        <DialogContent className="sm:max-w-[95vw] h-[90vh] p-0 overflow-hidden flex flex-col">
            <DialogHeader className="p-4 border-b sr-only">
                <DialogTitle>Blackboard Editor</DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-hidden">
                <BlackboardEditor 
                    projectId={projectId || ""} 
                    taskId={taskId}
                    initialData={editingSketch?.data}
                    title={editingSketch?.title}
                    onSave={() => {
                        queryClient.invalidateQueries({ queryKey: ['sketches', taskId] });
                    }}
                />
            </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}