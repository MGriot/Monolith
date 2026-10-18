import { useRef, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";
import { AlertCircle, Database, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Eyebrow, Section } from "@/components/ui/section";
import { Field } from "@/components/ui/field";
import { cn } from "@/lib/utils";

export interface EditorTab {
  value: string;
  label: string;
  icon?: ReactNode;
  /** small count or progress next to the label, e.g. "2/5" */
  badge?: ReactNode;
  disabled?: boolean;
  /** tooltip explaining why the tab is disabled */
  disabledReason?: string;
  content: ReactNode;
}

interface EntityEditorProps {
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  /** title and description inputs, top of the left pane */
  main: ReactNode;
  /** properties rail on the right; build it from RailGroups */
  rail: ReactNode;
  tabs: EditorTab[];
  defaultTab?: string;
  /** left side of the footer: back links, archive / delete, timestamps */
  footerStart?: ReactNode;
  onCancel: () => void;
  submitLabel: string;
  isSubmitting?: boolean;
  /**
   * dialog: fills a DialogContent; the panes scroll and the footer stays fixed.
   * page: flows with the page; the footer becomes a sticky bar that only shows while the form is dirty.
   */
  variant?: "dialog" | "page";
  isDirty?: boolean;
}

const tabTriggerClass =
  "relative h-10 shrink-0 gap-1.5 rounded-none border-b-2 border-transparent bg-transparent px-2.5 text-xs font-medium text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none";

/**
 * Two-pane editor shared by tasks and projects: title, description and tabbed sections on the left,
 * a properties rail on the right, Cancel / Submit in the footer. Ctrl/Cmd+Enter submits.
 */
export function EntityEditor({
  onSubmit,
  main,
  rail,
  tabs,
  defaultTab,
  footerStart,
  onCancel,
  submitLabel,
  isSubmitting,
  variant = "dialog",
  isDirty,
}: EntityEditorProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const isPage = variant === "page";

  const onKeyDown = (e: KeyboardEvent<HTMLFormElement>) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      formRef.current?.requestSubmit();
    }
  };

  const tabsBlock = tabs.length > 0 && (
    <Tabs
      defaultValue={defaultTab ?? tabs[0].value}
      className={cn("flex flex-col", !isPage && "min-h-0 md:col-start-1 md:row-start-2")}
    >
      <div className={cn("shrink-0 border-b", isPage ? "px-5" : "px-6")}>
        <TabsList className="scrollbar-hide h-auto w-full justify-start gap-0.5 overflow-x-auto rounded-none bg-transparent p-0">
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              disabled={tab.disabled}
              title={tab.disabled ? tab.disabledReason : undefined}
              className={tabTriggerClass}
            >
              {tab.icon} {tab.label}
              {tab.badge !== undefined && tab.badge !== null && tab.badge !== "" && (
                <span className="rounded-full bg-muted px-1.5 text-[11px] font-normal leading-4 tabular-nums text-fg-soft">{tab.badge}</span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      <div className={cn(isPage ? "px-5 py-5" : "px-6 py-5 md:min-h-0 md:flex-1 md:overflow-y-auto")}>
        {tabs.map((tab) => (
          <TabsContent key={tab.value} value={tab.value} className="mt-0 space-y-5">
            {tab.content}
          </TabsContent>
        ))}
      </div>
    </Tabs>
  );

  const actions = (
    <div className="flex justify-end gap-2">
      <Button type="button" variant="ghost" onClick={onCancel}>
        {isPage ? "Discard" : "Cancel"}
      </Button>
      <Button type="submit" disabled={isSubmitting} className="min-w-[120px]">
        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : submitLabel}
      </Button>
    </div>
  );

  if (isPage) {
    return (
      <form ref={formRef} onSubmit={onSubmit} onKeyDown={onKeyDown} className="relative">
        <div className="overflow-hidden rounded-xl border bg-card lg:grid lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="min-w-0">
            <div className="space-y-3 px-5 pb-3 pt-5">{main}</div>
            {tabsBlock}
          </div>
          <aside className="space-y-5 border-t bg-subtle/40 px-5 py-5 lg:border-l lg:border-t-0">{rail}</aside>
        </div>
        {/* room for the bar under the card, only while it shows */}
        {isDirty && <div className="h-[4.5rem]" aria-hidden />}
        {/* zero-height sticky anchor: the bar floats over the page instead of reserving space while hidden */}
        <div className="sticky bottom-4 z-10 h-0">
          <div
            className={cn(
              "absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 rounded-xl border bg-background/95 px-4 py-3 shadow-lg backdrop-blur transition-all",
              isDirty ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"
            )}
            aria-hidden={!isDirty}
          >
            <span className="text-sm text-muted-foreground">Unsaved changes</span>
            {actions}
          </div>
        </div>
      </form>
    );
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} onKeyDown={onKeyDown} className="flex min-h-0 flex-1 flex-col">
      {/* Mobile: one scrolling column (title, properties, tabs). md+: title and tabs on the left, the rail on the right, each scrolling on its own. */}
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto md:grid-cols-[minmax(0,1fr)_20rem] md:grid-rows-[auto_minmax(0,1fr)] md:overflow-hidden">
        <div className="space-y-3 px-6 pb-3 pt-5 md:col-start-1 md:row-start-1">{main}</div>
        <aside className="space-y-5 border-y bg-subtle/40 px-5 py-4 md:col-start-2 md:row-span-2 md:row-start-1 md:overflow-y-auto md:border-y-0 md:border-l md:py-5">
          {rail}
        </aside>
        {tabsBlock}
      </div>
      <div className="flex shrink-0 flex-col-reverse gap-3 border-t bg-subtle/40 px-6 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">{footerStart}</div>
        {actions}
      </div>
    </form>
  );
}

/** A labelled group of fields in the properties rail. */
export function RailGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-3">
      <Eyebrow>{title}</Eyebrow>
      {children}
    </div>
  );
}

/** Large borderless title input with an optional error line. */
export function EditorTitle({
  id,
  placeholder,
  registration,
  error,
}: {
  id: string;
  placeholder: string;
  registration: UseFormRegisterReturn;
  error?: string;
}) {
  return (
    <div>
      <Label htmlFor={id} className="sr-only">{placeholder}</Label>
      <Input
        id={id}
        placeholder={placeholder}
        autoComplete="off"
        className="h-auto border-0 bg-transparent px-0 py-1 text-xl font-semibold shadow-none placeholder:text-fg-ghost focus-visible:ring-0 md:text-xl"
        {...registration}
      />
      {error && <p className="mt-1 text-xs font-medium text-danger">{error}</p>}
    </div>
  );
}

function RangeField({ label, value, registration }: { label: string; value: number | undefined; registration: UseFormRegisterReturn }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
        <span className="text-xs font-semibold tabular-nums">{value || 1} / 5</span>
      </div>
      <input type="range" min="1" max="5" aria-label={label} className="w-full cursor-pointer accent-warning" {...registration} />
    </div>
  );
}

/** Risk (probability × impact) and cost (budget vs actual), shared by the task and project editors. */
export function RiskCostPanel({
  probability,
  impact,
  budget,
  realCost,
  fields,
  idPrefix = "",
}: {
  probability?: number;
  impact?: number;
  budget: number;
  realCost: number;
  fields: {
    probability: UseFormRegisterReturn;
    impact: UseFormRegisterReturn;
    budget: UseFormRegisterReturn;
    realCost: UseFormRegisterReturn;
  };
  idPrefix?: string;
}) {
  const exposure = (probability || 1) * (impact || 1);
  const exposureTone = exposure <= 4 ? "bg-success-soft text-success" : exposure <= 9 ? "bg-warning-soft text-warning" : "bg-danger-soft text-danger";
  const remaining = budget - realCost;
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Section icon={<AlertCircle className="h-4 w-4 text-warning" />} title="Risk" description="Probability × impact">
        <div className="space-y-4">
          <RangeField label="Probability" value={probability} registration={fields.probability} />
          <RangeField label="Impact" value={impact} registration={fields.impact} />
        </div>
        <div className={cn("flex items-center justify-between rounded-md px-3 py-2", exposureTone)}>
          <span className="text-xs font-medium">Exposure score</span>
          <span className="text-lg font-semibold tabular-nums">{exposure}</span>
        </div>
      </Section>

      <Section icon={<Database className="h-4 w-4 text-info" />} title="Cost">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          <Field label="Planned budget ($)" htmlFor={`${idPrefix}budget`}>
            <Input id={`${idPrefix}budget`} type="number" step="0.01" className="h-9 tabular-nums" {...fields.budget} />
          </Field>
          <Field label="Actual cost ($)" htmlFor={`${idPrefix}real_cost`}>
            <Input id={`${idPrefix}real_cost`} type="number" step="0.01" className="h-9 tabular-nums" {...fields.realCost} />
          </Field>
        </div>
        {budget > 0 && (
          <div className="h-1.5 overflow-hidden rounded-full bg-hairline" aria-hidden>
            <div
              className={cn("h-full rounded-full", remaining < 0 ? "bg-danger" : "bg-success")}
              style={{ width: `${Math.min(100, (realCost / budget) * 100)}%` }}
            />
          </div>
        )}
        <div className={cn("flex items-center justify-between rounded-md px-3 py-2", remaining < 0 ? "bg-danger-soft text-danger" : "bg-success-soft text-success")}>
          <span className="text-xs font-medium">{remaining < 0 ? "Over budget" : "Remaining"}</span>
          <span className="text-lg font-semibold tabular-nums">
            {remaining < 0 ? "-" : ""}${Math.abs(remaining).toLocaleString()}
          </span>
        </div>
      </Section>
    </div>
  );
}
