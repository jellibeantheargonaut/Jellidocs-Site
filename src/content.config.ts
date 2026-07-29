import { defineCollection } from 'astro:content';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';
import { z } from 'astro/zod';

export const collections = {
	docs: defineCollection({
		loader: docsLoader(),
		schema: docsSchema({
			// Optional icon URL shown as a circle at the top of the right sidebar.
			extend: z.object({
				pageIcon: z.string().url().optional(),
			}),
		}),
	}),
};
