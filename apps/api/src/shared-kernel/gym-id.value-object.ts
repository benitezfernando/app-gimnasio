export class GymId {
  private constructor(private readonly _value: string) {}

  static create(value: string): GymId {
    if (!value || value.trim().length === 0) {
      throw new Error('GymId no puede estar vacío');
    }
    return new GymId(value);
  }

  get value(): string {
    return this._value;
  }

  equals(other: GymId): boolean {
    return this._value === other._value;
  }
}
