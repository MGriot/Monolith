import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import 'react-tooltip/dist/react-tooltip.css';
import { cn } from '@/lib/utils';
import { Tooltip } from 'react-tooltip';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export default function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  return (
    <div className={cn("prose prose-sm max-w-none prose-slate", className)}>
      <ReactMarkdown 
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          // Support for tooltips via a custom "tipsy" style syntax or just links with titles
          a: ({ node, ...props }) => {
            if (props.title) {
              const id = `tooltip-${Math.random().toString(36).substr(2, 9)}`;
              return (
                <>
                  <span 
                    className="cursor-help border-b border-dotted border-primary/40 text-primary hover:text-primary/80 transition-colors"
                    data-tooltip-id={id}
                    data-tooltip-content={props.title}
                  >
                    {props.children}
                  </span>
                  <Tooltip id={id} className="z-50 !bg-slate-900 !text-[10px] !font-bold !px-2 !py-1 !rounded-md !opacity-100" />
                </>
              );
            }
            return <a {...props} />;
          }
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
