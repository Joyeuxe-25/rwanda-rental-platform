PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`message` text NOT NULL,
	`related_entity_type` text,
	`related_entity_id` text,
	`event_key` text,
	`is_read` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`read_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "notifications_type_check" CHECK("__new_notifications"."type" IN ('RENTAL_REQUEST_SUBMITTED','NEW_RENTAL_REQUEST','RENTAL_REQUEST_ACCEPTED','RENTAL_REQUEST_REJECTED','RENTAL_REQUEST_CANCELLED','RENTAL_ACTIVATED','RENTAL_COMPLETED','RENTAL_TERMINATED','PAYMENT_INITIATED','PAYMENT_SUCCESSFUL','PAYMENT_RECEIVED','PAYMENT_FAILED','RENT_REMINDER'))
);
--> statement-breakpoint
INSERT INTO `__new_notifications`("id", "user_id", "type", "title", "message", "related_entity_type", "related_entity_id", "is_read", "created_at", "read_at") SELECT "id", "user_id", "type", "title", "message", "related_entity_type", "related_entity_id", "is_read", "created_at", "read_at" FROM `notifications`;--> statement-breakpoint
DROP TABLE `notifications`;--> statement-breakpoint
ALTER TABLE `__new_notifications` RENAME TO `notifications`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `notifications_user_event_unique` ON `notifications` (`user_id`,`event_key`) WHERE "notifications"."event_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `notifications_user_idx` ON `notifications` (`user_id`);--> statement-breakpoint
CREATE INDEX `notifications_read_idx` ON `notifications` (`is_read`);--> statement-breakpoint
CREATE INDEX `notifications_created_idx` ON `notifications` (`created_at`);--> statement-breakpoint
CREATE INDEX `notifications_user_read_idx` ON `notifications` (`user_id`,`is_read`);--> statement-breakpoint
CREATE INDEX `notifications_user_created_idx` ON `notifications` (`user_id`,`created_at`);