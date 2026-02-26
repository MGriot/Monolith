import { useState, useMemo, useCallback, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Loader2, Send, Image as ImageIcon } from 'lucide-react';
import SimpleMDE from "react-simplemde-editor";
import "easymde/dist/easymde.min.css";
import api from '@/lib/api';
import { toast } from 'sonner';
import { ImageGalleryDialog } from './image-gallery-dialog';

interface CommentInputProps {
  onSubmit: (content: string) => Promise<void>;
  placeholder?: string;
  isSubmitting?: boolean;
  initialValue?: string;
  onCancel?: () => void;
  submitLabel?: string;
  projectId?: string;
  taskId?: string;
  ideaId?: string;
}

export function CommentInput({
  onSubmit,
  placeholder = "Write a comment...",
  isSubmitting = false,
  initialValue = "",
  onCancel,
  submitLabel = "Comment",
  projectId,
  taskId,
  ideaId
}: CommentInputProps) {
  const [content, setContent] = useState(initialValue);
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const mdeRef = useRef<any>(null);

  const handleImageUpload = useCallback(async (file: File, onSuccess: (url: string) => void, onError: (error: string) => void) => {
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      const response = await api.post('/comments/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      // The backend returns a path or full URL. Assuming it's a relative path to /uploads/
      const url = response.data.url.startsWith('http') ? response.data.url : `/uploads/${response.data.url.split('/').pop()}`;
      onSuccess(url);
    } catch (error) {
      console.error('Upload failed:', error);
      onError("Upload failed");
      toast.error("Failed to upload image");
    }
  }, []);

  const mdeOptions = useMemo(() => {
    return {
      autofocus: false,
      spellChecker: false,
      placeholder: placeholder,
      status: false,
      minHeight: "100px",
      uploadImage: true,
      imageUploadFunction: handleImageUpload,
      imageAccept: "image/png, image/jpeg, image/gif, image/webp",
      toolbar: [
        "bold", "italic", "heading", "|", 
        "quote", "unordered-list", "ordered-list", "|", 
        "link", "image", 
        {
          name: "gallery",
          action: () => setIsGalleryOpen(true),
          className: "fa fa-camera", // FontAwesome class for camera icon as placeholder
          title: "Insert from Gallery",
        },
        "table", "|", 
        "preview", "side-by-side", "fullscreen", "|", 
        "guide"
      ],
    } as any;
  }, [placeholder, handleImageUpload]);

  const handleSubmit = async () => {
    if (!content.trim()) return;
    await onSubmit(content);
    if (!initialValue) {
        setContent("");
    }
  };

  const handleSelectFromGallery = (url: string, name: string) => {
    const cm = mdeRef.current?.simplemde?.codemirror;
    if (cm) {
      const doc = cm.getDoc();
      const cursor = doc.getCursor();
      const line = doc.getLine(cursor.line);
      const pos = {
        line: cursor.line,
        ch: line.length
      };
      doc.replaceRange(`\n![${name}](${url})\n`, pos);
    } else {
      // Fallback if ref not available
      setContent(prev => `${prev}\n![${name}](${url})\n`);
    }
    setIsGalleryOpen(false);
  };

  return (
    <div className="space-y-2 border rounded-md overflow-hidden bg-white">
      <SimpleMDE
        getMdeInstance={(mde) => { mdeRef.current = { simplemde: mde }; }}
        value={content}
        onChange={setContent}
        options={mdeOptions}
      />
      <div className="flex justify-between items-center p-2 bg-slate-50 border-t">
        <Button 
          variant="outline" 
          size="sm" 
          className="h-8 gap-2 text-xs text-slate-600 hover:text-primary"
          onClick={() => setIsGalleryOpen(true)}
        >
          <ImageIcon className="w-3.5 h-3.5" />
          Select from Gallery
        </Button>
        <div className="flex gap-2">
          {onCancel && (
            <Button variant="ghost" size="sm" onClick={onCancel} disabled={isSubmitting}>
              Cancel
            </Button>
          )}
          <Button size="sm" onClick={handleSubmit} disabled={!content.trim() || isSubmitting}>
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            {submitLabel}
          </Button>
        </div>
      </div>

      <ImageGalleryDialog
        open={isGalleryOpen}
        onOpenChange={setIsGalleryOpen}
        onSelect={handleSelectFromGallery}
        projectId={projectId}
        taskId={taskId}
        ideaId={ideaId}
      />
    </div>
  );
}
