import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import WhiteboardEditor from '@/components/whiteboard-editor';
import { toast } from 'sonner';

export default function WhiteboardPage() {
    const { projectId, whiteboardId } = useParams();
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    const isNew = whiteboardId === 'new';

    const { data: whiteboard, isLoading, error } = useQuery({
        queryKey: ['whiteboard', whiteboardId],
        queryFn: async () => (await api.get(`/whiteboards/${whiteboardId}`)).data,
        enabled: !isNew && !!whiteboardId,
    });

    const handleSave = () => {
        // Invalidate project whiteboards list so it re-fetches when navigating back
        if (projectId) {
            queryClient.invalidateQueries({ queryKey: ['whiteboards', projectId] });
        }
    };

    const handleClose = () => {
        if (projectId) {
            navigate(`/projects/${projectId}`, { state: { activeTab: 'library' } });
        } else {
            navigate(-1);
        }
    };

    if (isLoading && !isNew) {
        return (
            <div className="flex h-screen items-center justify-center bg-slate-50">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    if (error && !isNew) {
        toast.error("Failed to load whiteboard details");
        return (
            <div className="flex flex-col h-screen items-center justify-center bg-slate-50 gap-4">
                <p className="text-destructive font-medium">Failed to load sketch</p>
                <Button onClick={handleClose}>Return to Project</Button>
            </div>
        );
    }

    return (
        <div className="h-screen w-screen flex flex-col bg-background overflow-hidden relative">
            <div className="flex-1 w-full h-full relative">
                <WhiteboardEditor
                    id={isNew ? undefined : whiteboard?.id}
                    projectId={projectId || ''}
                    initialData={isNew ? undefined : whiteboard?.data}
                    title={isNew ? undefined : whiteboard?.title}
                    onSave={handleSave}
                    onClose={handleClose}
                />
            </div>
        </div>
    );
}
