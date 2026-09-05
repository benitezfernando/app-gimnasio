import { Injectable } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  AuthProviderPort,
  AuthSession,
  AuthUserRef,
} from '../../application/ports/auth-provider.port';
import { buildSyntheticEmail, deriveAlumnoPassword } from './synthetic-credentials';

/**
 * Adaptador de AuthProviderPort contra Supabase Auth. Usa el service_role
 * key — SOLO server-side. El email sintético y la password derivada del
 * alumno se resuelven acá adentro; nada de esto sale de este archivo.
 *
 * Nota sobre `admin.createUser` con `email_confirm: true`: a diferencia de
 * `inviteUserByEmail` (Fase 1, descartado en este plan), este método NO
 * dispara ningún correo — crea el usuario ya confirmado directamente.
 * (Documentado en la API de Supabase Admin; no se verificó en vivo en este
 * plan porque haría un side effect real sobre `auth.users` sin
 * autorización explícita — ver Task 4 del plan.)
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

  async createStaffUser(gymId: string, username: string, password: string): Promise<AuthUserRef> {
    return this.crearEnSupabase(gymId, username, password);
  }

  async createAlumnoUser(gymId: string, username: string): Promise<AuthUserRef> {
    return this.crearEnSupabase(gymId, username, deriveAlumnoPassword(gymId, username));
  }

  async signInStaff(gymId: string, username: string, password: string): Promise<AuthSession> {
    return this.iniciarSesion(gymId, username, password);
  }

  async signInAlumno(gymId: string, username: string): Promise<AuthSession> {
    return this.iniciarSesion(gymId, username, deriveAlumnoPassword(gymId, username));
  }

  async deleteAuthUser(authUserId: string): Promise<void> {
    const { error } = await this.client.auth.admin.deleteUser(authUserId);
    if (error) {
      throw new Error(`No se pudo eliminar el usuario en Supabase Auth: ${error.message}`);
    }
  }

  private async crearEnSupabase(
    gymId: string,
    username: string,
    password: string,
  ): Promise<AuthUserRef> {
    const email = buildSyntheticEmail(gymId, username);
    const { data, error } = await this.client.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (error || !data.user) {
      throw new Error(
        `No se pudo crear el usuario en Supabase Auth: ${error?.message ?? 'sin usuario'}`,
      );
    }

    return { authUserId: data.user.id };
  }

  private async iniciarSesion(
    gymId: string,
    username: string,
    password: string,
  ): Promise<AuthSession> {
    const email = buildSyntheticEmail(gymId, username);
    const { data, error } = await this.client.auth.signInWithPassword({ email, password });

    if (error || !data.session) {
      throw new Error('Credenciales inválidas');
    }

    return {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      authUserId: data.user.id,
    };
  }
}
