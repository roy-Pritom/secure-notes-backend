import { ArgumentMetadata, BadRequestException } from '@nestjs/common';

import { AppValidationPipe } from '../pipes/app-validation.pipe';
import { PaginationQueryDto } from './pagination-query.dto';

// Goes through the real global pipe: a plain object reaching the service
// would leave the `skip` getter undefined and every page would be page one.
describe('PaginationQueryDto (through AppValidationPipe)', () => {
  const pipe = new AppValidationPipe();
  const metadata: ArgumentMetadata = {
    type: 'query',
    metatype: PaginationQueryDto,
    data: undefined,
  };

  const transform = (
    query: Record<string, unknown>,
  ): Promise<PaginationQueryDto> =>
    pipe.transform(query, metadata) as Promise<PaginationQueryDto>;

  it('applies defaults when nothing is supplied', async () => {
    const dto = await transform({});
    expect(dto).toBeInstanceOf(PaginationQueryDto);
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
    expect(dto.sortBy).toBe('createdAt');
    expect(dto.sortOrder).toBe('desc');
    expect(dto.skip).toBe(0);
  });

  it('computes skip from page and limit', async () => {
    const dto = await transform({ page: '3', limit: '25' });
    expect(dto.page).toBe(3);
    expect(dto.limit).toBe(25);
    expect(dto.skip).toBe(50);
  });

  it('rejects a limit above the ceiling', async () => {
    await expect(transform({ limit: '1000' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects a page below 1', async () => {
    await expect(transform({ page: '0' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects a sortBy that is not a plain field name', async () => {
    await expect(transform({ sortBy: '$where' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(transform({ sortBy: 'a.b' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('normalizes sortOrder casing and rejects anything else', async () => {
    expect((await transform({ sortOrder: 'ASC' })).sortOrder).toBe('asc');
    await expect(transform({ sortOrder: 'sideways' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects unknown query parameters instead of ignoring them', async () => {
    await expect(transform({ isAdmin: 'true' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
