import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

export const CATEGORIES = {
  software: 'Software',
  data: 'Data & automation',
  engineering: 'Engineering software',
} as const;

export const KINDS = {
  personal: 'Personal project',
  application: 'Application project',
  hackathon: 'Team hackathon project',
  meta: 'This site',
} as const;

const projects = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/projects' }),
  schema: z.object({
    title: z.string(),
    /** One-sentence value proposition. */
    tagline: z.string().max(180),
    /** Card copy: problem + what was built, two sentences at most. */
    summary: z.string().max(320),
    category: z.enum(['software', 'data', 'engineering']),
    alsoIn: z.array(z.enum(['software', 'data', 'engineering'])).default([]),
    kind: z.enum(['personal', 'application', 'hackathon', 'meta']),
    team: z.boolean(),
    /** Honest statement of Alexander's individual role. */
    role: z.string(),
    collaborators: z.array(z.object({ name: z.string(), url: z.url().optional() })).default([]),
    context: z.string().optional(),
    period: z.string(),
    status: z.string(),
    repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/).optional(),
    stack: z.array(z.string()).min(1),
    /** 2–4 verified facts for the key-results strip. Each must trace to the claim register. */
    facts: z
      .array(z.object({ value: z.string(), label: z.string(), note: z.string().optional() }))
      .min(2)
      .max(4),
    /** Which bespoke visual the cards and case-study hero use. */
    visual: z.enum(['longisafe', 'demographics', 'infraflow', 'rideplanner', 'tacto', 'portfolio']),
    order: z.number(),
    featured: z.boolean().default(false),
    /** Evidence provenance: what revision was audited, and when. */
    audit: z.object({ revision: z.string(), date: z.string() }),
    dataNote: z.string().optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { projects };
