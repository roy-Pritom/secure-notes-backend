import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { Types } from 'mongoose';

/** Turns a route param into a real `ObjectId`, rejecting anything else with a 400. */
@Injectable()
export class ParseObjectIdPipe implements PipeTransform<
  unknown,
  Types.ObjectId
> {
  transform(value: unknown): Types.ObjectId {
    if (typeof value !== 'string' || !Types.ObjectId.isValid(value)) {
      throw new BadRequestException(
        `"${String(value)}" is not a valid resource id`,
      );
    }

    // `isValid` also accepts any 12-character string; round-tripping proves
    // this is a genuine 24-char hex id.
    const objectId = new Types.ObjectId(value);
    if (objectId.toHexString() !== value.toLowerCase()) {
      throw new BadRequestException(`"${value}" is not a valid resource id`);
    }

    return objectId;
  }
}
