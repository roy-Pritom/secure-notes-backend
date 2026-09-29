import { Prop } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { Types } from 'mongoose';

/** Fields every document carries. Extend this instead of re-declaring them. */
export abstract class BaseSchema {
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

  /** Soft delete marker. Queries must filter on `deletedAt: null`. */
  @Prop({ type: Date, default: null, index: true })
  deletedAt!: Date | null;
}
