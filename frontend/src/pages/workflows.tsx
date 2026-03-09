import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { useAuth } from '@/components/auth-provider';
import { 
    FileText, 
    BookOpen, 
    ArrowRight, 
    Plus, 
    Trash2, 
    Edit3, 
    Loader2, 
    Search,
    ChevronLeft,
    Clock,
    User as UserIcon,
    Globe,
    Lock,
    Share2
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import MarkdownRenderer from '@/components/markdown-renderer';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import type { Workflow } from '@/types';
import { Switch } from '@/components/ui/switch';
import { AssigneeSelector } from '@/components/assignee-selector';
import SimpleMDE from "react-simplemde-editor";
import "easymde/dist/easymde.min.css";

export default function WorkflowsPage() {
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const [searchTerm, setSearchTerm] = useState('');
    
    // View state
    const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [editingWorkflow, setEditingWorkflow] = useState<Workflow | null>(null);

    // Form state
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [content, setContent] = useState('');
    const [isPublic, setIsPublic] = useState(false);
    const [sharedWithIds, setSharedWithIds] = useState<string[]>([]);

    const { data: workflows, isLoading } = useQuery({
        queryKey: ['workflows'],
        queryFn: async () => (await api.get('/workflows/')).data as Workflow[],
    });

    const handleImageUpload = useCallback(async (file: File, onSuccess: (url: string) => void, onError: (error: string) => void) => {
        const formData = new FormData();
        formData.append('file', file);
        
        try {
          const response = await api.post('/comments/upload', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
          });
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
          status: false,
          minHeight: "300px",
          uploadImage: true,
          imageUploadFunction: handleImageUpload,
          imageAccept: "image/png, image/jpeg, image/gif, image/webp",
          toolbar: [
            "bold", "italic", "heading", "|", 
            "quote", "unordered-list", "ordered-list", "|", 
            "link", "image", "table", "|", 
            "preview", "side-by-side", "fullscreen", "|", 
            "guide"
          ],
        } as any;
    }, [handleImageUpload]);

    const createMutation = useMutation({
        mutationFn: (data: any) => api.post('/workflows/', data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['workflows'] });
            setIsEditDialogOpen(false);
            toast.success('Workflow created');
        },
        onError: (err: any) => {
            toast.error(err.response?.data?.detail || 'Failed to create workflow');
        }
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }: { id: string, data: any }) => api.put(`/workflows/${id}`, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['workflows'] });
            setIsEditDialogOpen(false);
            if (selectedWorkflow?.id === editingWorkflow?.id) {
                api.get(`/workflows/${editingWorkflow?.id}`).then(res => setSelectedWorkflow(res.data));
            }
            toast.success('Workflow updated');
        },
        onError: (err: any) => {
            toast.error(err.response?.data?.detail || 'Failed to update workflow');
        }
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => api.delete(`/workflows/${id}`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['workflows'] });
            setSelectedWorkflow(null);
            toast.success('Workflow deleted');
        }
    });

    const handleEdit = (wf: Workflow) => {
        setEditingWorkflow(wf);
        setTitle(wf.title);
        setDescription(wf.description || '');
        setContent(wf.content);
        setIsPublic(wf.is_public || false);
        setSharedWithIds(wf.shared_with?.map(u => u.id) || []);
        setIsEditDialogOpen(true);
    };

    const handleCreate = () => {
        setEditingWorkflow(null);
        setTitle('');
        setDescription('');
        setContent('');
        setIsPublic(false);
        setSharedWithIds([]);
        setIsEditDialogOpen(true);
    };

    const handleSubmit = () => {
        if (!title || !content) {
            toast.error('Title and Content are required');
            return;
        }
        const data = { 
            title, 
            description, 
            content,
            is_public: isPublic,
            shared_with_ids: sharedWithIds
        };
        if (editingWorkflow) {
            updateMutation.mutate({ id: editingWorkflow.id, data });
        } else {
            createMutation.mutate(data);
        }
    };

    const canManageWorkflow = (wf: Workflow) => {
        const isOwner = wf.owner_id === user?.id;
        const isCoOwner = wf.shared_with?.some(u => u.id === user?.id);
        return user?.is_superuser || isOwner || isCoOwner;
    };

    const filteredWorkflows = workflows?.filter(wf => 
        wf.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        wf.description?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (selectedWorkflow) {
        return (
            <div className="h-full flex flex-col space-y-0 overflow-hidden bg-slate-50/50">
                <div className="p-6 bg-white border-b border-slate-200">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-4">
                            <Button variant="ghost" size="icon" onClick={() => setSelectedWorkflow(null)} className="h-8 w-8 text-slate-500 hover:text-slate-900">
                                <ChevronLeft className="w-4 h-4" />
                            </Button>
                            <div>
                                <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                                    {selectedWorkflow.title}
                                    {selectedWorkflow.is_public ? (
                                        <span title="Public"><Globe className="w-3.5 h-3.5 text-blue-500" /></span>
                                    ) : (
                                        <span title="Private"><Lock className="w-3.5 h-3.5 text-slate-400" /></span>
                                    )}
                                </h1>
                                <p className="text-xs text-slate-500 font-medium">Standard Operating Procedure • Updated {format(parseISO(selectedWorkflow.updated_at), 'MMM d, yyyy')}</p>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            {canManageWorkflow(selectedWorkflow) && (
                                <>
                                    <Button variant="outline" size="sm" onClick={() => handleEdit(selectedWorkflow)} className="gap-2">
                                        <Edit3 className="w-3.5 h-3.5" /> Edit
                                    </Button>
                                    <Button variant="ghost" size="icon" onClick={() => { if(confirm('Delete this workflow?')) deleteMutation.mutate(selectedWorkflow.id) }} className="h-9 w-9 text-slate-400 hover:text-destructive">
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex-1 overflow-auto p-8">
                    <div className="max-w-4xl mx-auto bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="p-8 lg:p-12">
                            {selectedWorkflow.description && (
                                <p className="text-slate-500 text-lg leading-relaxed mb-8 italic border-l-4 border-primary/20 pl-6">
                                    {selectedWorkflow.description}
                                </p>
                            )}
                            <MarkdownRenderer content={selectedWorkflow.content} className="max-w-none" />
                        </div>
                        <div className="px-8 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                            <div className="flex items-center gap-2 text-xs text-slate-400">
                                <div className="w-6 h-6 rounded-full bg-white border border-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-500 shadow-sm uppercase">
                                    {selectedWorkflow.owner?.full_name?.charAt(0) || selectedWorkflow.owner?.email.charAt(0) || '?'}
                                </div>
                                <span>Authored by {selectedWorkflow.owner?.full_name || selectedWorkflow.owner?.email}</span>
                            </div>
                            <div className="flex -space-x-2 overflow-hidden">
                                {selectedWorkflow.shared_with?.map(u => (
                                    <div key={u.id} className="w-6 h-6 rounded-full bg-white border border-slate-200 flex items-center justify-center text-[8px] font-bold text-slate-500 shadow-sm" title={`Shared with ${u.full_name}`}>
                                        {u.full_name?.charAt(0)}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col space-y-0 overflow-hidden bg-slate-50/50">
            <div className="p-6 bg-white border-b border-slate-200">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                            <BookOpen className="w-6 h-6 text-primary" />
                            Workflows
                        </h1>
                        <p className="text-sm text-slate-500 mt-1">
                            Standard Operating Procedures (SOPs) and best practices.
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="relative w-64">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <Input 
                                placeholder="Search procedures..." 
                                className="pl-9 h-10 border-slate-200 bg-white"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <Button onClick={handleCreate} className="gap-2 shadow-lg shadow-primary/20 h-10">
                            <Plus className="w-4 h-4" />
                            Create SOP
                        </Button>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-auto p-6 space-y-8 pb-12">
                {isLoading ? (
                    <div className="flex justify-center py-20">
                        <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredWorkflows?.map((wf) => {
                            const canManage = canManageWorkflow(wf);
                            return (
                                <Card 
                                    key={wf.id} 
                                    className="group hover:shadow-md transition-all cursor-pointer border-slate-200 hover:border-primary/30 flex flex-col relative"
                                    onClick={() => setSelectedWorkflow(wf)}
                                >
                                    <CardHeader className="pb-3">
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="w-10 h-10 bg-primary/5 rounded-lg flex items-center justify-center text-primary group-hover:bg-primary/10 transition-colors">
                                                <BookOpen className="w-5 h-5" />
                                            </div>
                                            {canManage && (
                                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-primary" onClick={(e) => { e.stopPropagation(); handleEdit(wf); }}>
                                                        <Edit3 className="w-3.5 h-3.5" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-destructive" onClick={(e) => { e.stopPropagation(); if(confirm('Delete this SOP?')) deleteMutation.mutate(wf.id); }}>
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                        <CardTitle className="text-lg group-hover:text-primary transition-colors flex items-center gap-2">
                                            {wf.title}
                                            {wf.is_public ? (
                                                <span title="Public"><Globe className="w-3 h-3 text-blue-500" /></span>
                                            ) : (
                                                <span title="Private"><Lock className="w-3 h-3 text-slate-400" /></span>
                                            )}
                                        </CardTitle>
                                        <CardDescription className="line-clamp-2 mt-1.5 min-h-[40px]">
                                            {wf.description || "No description provided."}
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent className="flex-1">
                                        <div className="flex items-center text-[10px] font-bold text-slate-400 gap-2 uppercase tracking-tight">
                                            <div className="w-5 h-5 rounded-full bg-slate-100 border border-white shadow-sm flex items-center justify-center shrink-0">
                                                <UserIcon className="w-2.5 h-2.5 text-slate-500" />
                                            </div>
                                            <span className="truncate">{wf.owner?.full_name || wf.owner?.email}</span>
                                        </div>
                                    </CardContent>
                                    <CardFooter className="pt-0 p-4 bg-slate-50/50 border-t border-slate-100">
                                        <Button variant="ghost" className="w-full justify-between group text-xs font-bold text-slate-600 hover:bg-transparent hover:text-primary px-0 h-auto">
                                            Read Procedure
                                            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                                        </Button>
                                    </CardFooter>
                                </Card>
                            );
                        })}

                        <Card 
                            onClick={handleCreate}
                            className="border-dashed border-2 border-slate-200 shadow-none bg-slate-50/50 flex flex-col items-center justify-center p-6 hover:bg-slate-50 hover:border-slate-300 transition-colors cursor-pointer min-h-[220px]"
                        >
                            <div className="h-12 w-12 rounded-full bg-white border border-slate-200 flex items-center justify-center mb-4 text-slate-400">
                                <FileText className="w-6 h-6" />
                            </div>
                            <h3 className="font-semibold text-slate-900">Draft New SOP</h3>
                            <p className="text-sm text-slate-500 text-center mt-1">
                                Document a new process for the library
                            </p>
                        </Card>
                    </div>
                )}
            </div>

            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-hidden flex flex-col p-0">
                    <DialogHeader className="px-6 pt-6 pb-2">
                        <DialogTitle>{editingWorkflow ? 'Edit SOP' : 'Create New SOP'}</DialogTitle>
                        <DialogDescription>
                            Define Visibility, Sharing, and Markdown Content.
                        </DialogDescription>
                    </DialogHeader>
                    
                    <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-b pb-6">
                            <div className="space-y-2">
                                <Label htmlFor="wf-title" className="text-xs font-bold uppercase text-slate-500">Title</Label>
                                <Input id="wf-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. CI/CD Pipeline Setup" />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="wf-desc" className="text-xs font-bold uppercase text-slate-500">Short Description</Label>
                                <Input id="wf-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Briefly explain what this SOP covers" />
                            </div>
                        </div>

                        <div className="space-y-4 border-b pb-6 bg-slate-50 p-4 rounded-lg border">
                            <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                <Share2 className="w-4 h-4" /> Sharing & Access
                            </h4>
                            <div className="flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <Label className="text-sm">Make Public</Label>
                                    <p className="text-[10px] text-muted-foreground">Visible to all users, but only you can edit.</p>
                                </div>
                                <Switch checked={isPublic} onCheckedChange={setIsPublic} />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-sm">Share Property (Co-Owners)</Label>
                                <AssigneeSelector
                                    selectedValues={sharedWithIds}
                                    onSelect={(id) => setSharedWithIds([...sharedWithIds, id])}
                                    onRemove={(id) => setSharedWithIds(sharedWithIds.filter(uid => uid !== id))}
                                    placeholder="Select users to share property with..."
                                />
                                <p className="text-[10px] text-muted-foreground">Shared users can also modify this workflow.</p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="wf-content" className="text-xs font-bold uppercase text-slate-500">Content (Markdown)</Label>
                                <Badge variant="secondary" className="text-[10px]">GFM Supported</Badge>
                            </div>
                            <div className="border rounded-md overflow-hidden bg-white">
                                <SimpleMDE
                                    value={content}
                                    onChange={setContent}
                                    options={mdeOptions}
                                />
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="px-6 py-4 bg-slate-50 border-t flex items-center justify-between">
                        <p className="text-[10px] text-slate-400 font-medium">Auto-saves are not enabled. Ensure you save your changes.</p>
                        <div className="flex gap-2">
                            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>Cancel</Button>
                            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending} className="gap-2">
                                {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                {editingWorkflow ? 'Update SOP' : 'Save Workflow'}
                            </Button>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
