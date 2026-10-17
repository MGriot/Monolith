import ProjectIdeas from '@/components/project-ideas';
import { useTitle } from '@/context/title-context';
import { useEffect } from 'react';
import { Lightbulb } from 'lucide-react';

export default function IdeasPage() {
  const { setTitle, setIcon } = useTitle();

  useEffect(() => {
    setTitle('Universal Ideas');
    setIcon(Lightbulb);
    return () => {
      setTitle(null);
      setIcon(null);
    };
  }, [setTitle, setIcon]);

  return (
    <div className="h-full flex flex-col bg-subtle/50 overflow-hidden">
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-7xl mx-auto space-y-8">
            <header className="flex flex-col gap-1">
                <h1 className="text-2xl font-bold text-foreground tracking-tight">Ideas Hub</h1>
                <p className="text-sm text-muted-foreground">Collaborate on new concepts across all your projects and authored ideas.</p>
            </header>

            <ProjectIdeas />
        </div>
      </div>
    </div>
  );
}
