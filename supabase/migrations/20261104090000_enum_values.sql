-- New enum values. Separate migration: a value added by ALTER TYPE can't be used in the same transaction.
alter type public.task_status add value if not exists 'submitted' before 'done';
alter type public.recurrence_frequency add value if not exists 'daily' before 'weekly';
