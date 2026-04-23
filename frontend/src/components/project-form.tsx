import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RichDropdown, type RichDropdownItem } from "@/components/ui/rich-dropdown";
import { AssigneeSelector } from "@/components/assignee-selector";
import type { Topic, WorkType, Project } from "@/types";

const projectSchema = z.object({
  name: z.string().min(1, "Project name is required"),
  description: z.string().optional(),
  topic_ids: z.array(z.string()).optional(),
  type_ids: z.array(z.string()).optional(),
  status: z.string().min(1, "Status is required"),
  priority: z.string().min(1, "Priority is required"),
  start_date: z.string().optional().nullable(),
  due_date: z.string().optional().nullable(),
  tags: z.string().optional(),
  member_ids: z.array(z.string()).optional(),
  budget: z.number().optional(),
  real_cost: z.number().optional(),
  risk_probability: z.number().min(1).max(5).optional(),
  risk_impact: z.number().min(1).max(5).optional(),
});

export type ProjectFormValues = z.infer<typeof projectSchema>;

interface ProjectFormProps {
  initialValues?: Partial<Project> & { topic_ids?: string[], type_ids?: string[], member_ids?: string[] };
  onSubmit: (data: ProjectFormValues) => void;
  onCancel: () => void;
  isLoading?: boolean;
  projectId?: string;
}

export default function ProjectForm({
  initialValues,
  onSubmit,
  onCancel,
  isLoading,
  projectId
}: ProjectFormProps) {
  const { data: topics, isLoading: topicsLoading } = useQuery({
    queryKey: ['metadata', 'topics', projectId],
    queryFn: async () => (await api.get('/metadata/topics', {
      params: { project_id: projectId, include_global: true }
    })).data,
  });

  const { data: workTypes, isLoading: typesLoading } = useQuery({
    queryKey: ['metadata', 'work-types', projectId],
    queryFn: async () => (await api.get('/metadata/work-types', {
      params: { project_id: projectId, include_global: true }
    })).data,
  });

  const processedInitialValues = useMemo(() => {
    if (!initialValues) return { 
        status: "Todo", 
        priority: "Medium",
        name: "", 
        topic_ids: [], 
        type_ids: [], 
        member_ids: [],
        budget: 0,
        real_cost: 0,
        risk_probability: 1,
        risk_impact: 1
    };
    
    return {
        ...initialValues,
        status: initialValues.status || "Todo",
        priority: initialValues.priority || "Medium",
        name: initialValues.name || "",
        topic_ids: initialValues.topic_ids || initialValues.topics?.map(t => t.id) || [],
        type_ids: initialValues.type_ids || initialValues.types?.map(t => t.id) || [],
        member_ids: initialValues.member_ids || initialValues.members?.map(m => m.id) || [],
        start_date: initialValues.start_date ? new Date(initialValues.start_date).toISOString().split('T')[0] : "",
        due_date: initialValues.due_date ? new Date(initialValues.due_date).toISOString().split('T')[0] : "",
        tags: Array.isArray(initialValues.tags) ? initialValues.tags.join(', ') : initialValues.tags || "",
        budget: initialValues.budget || 0,
        real_cost: initialValues.real_cost || 0,
        risk_probability: initialValues.risk_probability || 1,
        risk_impact: initialValues.risk_impact || 1,
    };
  }, [initialValues]);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ProjectFormValues>({
    resolver: zodResolver(projectSchema),
    defaultValues: processedInitialValues as any,
  });

  const statusValue = watch("status");
  const selectedTopicIds = watch("topic_ids") || [];
  const selectedTypeIds = watch("type_ids") || [];
  const selectedMemberIds = watch("member_ids") || [];

  const toggleItem = (field: "topic_ids" | "type_ids" | "member_ids", id: string) => {
    const current = [...(watch(field) || [])];
    const index = current.indexOf(id);
    if (index > -1) {
      current.splice(index, 1);
    } else {
      current.push(id);
    }
    setValue(field, current);
  };

  const removeItem = (field: "topic_ids" | "type_ids" | "member_ids", id: string) => {
    const current = [...(watch(field) || [])];
    const filtered = current.filter(item => item !== id);
    setValue(field, filtered);
  };

  // Transformation for RichDropdown
  const topicItems: RichDropdownItem[] = useMemo(() => 
    topics?.map((t: Topic) => ({ id: t.id, label: t.name, color: t.color })) || []
  , [topics]);

  const typeItems: RichDropdownItem[] = useMemo(() => 
    workTypes?.map((t: WorkType) => ({ id: t.id, label: t.name, color: t.color })) || []
  , [workTypes]);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Project Name</Label>
        <Input id="name" {...register("name")} placeholder="e.g. Website Redesign" />
        {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Topics</Label>
          <RichDropdown 
            items={topicItems}
            selectedValues={selectedTopicIds}
            onSelect={(id) => toggleItem("topic_ids", id)}
            onRemove={(id) => removeItem("topic_ids", id)}
            multi={true}
            isLoading={topicsLoading}
            placeholder="Select topics..."
          />
        </div>
        <div className="space-y-2">
          <Label>Types</Label>
          <RichDropdown 
            items={typeItems}
            selectedValues={selectedTypeIds}
            onSelect={(id) => toggleItem("type_ids", id)}
            onRemove={(id) => removeItem("type_ids", id)}
            multi={true}
            isLoading={typesLoading}
            placeholder="Select types..."
          />
        </div>
      </div>

      <div className="space-y-2">
        <AssigneeSelector 
            label="Project Members (Access Control)"
            selectedValues={selectedMemberIds}
            onSelect={(id) => toggleItem("member_ids", id)}
            onRemove={(id) => removeItem("member_ids", id)}
            placeholder="Assign members..."
        />
        <p className="text-[10px] text-slate-500">Members selected here will have full visibility and access to this project.</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="status">Status</Label>
          <Select
            onValueChange={(value: string) => setValue("status", value)}
            defaultValue={statusValue}
          >
            <SelectTrigger className="h-10">
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Backlog">Backlog</SelectItem>
              <SelectItem value="Todo">Todo</SelectItem>
              <SelectItem value="In Progress">In Progress</SelectItem>
              <SelectItem value="On hold">On Hold</SelectItem>
              <SelectItem value="Review">Review</SelectItem>
              <SelectItem value="Done">Done</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="priority">Priority</Label>
          <Select
            onValueChange={(value: string) => setValue("priority", value)}
            defaultValue={watch("priority")}
          >
            <SelectTrigger className="h-10">
              <SelectValue placeholder="Select priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Low">Low</SelectItem>
              <SelectItem value="Medium">Medium</SelectItem>
              <SelectItem value="High">High</SelectItem>
              <SelectItem value="Critical">Critical</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="p-4 rounded-xl border border-amber-100 bg-amber-50/30 space-y-4">
          <h4 className="text-[10px] font-black uppercase text-amber-600 flex items-center gap-1.5 tracking-widest">
              Risk Management
          </h4>
          <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                  <div className="flex justify-between items-center">
                      <Label className="text-[10px] text-slate-500 uppercase font-bold">Probability (1-5)</Label>
                      <span className="text-[10px] font-black bg-white px-2 py-0.5 rounded border">{watch("risk_probability")}</span>
                  </div>
                  <input 
                      type="range" 
                      min="1" max="5" 
                      className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-primary"
                      {...register("risk_probability", { valueAsNumber: true })}
                  />
              </div>
              <div className="space-y-2">
                  <div className="flex justify-between items-center">
                      <Label className="text-[10px] text-slate-500 uppercase font-bold">Impact (1-5)</Label>
                      <span className="text-[10px] font-black bg-white px-2 py-0.5 rounded border">{watch("risk_impact")}</span>
                  </div>
                  <input 
                      type="range" 
                      min="1" max="5" 
                      className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-primary"
                      {...register("risk_impact", { valueAsNumber: true })}
                  />
              </div>
          </div>
      </div>

      <div className="p-4 rounded-xl border border-blue-100 bg-blue-50/30 space-y-4">
          <h4 className="text-[10px] font-black uppercase text-blue-600 flex items-center gap-1.5 tracking-widest">
              Financial Strategy
          </h4>
          <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                  <Label className="text-[10px] text-slate-500 uppercase font-bold">Total Budget ($)</Label>
                  <Input 
                      type="number" 
                      step="0.01"
                      {...register("budget", { valueAsNumber: true })}
                      className="h-9 bg-white"
                  />
              </div>
              <div className="space-y-1.5">
                  <Label className="text-[10px] text-slate-500 uppercase font-bold">Actual Expenditure ($)</Label>
                  <Input 
                      type="number" 
                      step="0.01"
                      {...register("real_cost", { valueAsNumber: true })}
                      className="h-9 bg-white"
                  />
              </div>
          </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="start_date">Start Date</Label>
          <Input id="start_date" type="date" {...register("start_date")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="due_date">Due Date</Label>
          <Input id="due_date" type="date" {...register("due_date")} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description (Markdown supported)</Label>
        <Textarea
          id="description"
          {...register("description")}
          placeholder="Describe the project goals..."
          className="min-h-[100px]"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="tags">Tags (comma separated)</Label>
        <Input id="tags" {...register("tags")} placeholder="e.g. critical, web, internal" />
      </div>

      <div className="flex justify-end gap-3 pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? "Saving..." : "Save Project"}
        </Button>
      </div>
    </form>
  );
}
