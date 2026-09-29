import { Prop } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { Types } from 'mongoose';

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

/** Adds soft deletion. Queries on these collections filter on `isDeleted: false`. */
export abstract class BaseSchema extends TimestampedSchema {
  @Prop({ type: Boolean, default: false })
  isDeleted!: boolean;

  @Prop({ type: Date, default: null })
  deletedAt!: Date | null;
}
