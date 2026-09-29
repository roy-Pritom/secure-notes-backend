import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Types, UpdateQuery } from 'mongoose';

import {
  PagedResult,
  PaginationQueryDto,
  PaginationService,
} from '../../common/pagination';
import { Note, type NoteDocument, type NoteModel } from './schemas/note.schema';
import { CreateNoteData } from './types';

/** The only place that talks to the `notes` collection. */
@Injectable()
export class NotesRepository {
  constructor(
    @InjectModel(Note.name) private readonly noteModel: NoteModel,
    private readonly pagination: PaginationService,
  ) {}

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
  ): Promise<PagedResult<NoteDocument>> {
    // The document type is stated rather than inferred: a filter typed on the
    // raw schema class would otherwise win, and the rows would come back
    // unhydrated.
    return this.pagination.fetchPage<NoteDocument>(
      this.noteModel,
      this.live(owner ? { owner } : {}),
      query,
    );
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
