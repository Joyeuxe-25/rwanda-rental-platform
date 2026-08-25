ALTER TABLE `properties` ADD `is_published` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `properties` ADD `published_at` integer;--> statement-breakpoint
CREATE INDEX `properties_published_idx` ON `properties` (`is_published`);