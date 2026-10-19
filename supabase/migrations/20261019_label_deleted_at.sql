-- Labels can be deleted in the label manager (soft delete, only when no live
-- expense uses one). Run once on a project set up before this change.

alter table mithril.labels add column if not exists deleted_at bigint;
