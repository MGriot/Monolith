import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Download, ExternalLink, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

interface FilePreviewDialogProps {
  url: string | null;
  onClose: () => void;
}

export default function FilePreviewDialog({ url, onClose }: FilePreviewDialogProps) {
  const [isLoading, setIsLoading] = useState(true);

  if (!url) return null;

  const fileName = url.split("/").pop() || "File Preview";
  const fileExtension = url.split(".").pop()?.toLowerCase();
  const isImage = ["jpg", "jpeg", "png", "gif", "webp"].includes(fileExtension || "");
  const isPdf = fileExtension === "pdf";

  return (
    <Dialog open={!!url} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl w-[90vw] h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-4 border-b flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-slate-100 rounded">
              <FileText className="w-4 h-4 text-slate-500" />
            </div>
            <div>
              <DialogTitle className="text-sm font-bold truncate max-w-[300px]">
                {fileName}
              </DialogTitle>
              <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">
                {fileExtension} Preview
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 mr-8">
            <Button variant="outline" size="sm" asChild className="h-8 gap-2">
              <a href={url} download={fileName}>
                <Download className="w-3.5 h-3.5" />
                Download
              </a>
            </Button>
            <Button variant="outline" size="sm" asChild className="h-8 gap-2">
              <a href={url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-3.5 h-3.5" />
                Open Original
              </a>
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 bg-slate-100 relative flex items-center justify-center overflow-auto p-4">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-100 z-10">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          )}

          {isImage ? (
            <img
              src={url}
              alt={fileName}
              className="max-w-full max-h-full object-contain shadow-lg bg-white"
              onLoad={() => setIsLoading(false)}
            />
          ) : isPdf ? (
            <iframe
              src={`${url}#toolbar=0`}
              className="w-full h-full border-0 bg-white shadow-lg"
              onLoad={() => setIsLoading(false)}
            />
          ) : (
            <div className="flex flex-col items-center gap-4 text-slate-500">
              <FileText className="w-16 h-16 opacity-20" />
              <p className="text-sm font-medium">Preview not available for this file type.</p>
              <Button asChild>
                <a href={url} download>Download to View</a>
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
