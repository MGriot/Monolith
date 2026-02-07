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
import { cn } from "@/lib/utils";
import type { Topic, WorkType } from "@/types";

const projectSchema = z.object({
  name: z.string().min(1, "Project name is required"),
  description: z.string().optional(),
  topic_id: z.string().optional().nullable(),
  type_id: z.string().optional().nullable(),
  topic_ids: z.array(z.string()).optional(),
  type_ids: z.array(z.string()).optional(),
  status: z.string().min(1, "Status is required"),
  start_date: z.string().optional(),
  due_date: z.string().optional(),
  tags: z.string().optional(),
  member_ids: z.array(z.string()).optional(),
});

export type ProjectFormValues = z.infer<typeof projectSchema>;

interface ProjectFormProps {
  initialValues?: Partial<ProjectFormValues>;
  onSubmit: (data: ProjectFormValues) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export default function ProjectForm({
  initialValues,
  onSubmit,
  onCancel,
  isLoading
}: ProjectFormProps) {
  const { data: topics } = useQuery({
    queryKey: ['metadata', 'topics'],
    queryFn: async () => (await api.get('/metadata/topics')).data,
  });

  const { data: workTypes } = useQuery({
    queryKey: ['metadata', 'work-types'],
    queryFn: async () => (await api.get('/metadata/work-types')).data,
  });

  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: async () => (await api.get('/users/')).data,
  });

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ProjectFormValues>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      status: "Todo",
      name: "",
      topic_id: null,
      type_id: null,
      topic_ids: [],
      type_ids: [],
      member_ids: [],
      ...initialValues,
    },
  });

  const statusValue = watch("status");
  const selectedTopicIds = watch("topic_ids") || [];
  const selectedTypeIds = watch("type_ids") || [];
  const selectedMemberIds = watch("member_ids") || [];

  const toggleTopic = (topicId: string) => {
    const current = [...selectedTopicIds];
    const index = current.indexOf(topicId);
    if (index > -1) {
      current.splice(index, 1);
    } else {
      current.push(topicId);
    }
    setValue("topic_ids", current);
  };

  const toggleType = (typeId: string) => {
    const current = [...selectedTypeIds];
    const index = current.indexOf(typeId);
    if (index > -1) {
      current.splice(index, 1);
    } else {
      current.push(typeId);
    }
    setValue("type_ids", current);
  };

  const toggleMember = (userId: string) => {
    const current = [...selectedMemberIds];
    const index = current.indexOf(userId);
    if (index > -1) {
      current.splice(index, 1);
    } else {
      current.push(userId);
    }
    setValue("member_ids", current);
  };

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
          <div className="flex flex-wrap gap-1.5 p-2 border rounded-md bg-slate-50/50 min-h-[40px]">
            {topics?.map((t: Topic) => (
              <button
                key={t.id}
                type="button"
                onClick={() => toggleTopic(t.id)}
                className={cn(
                  "px-2 py-0.5 rounded text-[10px] font-bold border transition-all",
                  selectedTopicIds.includes(t.id)
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                )}
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <Label>Types</Label>
          <div className="flex flex-wrap gap-1.5 p-2 border rounded-md bg-slate-50/50 min-h-[40px]">
            {workTypes?.map((t: WorkType) => (
              <button
                key={t.id}
                type="button"
                onClick={() => toggleType(t.id)}
                className={cn(
                  "px-2 py-0.5 rounded text-[10px] font-bold border transition-all",
                  selectedTypeIds.includes(t.id)
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                )}
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Project Members (Access Control)</Label>
        <div className="flex flex-wrap gap-1.5 p-2 border rounded-md bg-slate-50/50 min-h-[40px] max-h-[120px] overflow-y-auto">
          {users?.map((u: any) => (
            <button
              key={u.id}
              type="button"
              onClick={() => toggleMember(u.id)}
              className={cn(
                "px-2 py-0.5 rounded text-[10px] font-medium border transition-all flex items-center gap-1.5",
                selectedMemberIds.includes(u.id)
                  ? "bg-blue-600 text-white border-blue-600 shadow-sm shadow-blue-200"
                  : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
              )}
            >
              <div className={cn(
                "w-1.5 h-1.5 rounded-full",
                selectedMemberIds.includes(u.id) ? "bg-white" : "bg-slate-300"
              )} />
              {u.full_name || u.email}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-slate-500">Members selected here will have full visibility and access to this project.</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="status">Status</Label>
        <Select
          onValueChange={(value: string) => setValue("status", value)}
          defaultValue={statusValue}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Backlog">Backlog</SelectItem>
            <SelectItem value="Todo">Todo</SelectItem>
            <SelectItem value="In Progress">In Progress</SelectItem>
            <SelectItem value="On hold">On hold</SelectItem>
            <SelectItem value="Review">Review</SelectItem>
            <SelectItem value="Done">Done</SelectItem>
          </SelectContent>
        </Select>
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
          {isLoading ? "Saving..." : "Create Project"}
        </Button>
      </div>
    </form>
  );
}
