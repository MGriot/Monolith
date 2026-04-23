import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
    Save, 
    X, 
    FileText, 
    Eye, 
    Pencil,
    Loader2
} from 'lucide-react';
import SimpleMDE from "react-simplemde-editor";
import "easymde/dist/easymde.min.css";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { toast } from 'sonner';

interface NoteEditorProps {
  file: {
    id: string;
    name: string;
    content?: string;
    url: string;
  };
  onClose: () => void;
}

export default function NoteEditor({ file, onClose }: NoteEditorProps) {
  const queryClient = useQueryClient();
  const [content, setContent] = useState(file.content || "");
  const [name, setName] = useState(file.name);
  const [mode, setMode] = useState<"edit" | "preview">("edit");

  const updateFileMutation = useMutation({
    mutationFn: (data: any) => api.put(`/folders/files/${file.id}`, data),
    onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['folders'] });
        toast.success("Note saved");
        onClose();
    }
  });

  const handleSave = () => {
      updateFileMutation.mutate({
          name: name,
          content: content
      });
  };

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-3 flex-1">
            <FileText className="w-5 h-5 text-primary" />
            <Input 
                className="h-9 font-bold text-lg border-none focus-visible:ring-0 px-0 max-w-md"
                value={name}
                onChange={(e) => setName(e.target.value)}
            />
        </div>
        <div className="flex items-center gap-2">
            <div className="flex bg-slate-100 rounded-lg p-1 mr-4">
                <Button 
                    variant={mode === 'edit' ? 'secondary' : 'ghost'} 
                    size="sm" 
                    className="h-7 px-3 text-[10px] font-black uppercase gap-1.5"
                    onClick={() => setMode('edit')}
                >
                    <Pencil className="w-3 h-3" /> Edit
                </Button>
                <Button 
                    variant={mode === 'preview' ? 'secondary' : 'ghost'} 
                    size="sm" 
                    className="h-7 px-3 text-[10px] font-black uppercase gap-1.5"
                    onClick={() => setMode('preview')}
                >
                    <Eye className="w-3 h-3" /> Preview
                </Button>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8"><X className="w-4 h-4" /></Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-slate-50/30">
        {mode === 'edit' ? (
            <div className="h-full p-4 max-w-5xl mx-auto">
                <SimpleMDE 
                    value={content}
                    onChange={setContent}
                    options={{
                        autofocus: true,
                        spellChecker: false,
                        status: false,
                        minHeight: "calc(100vh - 300px)"
                    }}
                />
            </div>
        ) : (
            <div className="p-8 max-w-4xl mx-auto bg-white min-h-full shadow-sm border-x border-slate-100 prose prose-slate dark:prose-invert">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {content}
                </ReactMarkdown>
            </div>
        )}
      </div>

      <div className="p-4 border-t flex justify-end gap-3 bg-white">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={updateFileMutation.isPending} className="gap-2">
              {updateFileMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Changes
          </Button>
      </div>
    </div>
  );
}
