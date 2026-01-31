import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { 
  Paperclip, 
  X, 
  FileText, 
  Download,
  Loader2,
  Plus
} from "lucide-react";

interface AttachmentManagerProps {
  taskId: string;
  attachments: string[];
}

export default function AttachmentManager({ taskId, attachments }: AttachmentManagerProps) {
  const queryClient = useQueryClient();
  const [isUploading, setIsUploading] = useState(false);

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

  return (
    <div className="space-y-4 pt-6 border-t mt-6">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
          <Paperclip className="w-4 h-4 text-slate-400" />
          Attachments
          <span className="text-xs font-normal text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
            {attachments.length}
          </span>
        </h4>
        
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {attachments.map((url) => {
          const fullUrl = url.startsWith('http') ? url : url; 
          
          return (
            <div 
              key={url} 
              className="flex items-center gap-3 p-2 rounded-lg border bg-white group hover:border-primary/30 transition-all shadow-sm"
            >
              <div className="w-10 h-10 rounded bg-slate-100 flex items-center justify-center shrink-0 overflow-hidden border">
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
              
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold text-slate-700 truncate">
                  {getFileName(url)}
                </p>
              </div>

              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <a 
                  href={fullUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-primary transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                </a>
                <button 
                  onClick={() => removeMutation.mutate(url)}
                  className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-destructive transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {attachments.length === 0 && !isUploading && (
        <p className="text-xs text-slate-400 italic">No files attached.</p>
      )}
    </div>
  );
}