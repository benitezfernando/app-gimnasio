import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateProfesorDto } from './create-profesor.dto';

describe('CreateProfesorDto', () => {
  it('normaliza el username a minuscula antes de validar', async () => {
    const dto = plainToInstance(CreateProfesorDto, {
      username: '  Juan.Perez  ',
      nombre: 'Juan Perez',
      password: 'secreto123',
    });

    expect(dto.username).toBe('juan.perez');

    const errores = await validate(dto);
    expect(errores).toHaveLength(0);
  });
});
