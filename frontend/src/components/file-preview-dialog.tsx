import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Download, ExternalLink, FileText, Loader2, Table as TableIcon, Mail, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
import Papa from 'papaparse';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface FilePreviewDialogProps {
  url: string | null;
  onClose: () => void;
}

export default function FilePreviewDialog({ url, onClose }: FilePreviewDialogProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [previewContent, setPreviewContent] = useState<{ type: 'html' | 'md' | 'text', data: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!url) {
        setPreviewContent(null);
        setError(null);
        return;
    }

    const fileExtension = url.split(".").pop()?.toLowerCase();
    const isImage = ["jpg", "jpeg", "png", "gif", "webp"].includes(fileExtension || "");
    const isPdf = fileExtension === "pdf";

    if (isImage || isPdf) {
        setIsLoading(true);
        return;
    }

    const loadPreview = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await fetch(url);
            const blob = await response.blob();

            if (fileExtension === 'csv') {
                const text = await blob.text();
                Papa.parse(text, {
                    complete: (results: any) => {
                        const headers = results.data[0] as string[];
                        const rows = results.data.slice(1) as string[][];
                        let md = `| ${headers.join(' | ')} |\n`;
                        md += `| ${headers.map(() => '---').join(' | ')} |\n`;
                        rows.forEach(row => {
                            if (row.length === headers.length) {
                                md += `| ${row.join(' | ')} |\n`;
                            }
                        });
                        setPreviewContent({ type: 'md', data: md });
                        setIsLoading(false);
                    }
                });
            } else if (['xlsx', 'xls'].includes(fileExtension || '')) {
                const arrayBuffer = await blob.arrayBuffer();
                const workbook = XLSX.read(arrayBuffer);
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
                
                if (jsonData.length > 0) {
                    const headers = jsonData[0];
                    const rows = jsonData.slice(1);
                    let md = `### Sheet: ${firstSheetName}\n\n`;
                    md += `| ${headers.join(' | ')} |\n`;
                    md += `| ${headers.map(() => '---').join(' | ')} |\n`;
                    rows.forEach(row => {
                        md += `| ${row.map(cell => cell === null || cell === undefined ? '' : cell).join(' | ')} |\n`;
                    });
                    setPreviewContent({ type: 'md', data: md });
                }
                setIsLoading(false);
            } else if (['docx'].includes(fileExtension || '')) {
                const arrayBuffer = await blob.arrayBuffer();
                const result = await mammoth.convertToHtml({ arrayBuffer });
                setPreviewContent({ type: 'html', data: result.value });
                setIsLoading(false);
            } else if (['txt', 'log', 'sql', 'json'].includes(fileExtension || '')) {
                const text = await blob.text();
                setPreviewContent({ type: 'text', data: text });
                setIsLoading(false);
            } else if (['msg', 'eml'].includes(fileExtension || '')) {
                // Basic text fallback for emails since full parsing is complex client-side
                const text = await blob.text();
                setPreviewContent({ type: 'text', data: text });
                setIsLoading(false);
            } else {
                setPreviewContent(null);
                setIsLoading(false);
            }
        } catch (err) {
            console.error("Preview load error:", err);
            setError("Could not load preview for this file.");
            setIsLoading(false);
        }
    };

    loadPreview();
  }, [url]);

  if (!url) return null;

  const fileName = url.split("/").pop() || "File Preview";
  const fileExtension = url.split(".").pop()?.toLowerCase();
  const isImage = ["jpg", "jpeg", "png", "gif", "webp"].includes(fileExtension || "");
  const isPdf = fileExtension === "pdf";

  return (
    <Dialog open={!!url} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl w-[95vw] h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-4 border-b flex flex-row items-center justify-between space-y-0 bg-white z-20">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-slate-100 rounded">
              {['xlsx', 'xls', 'csv'].includes(fileExtension || '') ? <TableIcon className="w-4 h-4 text-emerald-600" /> : 
               ['msg', 'eml'].includes(fileExtension || '') ? <Mail className="w-4 h-4 text-blue-600" /> :
               <FileText className="w-4 h-4 text-slate-500" />}
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

        <div className="flex-1 bg-slate-100 relative flex items-center justify-center overflow-hidden">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-100/80 z-10 backdrop-blur-sm">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          )}

          {error ? (
             <div className="flex flex-col items-center gap-4 text-slate-500 p-8">
                <AlertTriangle className="w-12 h-12 text-amber-500" />
                <p className="text-sm font-medium">{error}</p>
                <Button variant="outline" asChild>
                    <a href={url} download>Download instead</a>
                </Button>
            </div>
          ) : isImage ? (
            <div className="w-full h-full flex items-center justify-center p-4 overflow-auto">
                <img
                src={url}
                alt={fileName}
                className="max-w-full max-h-full object-contain shadow-2xl bg-white rounded-lg"
                onLoad={() => setIsLoading(false)}
                />
            </div>
          ) : isPdf ? (
            <iframe
              src={`${url}#toolbar=0`}
              className="w-full h-full border-0 bg-white"
              onLoad={() => setIsLoading(false)}
            />
          ) : previewContent ? (
            <div className="w-full h-full bg-white overflow-auto p-8 lg:p-12">
                {previewContent.type === 'html' ? (
                    <div className="prose prose-slate max-w-none" dangerouslySetInnerHTML={{ __html: previewContent.data }} />
                ) : previewContent.type === 'md' ? (
                    <div className="prose prose-slate max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {previewContent.data}
                        </ReactMarkdown>
                    </div>
                ) : (
                    <pre className="text-xs font-mono whitespace-pre-wrap bg-slate-50 p-6 rounded-lg border border-slate-200 text-slate-700">
                        {previewContent.data}
                    </pre>
                )}
            </div>
          ) : !isLoading && (
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
