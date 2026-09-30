import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Types, UpdateQuery } from 'mongoose';

import {
  PagedResult,
  PaginationService,
  SortSpec,
} from '../../common/pagination';
import { tokenSearchFilter } from '../../common/search';
import { QueryNotesDto } from './dto';
import {
  ALL_NOTES_SEARCH_INDEX,
  Note,
  type NoteDocument,
  type NoteModel,
  OWN_NOTES_SEARCH_INDEX,
} from './schemas/note.schema';
import { CreateNoteData } from './types';

/** The only place that talks to the `notes` collection. */
@Injectable()
export class NotesRepository {
  constructor(
    @InjectModel(Note.name) private readonly noteModel: NoteModel,
    private readonly pagination: PaginationService,
  ) {}

  private live(filter: FilterQuery<Note> = {}): FilterQuery<Note> {
    return { ...filter, isDeleted: false };
  }

  async create(data: CreateNoteData): Promise<NoteDocument> {
    return this.noteModel.create(data);
  }

  async findById(id: Types.ObjectId): Promise<NoteDocument | null> {
    return this.noteModel.findOne(this.live({ _id: id })).exec();
  }

  async findPaginated(
    query: QueryNotesDto,
    owner?: Types.ObjectId,
  ): Promise<PagedResult<NoteDocument>> {
    // The document type is stated rather than inferred: a filter typed on the
    // raw schema class would otherwise win, and the rows would come back
    // unhydrated.
    return this.pagination.fetchPage<NoteDocument>(
      this.noteModel,
      this.buildFilter(query, owner),
      query,
      pinnedFirst(query),
      query.searchTerm
        ? owner
          ? OWN_NOTES_SEARCH_INDEX
          : ALL_NOTES_SEARCH_INDEX
        : undefined,
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
    return this.updateById(id, {
      $set: { isDeleted: true, deletedAt: new Date() },
    });
  }

  async softDeleteByOwner(owner: Types.ObjectId): Promise<number> {
    const result = await this.noteModel
      .updateMany(this.live({ owner }), {
        $set: { isDeleted: true, deletedAt: new Date() },
      })
      .exec();
    return result.modifiedCount;
  }

  private buildFilter(
    query: QueryNotesDto,
    owner?: Types.ObjectId,
  ): FilterQuery<Note> {
    const filter: FilterQuery<Note> = { isArchived: query.archived };
    if (owner) {
      filter.owner = owner;
    }
    if (query.tag) {
      filter.tags = query.tag;
    }
    if (query.pinned !== undefined) {
      filter.isPinned = query.pinned;
    }
    return this.live({
      ...filter,
      ...tokenSearchFilter<Note>(query.searchTerm),
    });
  }
}

/**
 * Pinned notes lead, then the requested date order. The descending page —
 * the default — is read straight off the index; `?sortOrder=asc` flips only
 * the second key, so that direction is sorted in memory.
 */
function pinnedFirst(query: QueryNotesDto): SortSpec {
  return { isPinned: -1, createdAt: query.createdAtSort };
}
