import { FileText, BookOpen, GitBranch, ArrowRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function WorkflowsPage() {
    const workflows = [
        {
            id: 1,
            title: "New Project Onboarding",
            description: "Standard procedure for initializing a new client project, including repository setup and kickoff meeting.",
            category: "Management",
            steps: 8,
            author: "Admin"
        },
        {
            id: 2,
            title: "Code Review Guidelines",
            description: "Checklist for reviewing pull requests, ensuring code quality, security, and style compliance.",
            category: "Development",
            steps: 12,
            author: "Tech Lead"
        },
        {
            id: 3,
            title: "Deployment to Staging",
            description: "Step-by-step guide for deploying the application to the staging environment for QA testing.",
            category: "DevOps",
            steps: 5,
            author: "DevOps Team"
        },
        {
            id: 4,
            title: "Incident Response",
            description: "Protocol for handling production incidents, including communication templates and escalation paths.",
            category: "Operations",
            steps: 15,
            author: "SRE"
        }
    ];

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">Workflow Library</h1>
                    <p className="text-slate-500 mt-2">
                        Standard Operating Procedures (SOPs) and best practices for the team.
                    </p>
                </div>
                <Button>
                    <BookOpen className="w-4 h-4 mr-2" />
                    Create Workflow
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {workflows.map((workflow) => (
                    <Card key={workflow.id} className="hover:shadow-md transition-shadow cursor-pointer border-slate-200">
                        <CardHeader className="pb-3">
                            <div className="flex justify-between items-start mb-2">
                                <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200">
                                    {workflow.category}
                                </Badge>
                                <Badge variant="secondary" className="bg-blue-50 text-blue-700">
                                    {workflow.steps} Steps
                                </Badge>
                            </div>
                            <CardTitle className="text-lg">{workflow.title}</CardTitle>
                            <CardDescription className="line-clamp-2 mt-1.5">
                                {workflow.description}
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center text-xs text-slate-500 gap-2">
                                <UserIcon name={workflow.author} />
                                <span>Authored by {workflow.author}</span>
                            </div>
                        </CardContent>
                        <CardFooter className="pt-0">
                            <Button variant="ghost" className="w-full justify-between group text-slate-600 hover:text-blue-600">
                                View Procedure
                                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                            </Button>
                        </CardFooter>
                    </Card>
                ))}

                {/* Placeholder for 'Add New' visual cue */}
                <Card className="border-dashed border-2 border-slate-200 shadow-none bg-slate-50/50 flex flex-col items-center justify-center p-6 hover:bg-slate-50 hover:border-slate-300 transition-colors cursor-pointer min-h-[220px]">
                    <div className="h-12 w-12 rounded-full bg-white border border-slate-200 flex items-center justify-center mb-4 text-slate-400">
                        <FileText className="w-6 h-6" />
                    </div>
                    <h3 className="font-semibold text-slate-900">Draft New SOP</h3>
                    <p className="text-sm text-slate-500 text-center mt-1">
                        Document a new process for the library
                    </p>
                </Card>
            </div>
        </div>
    );
}

function UserIcon({ name }: { name: string }) {
    const initials = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    return (
        <div className="h-6 w-6 rounded-full bg-slate-100 border border-white shadow-sm flex items-center justify-center text-[10px] font-bold text-slate-500">
            {initials}
        </div>
    );
}
