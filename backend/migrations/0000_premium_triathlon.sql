CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`role` text NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`email` text NOT NULL,
	`phone` text NOT NULL,
	`password_hash` text NOT NULL,
	`profile_image_key` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "users_role_check" CHECK("users"."role" IN ('LANDLORD', 'TENANT'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_phone_unique` ON `users` (`phone`);--> statement-breakpoint
CREATE INDEX `users_role_idx` ON `users` (`role`);--> statement-breakpoint
CREATE TABLE `properties` (
	`id` text PRIMARY KEY NOT NULL,
	`landlord_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`property_type` text NOT NULL,
	`bedrooms` integer DEFAULT 0 NOT NULL,
	`bathrooms` integer DEFAULT 0 NOT NULL,
	`monthly_rent` integer NOT NULL,
	`security_deposit` integer DEFAULT 0 NOT NULL,
	`additional_charges` integer DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'RWF' NOT NULL,
	`province` text NOT NULL,
	`district` text NOT NULL,
	`sector` text NOT NULL,
	`cell` text,
	`village_or_area` text,
	`additional_location` text,
	`amenities` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'AVAILABLE' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`landlord_id`) REFERENCES `users`(`id`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "properties_type_check" CHECK("properties"."property_type" IN ('APARTMENT', 'HOUSE', 'ROOM', 'STUDIO', 'OTHER')),
	CONSTRAINT "properties_status_check" CHECK("properties"."status" IN ('AVAILABLE', 'OCCUPIED', 'UNAVAILABLE')),
	CONSTRAINT "properties_rent_nonneg_check" CHECK("properties"."monthly_rent" >= 0),
	CONSTRAINT "properties_deposit_nonneg_check" CHECK("properties"."security_deposit" >= 0)
);
--> statement-breakpoint
CREATE INDEX `properties_landlord_idx` ON `properties` (`landlord_id`);--> statement-breakpoint
CREATE INDEX `properties_status_idx` ON `properties` (`status`);--> statement-breakpoint
CREATE INDEX `properties_type_idx` ON `properties` (`property_type`);--> statement-breakpoint
CREATE INDEX `properties_district_idx` ON `properties` (`district`);--> statement-breakpoint
CREATE INDEX `properties_sector_idx` ON `properties` (`sector`);--> statement-breakpoint
CREATE INDEX `properties_rent_idx` ON `properties` (`monthly_rent`);--> statement-breakpoint
CREATE TABLE `property_images` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`object_key` text NOT NULL,
	`url` text,
	`is_primary` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `property_images_property_idx` ON `property_images` (`property_id`);--> statement-breakpoint
CREATE INDEX `property_images_primary_idx` ON `property_images` (`property_id`,`is_primary`);--> statement-breakpoint
CREATE TABLE `rental_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`property_id` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`message` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `users`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "rental_requests_status_check" CHECK("rental_requests"."status" IN ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED'))
);
--> statement-breakpoint
CREATE INDEX `rental_requests_tenant_idx` ON `rental_requests` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `rental_requests_property_idx` ON `rental_requests` (`property_id`);--> statement-breakpoint
CREATE INDEX `rental_requests_status_idx` ON `rental_requests` (`status`);--> statement-breakpoint
CREATE TABLE `rentals` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`property_id` text NOT NULL,
	`landlord_id` text NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`start_date` integer NOT NULL,
	`end_date` integer,
	`monthly_rent` integer NOT NULL,
	`security_deposit` integer DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'RWF' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `users`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`landlord_id`) REFERENCES `users`(`id`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "rentals_status_check" CHECK("rentals"."status" IN ('ACTIVE', 'COMPLETED', 'TERMINATED'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rentals_one_active_per_property` ON `rentals` (`property_id`) WHERE "rentals"."status" = 'ACTIVE';--> statement-breakpoint
CREATE INDEX `rentals_tenant_idx` ON `rentals` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `rentals_property_idx` ON `rentals` (`property_id`);--> statement-breakpoint
CREATE INDEX `rentals_landlord_idx` ON `rentals` (`landlord_id`);--> statement-breakpoint
CREATE INDEX `rentals_status_idx` ON `rentals` (`status`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`rental_id` text NOT NULL,
	`tenant_id` text NOT NULL,
	`landlord_id` text NOT NULL,
	`property_id` text NOT NULL,
	`amount` integer NOT NULL,
	`currency` text DEFAULT 'RWF' NOT NULL,
	`payment_period` text NOT NULL,
	`provider` text NOT NULL,
	`provider_transaction_id` text,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`completed_at` integer,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`rental_id`) REFERENCES `rentals`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`tenant_id`) REFERENCES `users`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`landlord_id`) REFERENCES `users`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "payments_provider_check" CHECK("payments"."provider" IN ('MTN_MOMO', 'AIRTEL_MONEY')),
	CONSTRAINT "payments_status_check" CHECK("payments"."status" IN ('PENDING', 'SUCCESSFUL', 'FAILED', 'CANCELLED', 'EXPIRED')),
	CONSTRAINT "payments_amount_positive_check" CHECK("payments"."amount" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payments_provider_txn_unique` ON `payments` (`provider`,`provider_transaction_id`) WHERE "payments"."provider_transaction_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `payments_rental_idx` ON `payments` (`rental_id`);--> statement-breakpoint
CREATE INDEX `payments_tenant_idx` ON `payments` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `payments_property_idx` ON `payments` (`property_id`);--> statement-breakpoint
CREATE INDEX `payments_status_idx` ON `payments` (`status`);--> statement-breakpoint
CREATE INDEX `payments_txn_idx` ON `payments` (`provider_transaction_id`);--> statement-breakpoint
CREATE INDEX `payments_period_idx` ON `payments` (`rental_id`,`payment_period`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`message` text NOT NULL,
	`related_entity_type` text,
	`related_entity_id` text,
	`is_read` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`read_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "notifications_type_check" CHECK("notifications"."type" IN ('RENTAL_REQUEST','RENTAL_ACCEPTED','RENTAL_REJECTED','RENTAL_CANCELLED','PAYMENT_INITIATED','PAYMENT_SUCCESSFUL','PAYMENT_FAILED','RENT_REMINDER'))
);
--> statement-breakpoint
CREATE INDEX `notifications_user_idx` ON `notifications` (`user_id`);--> statement-breakpoint
CREATE INDEX `notifications_read_idx` ON `notifications` (`is_read`);--> statement-breakpoint
CREATE INDEX `notifications_created_idx` ON `notifications` (`created_at`);--> statement-breakpoint
CREATE INDEX `notifications_user_read_idx` ON `notifications` (`user_id`,`is_read`);