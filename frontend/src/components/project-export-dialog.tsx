import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Download, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { toast } from 'sonner';

interface ProjectExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  includeArchived?: boolean;
  title?: string;
}

export default function ProjectExportDialog({ 
  open, 
  onOpenChange, 
  includeArchived = false,
  title = "Export Projects"
}: ProjectExportDialogProps) {
  const [format, setFormat] = useState<'csv' | 'excel'>('excel');
  const [mode, setMode] = useState<'summary' | 'details'>('summary');
  const [isLoading, setIsLoading] = useState(false);

  const handleExport = async () => {
    setIsLoading(true);
    try {
      const response = await api.get(`/projects/export/all`, {
        params: {
          include_archived: includeArchived,
          mode,
          format
        },
        responseType: 'blob',
      });

      const ext = format === 'excel' ? 'xlsx' : 'csv';
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      const filename = `projects_export_${includeArchived ? 'archived' : 'active'}_${mode}_${new Date().toISOString().split('T')[0]}.${ext}`;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      
      toast.success(`Exported successfully as ${format.toUpperCase()}`);
      onOpenChange(false);
    } catch (error) {
      console.error('Export failed:', error);
      toast.error('Failed to export projects');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="w-5 h-5 text-primary" />
            {title}
          </DialogTitle>
          <DialogDescription>
            Choose the format and detail level for your export.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 py-4">
          <div className="space-y-2">
            <Label htmlFor="format">Format</Label>
            <Select value={format} onValueChange={(v: any) => setFormat(v)}>
              <SelectTrigger id="format">
                <SelectValue placeholder="Select format" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="excel">Excel (.xlsx)</SelectItem>
                <SelectItem value="csv">CSV (.csv)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="mode">Detail Level</Label>
            <Select value={mode} onValueChange={(v: any) => setMode(v)}>
              <SelectTrigger id="mode">
                <SelectValue placeholder="Select detail level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="summary">Summary (Project metadata only)</SelectItem>
                <SelectItem value="details">Details (Tasks & subtasks explosion)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={isLoading} className="gap-2">
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Generate Export
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
