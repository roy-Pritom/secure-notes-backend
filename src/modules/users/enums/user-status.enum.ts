export enum UserStatus {
  /** Registered but has not confirmed their email address yet. */
  Pending = 'pending',
  Active = 'active',
  /** Temporarily blocked by an administrator. */
  Suspended = 'suspended',
}
