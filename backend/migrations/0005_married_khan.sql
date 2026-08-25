ALTER TABLE `rentals` ADD `rental_request_id` text REFERENCES rental_requests(id);--> statement-breakpoint
CREATE UNIQUE INDEX `rentals_rental_request_id_unique` ON `rentals` (`rental_request_id`);