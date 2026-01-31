import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
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

const projectSchema = z.object({
  name: z.string().min(1, "Project name is required"),
  description: z.string().optional(),
  topic: z.string().min(1, "Topic is required"),
  type: z.string().min(1, "Type is required"),
  status: z.string().default("Todo"),
  start_date: z.string().optional(),
  due_date: z.string().optional(),
  tags: z.string().optional(),
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
      ...initialValues,
    },
  });

  const statusValue = watch("status");

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Project Name</Label>
        <Input id="name" {...register("name")} placeholder="e.g. Website Redesign" />
        {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="topic">Topic</Label>
          <Input id="topic" {...register("topic")} placeholder="e.g. Marketing" />
          {errors.topic && <p className="text-xs text-destructive">{errors.topic.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="type">Type</Label>
          <Input id="type" {...register("type")} placeholder="e.g. Feature" />
          {errors.type && <p className="text-xs text-destructive">{errors.type.message}</p>}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="status">Status</Label>
        <Select 
          onValueChange={(value) => setValue("status", value)} 
          defaultValue={statusValue}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Backlog">Backlog</SelectItem>
            <SelectItem value="Todo">Todo</SelectItem>
            <SelectItem value="In Progress">In Progress</SelectItem>
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
