import { Injectable } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AuthProviderPort, InvitedAuthUser } from '../../application/ports/auth-provider.port';

/**
 * Adaptador de AuthProviderPort contra la Admin API de Supabase Auth.
 * Usa el service_role key — SOLO server-side, nunca en variables públicas
 * de Next.js (`NEXT_PUBLIC_*`).
 */
@Injectable()
export class SupabaseAdminAuthProvider implements AuthProviderPort {
  private readonly client: SupabaseClient;

  constructor() {
    const url = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !serviceRoleKey) {
      throw new Error(
        'SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son requeridos para SupabaseAdminAuthProvider',
      );
    }

    this.client = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  async inviteUserByEmail(email: string): Promise<InvitedAuthUser> {
    const { data, error } = await this.client.auth.admin.inviteUserByEmail(email);

    if (error || !data.user) {
      throw new Error(
        `No se pudo invitar a ${email} vía Supabase Auth: ${error?.message ?? 'sin usuario'}`,
      );
    }

    return { authUserId: data.user.id };
  }
}
