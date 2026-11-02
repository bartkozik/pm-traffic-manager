import type { AppAccessRole, UpdateAppAccessUserRequest } from '@ptm/contracts';
import {
  AccessUserAlreadyExistsError,
  AccessUserNotFoundError,
  LastActiveAdminError,
  createAccessUserRecord,
  isActiveAdmin,
  type AccessLoginProfile,
  type AccessUserRecord,
  type AccessUserRepository,
  type AccessUserSeed,
} from './access.repository.js';

export class InMemoryAccessUserRepository implements AccessUserRepository {
  private readonly users = new Map<string, AccessUserRecord>();

  constructor(seed: Array<Partial<AccessUserRecord> & Pick<AccessUserRecord, 'email' | 'role'>> = []) {
    for (const user of seed) {
      const record = createAccessUserRecord(user);
      this.users.set(record.email, record);
    }
  }

  async seedUsers(users: AccessUserSeed[]): Promise<void> {
    for (const user of users) {
      const email = normalizeEmail(user.email);
      if (!this.users.has(email)) {
        this.users.set(email, createAccessUserRecord({ ...user, email }));
      }
    }
  }

  async findActiveUser(email: string): Promise<AccessUserRecord | undefined> {
    const user = this.users.get(normalizeEmail(email));
    return user?.status === 'active' ? { ...user } : undefined;
  }

  async listUsers(): Promise<AccessUserRecord[]> {
    return [...this.users.values()]
      .map((user) => ({ ...user }))
      .sort((left, right) => left.email.localeCompare(right.email));
  }

  async recordSuccessfulLogin(profile: AccessLoginProfile): Promise<AccessUserRecord | undefined> {
    const email = normalizeEmail(profile.email);
    const current = this.users.get(email);
    if (!current || current.status !== 'active') return undefined;
    const next = {
      ...current,
      lastLoginAt: new Date().toISOString(),
      name: profile.name,
      samlNameId: profile.samlNameId,
      updatedAt: new Date().toISOString(),
    };
    this.users.set(email, next);
    return { ...next };
  }

  async createUser(
    input: { email: string; role: AppAccessRole },
    actorEmail: string
  ): Promise<AccessUserRecord> {
    void actorEmail;
    const email = normalizeEmail(input.email);
    if (this.users.has(email)) throw new AccessUserAlreadyExistsError(email);
    const user = createAccessUserRecord({ ...input, email });
    this.users.set(email, user);
    return { ...user };
  }

  async updateUser(
    emailValue: string,
    patch: UpdateAppAccessUserRequest,
    actorEmail: string
  ): Promise<AccessUserRecord> {
    void actorEmail;
    const email = normalizeEmail(emailValue);
    const current = this.users.get(email);
    if (!current) throw new AccessUserNotFoundError(email);
    const next = {
      ...current,
      role: patch.role ?? current.role,
      status: patch.status ?? current.status,
      updatedAt: new Date().toISOString(),
    };
    if (
      isActiveAdmin(current) &&
      !isActiveAdmin(next) &&
      [...this.users.values()].filter(isActiveAdmin).length <= 1
    ) {
      throw new LastActiveAdminError();
    }
    this.users.set(email, next);
    return { ...next };
  }
}

export function createAllowedAccessRepository(
  email = 'anna@example.test',
  role: AppAccessRole = 'member'
) {
  return new InMemoryAccessUserRepository([{ email, role }]);
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}
