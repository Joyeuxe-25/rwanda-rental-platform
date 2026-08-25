ALTER TABLE `payments` ADD `idempotency_key` text;--> statement-breakpoint
CREATE UNIQUE INDEX `payments_tenant_idempotency_unique` ON `payments` (`tenant_id`,`idempotency_key`) WHERE "payments"."idempotency_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `payments_landlord_idx` ON `payments` (`landlord_id`);