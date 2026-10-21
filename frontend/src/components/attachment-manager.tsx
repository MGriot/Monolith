import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { 
  Paperclip, 
  X, 
  FileText, 
  Download,
  Plus,
  Eye,
  Layout,
  Globe,
  Image as ImageIcon
} from "lucide-react";
import FilePreviewDialog from "./file-preview-dialog";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import WhiteboardEditor from "./whiteboard-editor";
import { SketchThumbnail } from "./sketch-thumbnail";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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
  const [editingWhiteboard, setEditingWhiteboard] = useState<any | null>(null);
  
  // Decision Flow State
  const [isAddContentOpen, setIsAddContentOpen] = useState(false);
  const [contentMode, setContentMode] = useState<"select" | "link" | "whiteboard">("select");
  const [externalLink, setExternalLink] = useState("");

  const { data: projectWhiteboards } = useQuery({
    queryKey: ['whiteboards', 'project', projectId],
    queryFn: async () => (await api.get(`/whiteboards/?project_id=${projectId}`)).data,
    enabled: !!projectId && isAddContentOpen && contentMode === "whiteboard"
  });

  const { data: taskWhiteboards } = useQuery({
    queryKey: ['whiteboards', taskId],
    queryFn: async () => (await api.get(`/whiteboards/?task_id=${taskId}`)).data,
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
      queryClient.invalidateQueries({ queryKey: ['project'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setIsUploading(false);
      setIsAddContentOpen(false);
    },
    onError: () => {
      setIsUploading(false);
    }
  });

  const updateTaskMutation = useMutation({
    mutationFn: async (data: any) => {
      return api.put(`/tasks/${taskId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setIsAddContentOpen(false);
      setExternalLink("");
    }
  });

  const linkWhiteboardMutation = useMutation({
    mutationFn: async (whiteboardId: string) => {
        return api.put(`/whiteboards/${whiteboardId}`, { task_id: taskId });
    },
    onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['whiteboards', taskId] });
        setIsAddContentOpen(false);
        toast.success("Whiteboard linked to task");
    }
  });

  const removeMutation = useMutation({
    mutationFn: async (fileUrl: string) => {
      const updatedAttachments = attachments.filter(url => url !== fileUrl);
      return api.put(`/tasks/${taskId}`, { attachments: updatedAttachments });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['project'] });
    }
  });

  const deleteWhiteboardMutation = useMutation({
    mutationFn: (id: string) => api.put(`/whiteboards/${id}`, { task_id: null }),
    onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['whiteboards', taskId] });
        toast.success('Whiteboard unlinked');
    }
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsUploading(true);
      uploadMutation.mutate(file);
    }
  };

  const handleAddLink = () => {
      if (!externalLink) return;
      const updated = [...attachments, externalLink];
      updateTaskMutation.mutate({ attachments: updated });
  };

  const getFileName = (url: string) => {
    if (!url.includes('/')) return url;
    return url.split('/').pop() || "file";
  };

  const isImage = (url: string) => {
    const ext = url.split('.').pop()?.toLowerCase();
    return ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '');
  };

  const isPreviewable = (url: string) => {
    if (url.startsWith('http') && !url.includes(window.location.hostname)) return false;
    const ext = url.split('.').pop()?.toLowerCase() || '';
    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
    const otherExtensions = ['pdf', 'xlsx', 'xls', 'csv', 'docx', 'txt', 'log', 'sql', 'json', 'msg', 'eml'];
    return imageExtensions.includes(ext) || otherExtensions.includes(ext);
  };

  return (
    <div className="space-y-4 pt-6 border-t mt-6">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Paperclip className="w-4 h-4 text-fg-faint" />
          Attachments & Resources
          <span className="text-xs font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
            {attachments.length + (taskWhiteboards?.length || 0)}
          </span>
        </h4>
        
        <Button 
          variant="outline" 
          size="sm" 
          className="h-8 text-[11px] font-bold uppercase tracking-wider gap-2 shadow-sm"
          onClick={() => {
            setContentMode("select");
            setIsAddContentOpen(true);
          }}
        >
          <Plus className="w-3.5 h-3.5" />
          Add Content
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Whiteboards */}
        {taskWhiteboards?.map((wb: any) => (
            <div 
              key={wb.id} 
              className="flex items-center gap-3 p-2.5 rounded-xl border border-blue-100 dark:border-blue-500/20 bg-blue-50/30 group hover:border-blue-300 dark:hover:border-blue-500/40 transition-all shadow-sm"
            >
              <div 
                className="w-10 h-10 rounded-lg bg-background flex items-center justify-center shrink-0 overflow-hidden border border-blue-100 dark:border-blue-500/20 cursor-pointer hover:opacity-80 transition-opacity shadow-inner"
                onClick={() => {
                    setEditingWhiteboard(wb);
                    setIsEditorOpen(true);
                }}
              >
                <SketchThumbnail src={wb.preview_image} className="h-full w-full rounded-none" iconClassName="h-5 w-5 text-blue-500" />
              </div>
              
              <div 
                className="flex-1 min-w-0 cursor-pointer"
                onClick={() => {
                    setEditingWhiteboard(wb);
                    setIsEditorOpen(true);
                }}
              >
                <p className="text-[11px] font-bold text-fg-body truncate">
                  {wb.title}
                </p>
                <p className="text-[11px] text-blue-600 dark:text-blue-400 font-semibold uppercase tracking-tight">Project Whiteboard</p>
              </div>

              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button 
                  onClick={() => deleteWhiteboardMutation.mutate(wb.id)}
                  className="p-1 hover:bg-background rounded-md text-fg-faint hover:text-destructive transition-colors"
                  title="Unlink Whiteboard"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
        ))}

        {/* Regular Attachments & Links */}
        {(attachments || []).map((url) => {
          if (!url) return null;
          const isExternal = String(url).startsWith('http');
          const canPreview = isPreviewable(String(url));
          
          return (
            <div 
              key={String(url)} 
              className={cn(
                  "flex items-center gap-3 p-2.5 rounded-xl border group transition-all shadow-sm",
                  isExternal ? "bg-subtle/50 border-hairline hover:border-fg-ghost" : "bg-background border-border hover:border-primary/30"
              )}
            >
              <div 
                className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0 overflow-hidden border cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => {
                    if (isExternal) window.open(String(url), '_blank');
                    else if (canPreview) setPreviewUrl(String(url));
                }}
              >
                {isImage(String(url)) ? (
                  <img 
                    src={String(url)} 
                    alt="preview" 
                    className="w-full h-full object-cover"
                  />
                ) : isExternal ? (
                  <Globe className="w-5 h-5 text-fg-faint" />
                ) : (
                  <FileText className="w-5 h-5 text-fg-faint" />
                )}
              </div>
              
              <div 
                className="flex-1 min-w-0 cursor-pointer"
                onClick={() => {
                    if (isExternal) window.open(String(url), '_blank');
                    else if (canPreview) setPreviewUrl(String(url));
                }}
              >
                <p className="text-[11px] font-bold text-fg-body truncate">
                  {getFileName(String(url))}
                </p>
                <p className="text-[11px] text-fg-faint font-semibold uppercase tracking-tight">
                    {isExternal ? "External Link" : (canPreview ? "Click to preview" : "File Attachment")}
                </p>
              </div>

              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {canPreview && (
                  <button 
                    onClick={() => setPreviewUrl(String(url))}
                    className="p-1 hover:bg-muted rounded-md text-fg-faint hover:text-primary transition-colors"
                    title="Preview"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                )}
                {!isExternal && (
                    <a 
                    href={String(url)} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="p-1 hover:bg-muted rounded-md text-fg-faint hover:text-primary transition-colors"
                    title="Download"
                    >
                    <Download className="w-3.5 h-3.5" />
                    </a>
                )}
                <button 
                  onClick={() => removeMutation.mutate(String(url))}
                  className="p-1 hover:bg-muted rounded-md text-fg-faint hover:text-destructive transition-colors"
                  title="Delete"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {attachments.length === 0 && (taskWhiteboards?.length || 0) === 0 && !isUploading && (
        <div className="text-center py-8 bg-subtle/50 rounded-2xl border border-dashed border-border">
             <Paperclip className="w-8 h-8 text-border mx-auto mb-2" />
             <p className="text-[11px] font-bold text-fg-faint uppercase tracking-wide">No resources attached</p>
        </div>
      )}

      {/* Decision Dialog */}
      <Dialog open={isAddContentOpen} onOpenChange={setIsAddContentOpen}>
          <DialogContent size="sm">
              <DialogHeader>
                  <DialogTitle>Add content to task</DialogTitle>
              </DialogHeader>

              <DialogBody>
              {contentMode === "select" && (
                  <div className="grid grid-cols-1 gap-3">
                      <button 
                        className="flex items-center gap-4 p-4 rounded-xl border border-border hover:border-primary hover:bg-primary/5 transition-all text-left group"
                        onClick={() => document.getElementById('file-upload-decision')?.click()}
                      >
                          <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                            <ImageIcon className="w-5 h-5 text-muted-foreground group-hover:text-primary" />
                          </div>
                          <div>
                              <p className="text-xs font-bold text-foreground">Upload Image or File</p>
                              <p className="text-[11px] text-muted-foreground">From your computer</p>
                          </div>
                          <input type="file" id="file-upload-decision" className="hidden" onChange={handleFileChange} />
                      </button>

                      <button 
                        className="flex items-center gap-4 p-4 rounded-xl border border-border hover:border-blue-500 hover:bg-blue-50/50 transition-all text-left group"
                        onClick={() => setContentMode("whiteboard")}
                      >
                          <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center group-hover:bg-blue-100 dark:group-hover:bg-blue-500/20 transition-colors">
                            <Layout className="w-5 h-5 text-muted-foreground group-hover:text-blue-500" />
                          </div>
                          <div>
                              <p className="text-xs font-bold text-foreground">Project Whiteboard</p>
                              <p className="text-[11px] text-muted-foreground">Link an existing drawing board</p>
                          </div>
                      </button>

                      <button 
                        className="flex items-center gap-4 p-4 rounded-xl border border-border hover:border-emerald-500 hover:bg-emerald-50/50 transition-all text-left group"
                        onClick={() => setContentMode("link")}
                      >
                          <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center group-hover:bg-emerald-100 dark:group-hover:bg-emerald-500/20 transition-colors">
                            <Globe className="w-5 h-5 text-muted-foreground group-hover:text-emerald-500" />
                          </div>
                          <div>
                              <p className="text-xs font-bold text-foreground">External Link</p>
                              <p className="text-[11px] text-muted-foreground">Web URL, document, or site</p>
                          </div>
                      </button>
                  </div>
              )}

              {contentMode === "link" && (
                  <div className="space-y-4">
                      <div className="space-y-2">
                        <Label className="text-[11px] font-semibold uppercase text-fg-faint">Website or Resource URL</Label>
                        <Input 
                            placeholder="https://example.com" 
                            value={externalLink}
                            onChange={(e) => setExternalLink(e.target.value)}
                            autoFocus
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="sm" onClick={() => setContentMode("select")}>Back</Button>
                          <Button size="sm" onClick={handleAddLink} disabled={!externalLink}>Add Link</Button>
                      </div>
                  </div>
              )}

              {contentMode === "whiteboard" && (
                  <div className="space-y-4">
                      <Label className="text-[11px] font-semibold uppercase text-fg-faint">Select Project Whiteboard</Label>
                      <div className="max-h-[200px] overflow-y-auto space-y-1 pr-2">
                          {projectWhiteboards?.length === 0 && <p className="text-xs text-fg-faint text-center py-4">No whiteboards in project.</p>}
                          {projectWhiteboards?.map((wb: any) => (
                              <button
                                key={wb.id}
                                className={cn(
                                    "w-full text-left p-2 rounded-lg text-xs font-medium hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors border border-transparent",
                                    wb.task_id === taskId && "bg-blue-50/50 border-blue-100 dark:border-blue-500/20 text-blue-700 dark:text-blue-300 pointer-events-none"
                                )}
                                onClick={() => linkWhiteboardMutation.mutate(wb.id)}
                              >
                                  {wb.title} {wb.task_id === taskId && "(Linked)"}
                              </button>
                          ))}
                      </div>
                      <div className="flex justify-between items-center pt-2">
                          <Button variant="ghost" size="sm" onClick={() => setContentMode("select")}>Back</Button>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="gap-1"
                            onClick={() => {
                                setEditingWhiteboard(null);
                                setIsAddContentOpen(false);
                                setIsEditorOpen(true);
                            }}
                          >
                              <Plus className="w-3 h-3" /> Create New
                          </Button>
                      </div>
                  </div>
              )}
              </DialogBody>
          </DialogContent>
      </Dialog>

      <FilePreviewDialog
        url={previewUrl}
        onClose={() => setPreviewUrl(null)}
      />

      <Dialog open={isEditorOpen} onOpenChange={setIsEditorOpen}>
        <DialogContent size="full" hideClose>
            <DialogHeader className="sr-only">
                <DialogTitle>Whiteboard Editor</DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-hidden">
                <WhiteboardEditor 
                    id={editingWhiteboard?.id}
                    projectId={projectId || ""} 
                    taskId={taskId}
                    initialData={editingWhiteboard?.data}
                    title={editingWhiteboard?.title}
                    onSave={() => {
                        queryClient.invalidateQueries({ queryKey: ['whiteboards', taskId] });
                    }}
                    onClose={() => setIsEditorOpen(false)}
                />
            </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}