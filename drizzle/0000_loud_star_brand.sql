CREATE TABLE `monster_tokens` (
	`monster_index` text PRIMARY KEY NOT NULL,
	`object_key` text NOT NULL,
	`original_name` text NOT NULL,
	`content_type` text DEFAULT 'image/png' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
