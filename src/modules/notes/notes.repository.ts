import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Types, UpdateQuery } from 'mongoose';

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { Note, type NoteDocument, type NoteModel } from './schemas/note.schema';
import { CreateNoteData } from './types';

/** The only place that talks to the `notes` collection. */
@Injectable()
export class NotesRepository {
  constructor(@InjectModel(Note.name) private readonly noteModel: NoteModel) {}

  private live(filter: FilterQuery<Note> = {}): FilterQuery<Note> {
    return { ...filter, deletedAt: null };
  }

  async create(data: CreateNoteData): Promise<NoteDocument> {
    return this.noteModel.create(data);
  }

  async findById(id: Types.ObjectId): Promise<NoteDocument | null> {
    return this.noteModel.findOne(this.live({ _id: id })).exec();
  }

  /**
   * `owner` scopes the page to one account and is dropped for an admin
   * listing; the two cases are served by `own_notes_by_created` and
   * `all_notes_by_created` respectively.
   */
  async findPaginated(
    query: PaginationQueryDto,
    owner?: Types.ObjectId,
  ): Promise<{ items: NoteDocument[]; total: number }> {
    const filter = this.live(owner ? { owner } : {});

    const [items, total] = await Promise.all([
      this.noteModel
        .find(filter)
        .sort({ createdAt: query.createdAtSort })
        .skip(query.skip)
        .limit(query.limit)
        .exec(),
      this.noteModel.countDocuments(filter).exec(),
    ]);

    return { items, total };
  }

  async updateById(
    id: Types.ObjectId,
    update: UpdateQuery<Note>,
  ): Promise<NoteDocument | null> {
    return this.noteModel
      .findOneAndUpdate(this.live({ _id: id }), update, {
        new: true,
        runValidators: true,
      })
      .exec();
  }

  async softDeleteById(id: Types.ObjectId): Promise<NoteDocument | null> {
    return this.updateById(id, { $set: { deletedAt: new Date() } });
  }
}
