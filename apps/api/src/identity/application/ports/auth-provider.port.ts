export const AUTH_PROVIDER = Symbol('AUTH_PROVIDER');

export interface InvitedAuthUser {
  authUserId: string;
}

export interface AuthProviderPort {
  inviteUserByEmail(email: string): Promise<InvitedAuthUser>;
}
