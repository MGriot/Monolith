import type EasyMDE from 'easymde';
import { toast } from 'sonner';
import api from '@/lib/api';

/** EasyMDE `imageUploadFunction`: stores a pasted or picked image through the comment upload endpoint. */
export async function uploadEditorImage(file: File, onSuccess: (url: string) => void, onError: (error: string) => void) {
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
}

/** Options shared by the markdown editors (comments, SOPs); `extraTools` go right after the image button. */
export function markdownEditorOptions({ minHeight, placeholder, extraTools = [] }: {
  minHeight: string;
  placeholder?: string;
  extraTools?: EasyMDE.ToolbarIcon[];
}): EasyMDE.Options {
  return {
    autofocus: false,
    spellChecker: false,
    ...(placeholder !== undefined && { placeholder }),
    status: false,
    minHeight,
    uploadImage: true,
    imageUploadFunction: uploadEditorImage,
    imageAccept: "image/png, image/jpeg, image/gif, image/webp",
    toolbar: [
      "bold", "italic", "heading", "|",
      "quote", "unordered-list", "ordered-list", "|",
      "link", "image", ...extraTools,
      "table", "|",
      "preview", "side-by-side", "fullscreen", "|",
      "guide"
    ],
  };
}
