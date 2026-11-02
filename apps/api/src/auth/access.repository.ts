import type {
  AppAccessRole,
  AppAccessStatus,
  AppAccessUser,
  UpdateAppAccessUserRequest,
} from '@ptm/contracts';

export interface AccessUserRecord extends AppAccessUser {
  samlNameId?: string;
}

export interface AccessLoginProfile {
  email: string;
  name: string;
  samlNameId: string;
}

export interface AccessUserSeed {
  email: string;
  role: AppAccessRole;
}

export interface AccessUserRepository {
  createUser(input: { email: string; role: AppAccessRole }, actorEmail: string): Promise<AccessUserRecord>;
  findActiveUser(email: string): Promise<AccessUserRecord | undefined>;
  listUsers(): Promise<AccessUserRecord[]>;
  recordSuccessfulLogin(profile: AccessLoginProfile): Promise<AccessUserRecord | undefined>;
  seedUsers(users: AccessUserSeed[]): Promise<void>;
  updateUser(
    email: string,
    patch: UpdateAppAccessUserRequest,
    actorEmail: string
  ): Promise<AccessUserRecord>;
}

export class AccessUserAlreadyExistsError extends Error {
  constructor(email: string) {
    super(`Access for ${email} already exists.`);
    this.name = 'AccessUserAlreadyExistsError';
  }
}

export class AccessUserNotFoundError extends Error {
  constructor(email: string) {
    super(`Access for ${email} does not exist.`);
    this.name = 'AccessUserNotFoundError';
  }
}

export class LastActiveAdminError extends Error {
  constructor() {
    super('The last active administrator cannot be disabled or demoted.');
    this.name = 'LastActiveAdminError';
  }
}

export function isActiveAdmin(user: Pick<AccessUserRecord, 'role' | 'status'>) {
  return user.role === 'admin' && user.status === 'active';
}

export function createAccessUserRecord(input: {
  createdAt?: string;
  email: string;
  lastLoginAt?: string;
  name?: string;
  role: AppAccessRole;
  samlNameId?: string;
  status?: AppAccessStatus;
  updatedAt?: string;
}): AccessUserRecord {
  const now = new Date().toISOString();
  return {
    createdAt: input.createdAt || now,
    email: input.email.trim().toLowerCase(),
    lastLoginAt: input.lastLoginAt,
    name: input.name,
    role: input.role,
    samlNameId: input.samlNameId,
    status: input.status || 'active',
    updatedAt: input.updatedAt || now,
  };
}
