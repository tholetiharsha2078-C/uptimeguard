import { z } from 'zod';

export const CHECK_INTERVALS = [5, 10, 15, 30, 60] as const;
export type CheckInterval = (typeof CHECK_INTERVALS)[number];

export const registerSchema = z
  .object({
    name: z.string().trim().min(1, 'Enter your name.').max(80, 'Name is too long.'),
    email: z.email('Enter a valid email address.').max(254).transform((value) => value.toLowerCase()),
    password: z
      .string()
      .min(10, 'Use at least 10 characters.')
      .max(128, 'Password is too long.')
      .refine((value) => /[a-z]/i.test(value), 'Include at least one letter.')
      .refine((value) => /\d/.test(value), 'Include at least one number.'),
    confirmPassword: z.string().min(1, 'Confirm your password.'),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match.',
  });

export const loginSchema = z.object({
  email: z.email('Enter a valid email address.').transform((value) => value.toLowerCase()),
  password: z.string().min(1, 'Enter your password.').max(128),
});

export const profileSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name.').max(80, 'Name is too long.'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password.'),
  newPassword: z
    .string()
    .min(10, 'Use at least 10 characters.')
    .max(128, 'Password is too long.')
    .refine((value) => /[a-z]/i.test(value), 'Include at least one letter.')
    .refine((value) => /\d/.test(value), 'Include at least one number.'),
});

export const createWebsiteSchema = z.object({
  url: z.string().trim().min(1, 'Enter a website URL.').max(2048, 'URL is too long.'),
  name: z.string().trim().max(80, 'Name is too long.').optional(),
  intervalMinutes: z
    .number()
    .int()
    .refine((value) => (CHECK_INTERVALS as readonly number[]).includes(value), 'Choose a valid interval.')
    .optional(),
});

export const updateWebsiteSchema = z
  .object({
    name: z.string().trim().min(1, 'Name cannot be empty.').max(80, 'Name is too long.').optional(),
    intervalMinutes: z
      .number()
      .int()
      .refine((value) => (CHECK_INTERVALS as readonly number[]).includes(value), 'Choose a valid interval.')
      .optional(),
    isPaused: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Nothing to update.');

export const rangeSchema = z.enum(['24h', '7d', '30d']).catch('24h');
export type TimeRange = z.infer<typeof rangeSchema>;

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).catch(50),
  offset: z.coerce.number().int().min(0).max(10_000).catch(0),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ProfileInput = z.infer<typeof profileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type CreateWebsiteInput = z.infer<typeof createWebsiteSchema>;
export type UpdateWebsiteInput = z.infer<typeof updateWebsiteSchema>;
