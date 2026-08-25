CREATE TABLE `payment_provider_events` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`external_event_id` text,
	`external_transaction_id` text,
	`payment_id` text,
	`event_status` text,
	`processing_status` text DEFAULT 'RECEIVED' NOT NULL,
	`processing_error_code` text,
	`payload_hash` text NOT NULL,
	`received_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`processed_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE cascade ON DELETE set null,
	CONSTRAINT "ppe_provider_check" CHECK("payment_provider_events"."provider" IN ('MTN_MOMO', 'AIRTEL_MONEY')),
	CONSTRAINT "ppe_processing_check" CHECK("payment_provider_events"."processing_status" IN ('RECEIVED', 'PROCESSED', 'UNMATCHED', 'FAILED'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ppe_provider_payload_unique` ON `payment_provider_events` (`provider`,`payload_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `ppe_provider_event_unique` ON `payment_provider_events` (`provider`,`external_event_id`) WHERE "payment_provider_events"."external_event_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `ppe_payment_idx` ON `payment_provider_events` (`payment_id`);--> statement-breakpoint
CREATE INDEX `ppe_txn_idx` ON `payment_provider_events` (`provider`,`external_transaction_id`);--> statement-breakpoint
CREATE INDEX `ppe_processing_idx` ON `payment_provider_events` (`processing_status`);