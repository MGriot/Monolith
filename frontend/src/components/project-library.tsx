import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import {
    Plus,
    Trash2,
    Edit3,
    Loader2,
    Search,
    Image as ImageIcon,
    Layout,
    Settings
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNavigate } from 'react-router-dom';

import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';

interface ProjectLibraryProps {
    projectId: string;
    onOpenSettings?: () => void;
}

export default function ProjectLibrary({ projectId, onOpenSettings }: ProjectLibraryProps) {
    const queryClient = useQueryClient();
    const [searchTerm, setSearchTerm] = useState('');
    const navigate = useNavigate();

    const { data: whiteboards, isLoading } = useQuery({
        queryKey: ['whiteboards', projectId],
        queryFn: async () => (await api.get(`/whiteboards/?project_id=${projectId}`)).data,
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => api.delete(`/whiteboards/${id}`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['whiteboards', projectId] });
            toast.success('Sketch deleted');
        }
    });

    const handleCreate = () => {
        navigate(`/projects/${projectId}/whiteboards/new`);
    };

    const handleEdit = (wb: any) => {
        navigate(`/projects/${projectId}/whiteboards/${wb.id}`);
    };

    const filteredWhiteboards = whiteboards?.filter((wb: any) =>
        wb.title.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-4">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                        placeholder="Search sketches..."
                        className="pl-9"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="flex items-center gap-2">
                    {onOpenSettings && (
                        <Button variant="outline" onClick={onOpenSettings} className="gap-2">
                            <Settings className="w-4 h-4" /> Project Settings
                        </Button>
                    )}
                    <Button onClick={handleCreate} className="gap-2">
                        <Plus className="w-4 h-4" /> New Sketch
                    </Button>
                </div>
            </div>

            {isLoading ? (
                <div className="flex justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredWhiteboards?.map((wb: any) => (
                        <Card key={wb.id} className="group hover:shadow-md transition-all border-slate-200">
                            <CardHeader className="p-4 pb-2">
                                <div className="flex justify-between items-start">
                                    <div className="w-8 h-8 bg-blue-50 rounded flex items-center justify-center text-blue-600">
                                        <Layout className="w-4 h-4" />
                                    </div>
                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(wb)}>
                                            <Edit3 className="w-3.5 h-3.5" />
                                        </Button>
                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => { if (confirm('Delete this sketch?')) deleteMutation.mutate(wb.id); }}>
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </Button>
                                    </div>
                                </div>
                                <CardTitle className="text-sm font-bold mt-2 truncate">{wb.title}</CardTitle>
                                <CardDescription className="text-[10px]">
                                    Updated {format(parseISO(wb.updated_at), 'MMM d, yyyy')}
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="p-4 pt-0">
                                <div className="aspect-video bg-slate-50 rounded border border-slate-100 flex items-center justify-center text-slate-300">
                                    {wb.preview_image ? (
                                        <img src={wb.preview_image} alt={wb.title} className="w-full h-full object-contain" />
                                    ) : (
                                        <ImageIcon className="w-8 h-8" />
                                    )}
                                </div>
                            </CardContent>
                            <CardFooter className="p-3 bg-slate-50/50 border-t border-slate-100">
                                <Button variant="ghost" className="w-full h-7 text-[10px] font-bold" onClick={() => handleEdit(wb)}>
                                    Open Editor
                                </Button>
                            </CardFooter>
                        </Card>
                    ))}

                    <Card
                        onClick={handleCreate}
                        className="border-dashed border-2 border-slate-200 shadow-none bg-slate-50/50 flex flex-col items-center justify-center p-6 hover:bg-slate-50 hover:border-slate-300 transition-colors cursor-pointer min-h-[180px]"
                    >
                        <Plus className="w-6 h-6 text-slate-400 mb-2" />
                        <h3 className="text-sm font-semibold text-slate-900">New Whiteboard</h3>
                    </Card>
                </div>
            )}
        </div>
    );
}
