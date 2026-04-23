import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { 
  Folder as FolderIcon, 
  FolderOpen, 
  File as FileIcon, 
  Plus, 
  X, 
  MoreVertical,
  ChevronRight,
  ChevronDown,
  Image as ImageIcon,
  FileText,
  Trash2,
  Download,
  ExternalLink,
  Loader2,
  Check,
  Type,
  Upload
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
  } from "@/components/ui/dialog";
import { toast } from 'sonner';
import NoteEditor from './note-editor';

interface Folder {
  id: string;
  name: string;
  type: 'generic' | 'media' | 'notes';
  parent_id: string | null;
  subfolders: Folder[];
  files: any[];
}

interface FolderTreeProps {
  projectId?: string;
  taskId?: string;
  onFileClick?: (file: any) => void;
}

export default function FolderTree({ projectId, taskId, onFileClick }: FolderTreeProps) {
  const queryClient = useQueryClient();
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [newFolderName, setNewFolderName] = useState('');
  const [creatingIn, setCreatingIn] = useState<string | null>(null);
  
  // File/Note State
  const [selectedFile, setSelectedFile] = useState<any | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  const { data: folders, isLoading } = useQuery({
    queryKey: ['folders', { projectId, taskId }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (projectId) params.append('project_id', projectId);
      if (taskId) params.append('task_id', taskId);
      const res = await api.get(`/folders/?${params.toString()}`);
      return res.data as Folder[];
    }
  });

  const createFolderMutation = useMutation({
    mutationFn: (data: any) => api.post('/folders/', data),
    onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['folders'] });
        setNewFolderName('');
        setCreatingIn(null);
        toast.success("Folder created");
    }
  });

  const deleteFolderMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/folders/${id}`),
    onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['folders'] });
        toast.success("Folder deleted");
    }
  });

  const uploadFileMutation = useMutation({
    mutationFn: ({ folderId, file }: { folderId: string, file: File }) => {
        const formData = new FormData();
        formData.append('file', file);
        return api.post(`/folders/${folderId}/upload`, formData);
    },
    onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['folders'] });
        toast.success("File uploaded");
    }
  });

  const createNoteMutation = useMutation({
    mutationFn: (folderId: string) => api.post(`/folders/${folderId}/upload-note`, { name: "Untitled Note.md" }), // Need endpoint
    onSuccess: (res) => {
        queryClient.invalidateQueries({ queryKey: ['folders'] });
        setSelectedFile(res.data);
        setIsEditorOpen(true);
    }
  });

  const toggleFolder = (id: string) => {
    const next = new Set(expandedFolders);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedFolders(next);
  };

  const handleCreateFolder = (parentId: string | null = null) => {
    if (!newFolderName.trim()) return;
    createFolderMutation.mutate({
        name: newFolderName,
        parent_id: parentId,
        project_id: projectId,
        task_id: taskId,
        type: 'generic'
    });
  };

  if (isLoading) return <div className="flex justify-center p-4"><Loader2 className="h-4 w-4 animate-spin text-slate-300" /></div>;

  const rootFolders = folders?.filter(f => !f.parent_id) || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-2">
        <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Project Files</h3>
        <Button 
            variant="ghost" 
            size="icon" 
            className="h-6 w-6" 
            onClick={() => setCreatingIn('root')}
        >
            <Plus className="w-3.5 h-3.5" />
        </Button>
      </div>

      <div className="space-y-1">
        {creatingIn === 'root' && (
            <div className="flex items-center gap-2 p-1 px-2 mb-2 bg-slate-50 rounded-lg border border-primary/20 animate-in fade-in zoom-in-95 duration-200">
                <FolderIcon className="w-3.5 h-3.5 text-primary/50" />
                <Input 
                    autoFocus
                    className="h-7 text-xs border-none bg-transparent focus-visible:ring-0 px-0"
                    placeholder="Folder name..."
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') handleCreateFolder(null);
                        if (e.key === 'Escape') setCreatingIn(null);
                    }}
                />
                <button onClick={() => handleCreateFolder(null)}><Check className="w-3 h-3 text-emerald-500" /></button>
            </div>
        )}

        {rootFolders.map(folder => (
            <FolderItem 
                key={folder.id} 
                folder={folder} 
                expandedFolders={expandedFolders}
                toggleFolder={toggleFolder}
                onDelete={(id) => deleteFolderMutation.mutate(id)}
                onCreateSub={(id) => {
                    setCreatingIn(id);
                    if (!expandedFolders.has(id)) toggleFolder(id);
                }}
                isCreatingSub={creatingIn === folder.id}
                newFolderName={newFolderName}
                setNewFolderName={setNewFolderName}
                onConfirmCreate={handleCreateFolder}
                onCancelCreate={() => setCreatingIn(null)}
                onFileClick={(file: any) => {
                    if (file.name.endsWith('.md')) {
                        setSelectedFile(file);
                        setIsEditorOpen(true);
                    } else {
                        onFileClick?.(file);
                    }
                }}
                onUpload={(file: File) => uploadFileMutation.mutate({ folderId: folder.id, file })}
            />
        ))}

        {rootFolders.length === 0 && !creatingIn && (
            <div className="py-12 text-center border-2 border-dashed rounded-2xl border-slate-100 flex flex-col items-center gap-2">
                <FolderIcon className="w-8 h-8 text-slate-100" />
                <p className="text-[10px] font-black uppercase text-slate-300">Hub is empty</p>
            </div>
        )}
      </div>

      {/* Note Editor Modal */}
      <Dialog open={isEditorOpen} onOpenChange={setIsEditorOpen}>
          <DialogContent className="sm:max-w-[90vw] h-[85vh] p-0 overflow-hidden">
              {selectedFile && (
                  <NoteEditor 
                    file={selectedFile} 
                    onClose={() => setIsEditorOpen(false)} 
                  />
              )}
          </DialogContent>
      </Dialog>
    </div>
  );
}

function FolderItem({ 
    folder, expandedFolders, toggleFolder, onDelete, onCreateSub, 
    isCreatingSub, newFolderName, setNewFolderName, onConfirmCreate, onCancelCreate,
    onFileClick, onUpload
}: any) {
  const isExpanded = expandedFolders.has(folder.id);
  const hasContent = folder.subfolders?.length > 0 || folder.files?.length > 0;

  return (
    <div className="select-none">
      <div className={cn(
          "group flex items-center gap-2 p-1.5 rounded-lg transition-all cursor-pointer",
          isExpanded ? "bg-slate-100/50" : "hover:bg-slate-50"
      )} onClick={() => toggleFolder(folder.id)}>
        {hasContent ? (
            isExpanded ? <ChevronDown className="w-3 h-3 text-slate-400" /> : <ChevronRight className="w-3 h-3 text-slate-400" />
        ) : <div className="w-3" />}
        
        {isExpanded ? <FolderOpen className="w-3.5 h-3.5 text-primary" /> : <FolderIcon className="w-3.5 h-3.5 text-slate-400" />}
        
        <span className="flex-1 text-xs font-bold text-slate-700 truncate">{folder.name}</span>
        
        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5">
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button className="p-1 hover:bg-white rounded text-slate-300 hover:text-slate-600" onClick={(e) => e.stopPropagation()}>
                        <Plus className="w-3 h-3" />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="text-xs">
                    <DropdownMenuItem onClick={() => onCreateSub(folder.id)}>
                        <FolderIcon className="w-3 h-3 mr-2" /> New Subfolder
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => createNoteMutation.mutate(folder.id)}>
                        <FileText className="w-3 h-3 mr-2" /> New Markdown Note
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => {
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.onchange = (e: any) => {
                            const file = e.target.files[0];
                            if (file) onUpload(file);
                        };
                        input.click();
                    }}>
                        <Upload className="w-3 h-3 mr-2" /> Upload File
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button className="p-1 hover:bg-white rounded text-slate-300 hover:text-slate-600" onClick={(e) => e.stopPropagation()}>
                        <MoreVertical className="w-3 h-3" />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="text-xs">
                    <DropdownMenuItem className="text-red-600" onClick={() => onDelete(folder.id)}>
                        <Trash2 className="w-3 h-3 mr-2" /> Delete Folder
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
      </div>

      {isExpanded && (
        <div className="ml-4 pl-3 border-l border-slate-100 space-y-1 mt-1 pb-1">
          {/* Files */}
          {folder.files?.map((file: any) => (
              <div 
                key={file.id} 
                className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-50 transition-colors group cursor-pointer"
                onClick={() => onFileClick?.(file)}
              >
                  {file.name.endsWith('.md') ? <FileText className="w-3 h-3 text-primary/60" /> : <FileIcon className="w-3 h-3 text-slate-300" />}
                  <span className="flex-1 text-[11px] font-medium text-slate-600 truncate">{file.name}</span>
                  <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1">
                      <a href={file.url} target="_blank" className="p-1 hover:bg-white rounded text-slate-400"><ExternalLink className="w-2.5 h-2.5" /></a>
                  </div>
              </div>
          ))}

          {/* Subfolders */}
          {folder.subfolders?.map((sub: any) => (
              <FolderItem 
                key={sub.id} 
                folder={sub} 
                expandedFolders={expandedFolders} 
                toggleFolder={toggleFolder}
                onDelete={onDelete}
                onCreateSub={onCreateSub}
                onFileClick={onFileClick}
                onUpload={onUpload}
              />
          ))}

          {isCreatingSub && (
            <div className="flex items-center gap-2 p-1 bg-slate-50 rounded-lg border border-primary/10 animate-in slide-in-from-left-2">
                <FolderIcon className="w-3 h-3 text-primary/30" />
                <Input 
                    autoFocus
                    className="h-6 text-[10px] border-none bg-transparent focus-visible:ring-0 px-0"
                    placeholder="Subfolder..."
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') onConfirmCreate(folder.id);
                        if (e.key === 'Escape') onCancelCreate();
                    }}
                />
                <button onClick={() => onConfirmCreate(folder.id)}><Check className="w-2.5 h-2.5 text-emerald-500" /></button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
