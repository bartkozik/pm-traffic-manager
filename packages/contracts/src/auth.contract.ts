import { z } from 'zod';

export const appAccessRoleSchema = z.enum(['admin', 'member']);
export const appAccessStatusSchema = z.enum(['active', 'disabled']);

export const authUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  organizationDomain: z.string().min(1),
  role: appAccessRoleSchema,
  subject: z.string().min(1),
});

export const authSessionResponseSchema = z.object({
  authenticated: z.boolean(),
  authEnabled: z.boolean(),
  user: authUserSchema.optional(),
  workspaceDomain: z.string().min(1).optional(),
});

export const appAccessUserSchema = z.object({
  createdAt: z.string().datetime(),
  email: z.string().email(),
  lastLoginAt: z.string().datetime().optional(),
  name: z.string().min(1).optional(),
  role: appAccessRoleSchema,
  status: appAccessStatusSchema,
  updatedAt: z.string().datetime(),
});

export const appSamlConfigurationSchema = z.object({
  acsUrl: z.string().url(),
  authEnabled: z.boolean(),
  configured: z.boolean(),
  configurationSource: z.enum(['database', 'missing']),
  cookieSecure: z.boolean(),
  idpCertificate: z.string(),
  idpEntityId: z.string(),
  idpSsoUrl: z.string(),
  metadataUrl: z.string().url(),
  requestTtlMinutes: z.number().int().min(1).max(60),
  samlEnabled: z.boolean(),
  sessionSecretConfigured: z.boolean(),
  sessionTtlHours: z.number().positive().max(168),
  spCertificateConfigured: z.boolean(),
  spEntityId: z.string().min(1),
  spPrivateKeyConfigured: z.boolean(),
  updatedAt: z.string().datetime().optional(),
  webAppUrl: z.string().url(),
  workspaceDomain: z.string().min(1),
});

export const updateAppSamlConfigurationRequestSchema = z.object({
  idpCertificate: z.string().trim().min(1).max(100_000),
  idpEntityId: z.string().trim().min(1).max(2_048),
  idpSsoUrl: z.string().trim().url().max(4_096),
  requestTtlMinutes: z.number().int().min(1).max(60),
  samlEnabled: z.boolean(),
}).strict();

export const samlAuthenticationRequestSchema = z.object({
  relayState: z.string().min(1),
  samlRequest: z.string().min(1),
  ssoUrl: z.string().url(),
});

export const appAccessUsersResponseSchema = z.object({
  samlConfiguration: appSamlConfigurationSchema,
  users: z.array(appAccessUserSchema),
});

export const createAppAccessUserRequestSchema = z.object({
  email: z.string().trim().email(),
  role: appAccessRoleSchema.optional().default('member'),
}).strict();

export const updateAppAccessUserRequestSchema = z.object({
  role: appAccessRoleSchema.optional(),
  status: appAccessStatusSchema.optional(),
}).strict().refine((value) => value.role !== undefined || value.status !== undefined, {
  message: 'At least one access field must be provided.',
});

export type AppAccessRole = z.infer<typeof appAccessRoleSchema>;
export type AppAccessStatus = z.infer<typeof appAccessStatusSchema>;
export type AppAccessUser = z.infer<typeof appAccessUserSchema>;
export type AppAccessUsersResponse = z.infer<typeof appAccessUsersResponseSchema>;
export type AppSamlConfiguration = z.infer<typeof appSamlConfigurationSchema>;
export type CreateAppAccessUserRequest = z.infer<typeof createAppAccessUserRequestSchema>;
export type SamlAuthenticationRequest = z.infer<typeof samlAuthenticationRequestSchema>;
export type UpdateAppAccessUserRequest = z.infer<typeof updateAppAccessUserRequestSchema>;
export type UpdateAppSamlConfigurationRequest = z.infer<typeof updateAppSamlConfigurationRequestSchema>;
export type AuthUser = z.infer<typeof authUserSchema>;
export type AuthSessionResponse = z.infer<typeof authSessionResponseSchema>;
