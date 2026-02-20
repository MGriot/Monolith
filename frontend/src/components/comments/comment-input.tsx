import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send } from 'lucide-react';

interface CommentInputProps {
  onSubmit: (content: string) => Promise<void>;
  placeholder?: string;
  isSubmitting?: boolean;
  initialValue?: string;
  onCancel?: () => void;
  submitLabel?: string;
}

export function CommentInput({
  onSubmit,
  placeholder = "Write a comment...",
  isSubmitting = false,
  initialValue = "",
  onCancel,
  submitLabel = "Comment"
}: CommentInputProps) {
  const [content, setContent] = useState(initialValue);

  const handleSubmit = async () => {
    if (!content.trim()) return;
    await onSubmit(content);
    if (!initialValue) {
        setContent("");
    }
  };

  return (
    <div className="space-y-2">
      <Textarea
        placeholder={placeholder}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        className="min-h-[80px]"
        disabled={isSubmitting}
      />
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
        )}
        <Button size="sm" onClick={handleSubmit} disabled={!content.trim() || isSubmitting}>
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Send className="h-4 w-4 mr-2" />
          )}
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}
