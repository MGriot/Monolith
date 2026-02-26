import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, ImageIcon, Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

interface AvailableImage {
  url: string;
  name: string;
  source: string;
}

interface ImageGalleryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (url: string, name: string) => void;
  projectId?: string;
  taskId?: string;
  ideaId?: string;
}

export function ImageGalleryDialog({
  open,
  onOpenChange,
  onSelect,
  projectId,
  taskId,
  ideaId
}: ImageGalleryDialogProps) {
  const { data: images, isLoading } = useQuery({
    queryKey: ['available-images', { projectId, taskId, ideaId }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (projectId) params.append('project_id', projectId);
      if (taskId) params.append('task_id', taskId);
      if (ideaId) params.append('idea_id', ideaId);
      
      const response = await api.get(`/comments/available-images?${params.toString()}`);
      return response.data as AvailableImage[];
    },
    enabled: open
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="w-5 h-5 text-primary" />
            Available Images
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-4">
          <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-100 rounded-lg text-blue-800 text-xs">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <p>
              Showing images uploaded to this {taskId ? 'task' : ideaId ? 'idea' : 'project'} and its related items. 
              Click an image to insert it into your comment.
            </p>
          </div>

          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-500">
              <Loader2 className="w-8 h-8 animate-spin text-primary mb-2" />
              <p className="text-sm">Fetching images...</p>
            </div>
          ) : images && images.length > 0 ? (
            <ScrollArea className="flex-1">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 p-1">
                {images.map((img, idx) => (
                  <button
                    key={`${img.url}-${idx}`}
                    className="group relative aspect-square rounded-lg border border-slate-200 overflow-hidden hover:border-primary hover:ring-2 hover:ring-primary/20 transition-all text-left"
                    onClick={() => onSelect(img.url, img.name)}
                  >
                    <img 
                      src={img.url} 
                      alt={img.name} 
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                      <p className="text-[10px] text-white font-medium truncate">{img.name}</p>
                    </div>
                    <div className="absolute top-2 right-2">
                      <Badge variant="secondary" className="text-[8px] px-1 py-0 h-4 bg-white/90 backdrop-blur-sm border-none shadow-sm">
                        {img.source}
                      </Badge>
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400 border-2 border-dashed rounded-xl">
              <ImageIcon className="w-12 h-12 mb-2 opacity-20" />
              <p className="text-sm font-medium">No images found in this context.</p>
              <p className="text-xs">Upload some files to the {taskId ? 'task' : 'project'} first!</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
