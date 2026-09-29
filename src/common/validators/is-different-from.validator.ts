import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'isDifferentFrom', async: false })
class IsDifferentFromConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const [siblingProperty] = args.constraints as [string];
    const siblingValue = (args.object as Record<string, unknown>)[
      siblingProperty
    ];
    return value !== siblingValue;
  }

  defaultMessage(args: ValidationArguments): string {
    const [siblingProperty] = args.constraints as [string];
    return `${args.property} must be different from ${siblingProperty}`;
  }
}

/** Cross-field check: this property must not equal the named sibling. */
export function IsDifferentFrom(
  siblingProperty: string,
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return (object, propertyName) => {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName as string,
      constraints: [siblingProperty],
      options: validationOptions,
      validator: IsDifferentFromConstraint,
    });
  };
}
