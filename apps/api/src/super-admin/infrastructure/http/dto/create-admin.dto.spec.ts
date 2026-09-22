import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateAdminDto } from './create-admin.dto';

describe('CreateAdminDto', () => {
  it('normaliza el username a minuscula antes de validar', async () => {
    const dto = plainToInstance(CreateAdminDto, {
      gymId: 'gym-1',
      username: '  Admin.Uno  ',
      nombre: 'Admin Uno',
      password: 'secreto123',
    });

    expect(dto.username).toBe('admin.uno');

    const errores = await validate(dto);
    expect(errores).toHaveLength(0);
  });
});
