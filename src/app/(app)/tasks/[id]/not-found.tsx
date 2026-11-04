import { EmptyState, ButtonLink } from "@/components/ui";

export default function TaskNotFound() {
  return (
    <EmptyState
      title="Task not found"
      body="It may have been removed, or it belongs to a unit you don't have access to."
      action={<ButtonLink href="/">Back to my tasks</ButtonLink>}
    />
  );
}
