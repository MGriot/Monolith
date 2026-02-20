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
          {isLoading ? "Saving..." : "Save Project"}
        </Button>
      </div>
    </form>
  );
}
