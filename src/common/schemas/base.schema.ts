import { Prop } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { Types } from 'mongoose';

/** Identity and audit fields every document carries. */
export abstract class TimestampedSchema {
  @ApiProperty({
    example: '6650f1a2b3c4d5e6f7a8b9c0',
    description: 'Document identifier',
  })
  readonly _id!: Types.ObjectId;

  // Populated by `{ timestamps: true }` on the concrete `@Schema()`.
  @ApiProperty({ type: Date })
  readonly createdAt!: Date;

  @ApiProperty({ type: Date })
  readonly updatedAt!: Date;
}

/** Adds soft deletion. Queries on these collections filter on `deletedAt: null`. */
export abstract class BaseSchema extends TimestampedSchema {
  /**
   * Soft delete marker. Never indexed on its own — it is the leading field of
   * the compound listing indexes instead.
   */
  @Prop({ type: Date, default: null })
  deletedAt!: Date | null;
}
