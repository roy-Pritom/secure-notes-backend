import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';

import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { AuthenticatedUser } from '../../common/types';
import { UserRole } from '../users/enums';
import { CreateNoteDto, NoteResponseDto, UpdateNoteDto } from './dto';
import { NotesRepository } from './notes.repository';
import { NoteDocument } from './schemas/note.schema';

@Injectable()
export class NotesService {
  constructor(private readonly notesRepository: NotesRepository) {}

  async create(
    owner: Types.ObjectId,
    dto: CreateNoteDto,
  ): Promise<NoteResponseDto> {
    const note = await this.notesRepository.create({ owner, ...dto });
    return NoteResponseDto.fromEntity(note);
  }

  /** A user's own notes. Admins use `findAll` for the cross-account view. */
  async findOwn(
    owner: Types.ObjectId,
    query: PaginationQueryDto,
  ): Promise<PaginatedResponseDto<NoteResponseDto>> {
    return this.page(
      await this.notesRepository.findPaginated(query, owner),
      query,
    );
  }

  async findAll(
    query: PaginationQueryDto,
  ): Promise<PaginatedResponseDto<NoteResponseDto>> {
    return this.page(await this.notesRepository.findPaginated(query), query);
  }

  async findOne(
    id: Types.ObjectId,
    caller: AuthenticatedUser,
  ): Promise<NoteResponseDto> {
    return NoteResponseDto.fromEntity(await this.getReadable(id, caller));
  }

  async update(
    id: Types.ObjectId,
    caller: AuthenticatedUser,
    dto: UpdateNoteDto,
  ): Promise<NoteResponseDto> {
    await this.getWritable(id, caller);
    const updated = await this.notesRepository.updateById(id, {
      $set: { ...dto },
    });
    if (!updated) {
      throw notFound(id);
    }
    return NoteResponseDto.fromEntity(updated);
  }

  async remove(id: Types.ObjectId, caller: AuthenticatedUser): Promise<void> {
    await this.getWritable(id, caller);
    await this.notesRepository.softDeleteById(id);
  }

  /** Admins may read any note; everyone else only their own. */
  private async getReadable(
    id: Types.ObjectId,
    caller: AuthenticatedUser,
  ): Promise<NoteDocument> {
    const note = await this.notesRepository.findById(id);
    if (!note) {
      throw notFound(id);
    }
    if (!isOwner(note, caller) && !isAdmin(caller)) {
      // Same status as a missing note: ownership must not be probeable.
      throw notFound(id);
    }
    return note;
  }

  /** Writing is owner-only — reading everyone's notes is not editing them. */
  private async getWritable(
    id: Types.ObjectId,
    caller: AuthenticatedUser,
  ): Promise<NoteDocument> {
    const note = await this.getReadable(id, caller);
    if (!isOwner(note, caller)) {
      throw new ForbiddenException('Only the owner can modify this note');
    }
    return note;
  }

  private page(
    result: { items: NoteDocument[]; total: number },
    query: PaginationQueryDto,
  ): PaginatedResponseDto<NoteResponseDto> {
    return PaginatedResponseDto.build(
      NoteResponseDto.fromEntities(result.items),
      result.total,
      query.page,
      query.limit,
    );
  }
}

function isOwner(note: NoteDocument, caller: AuthenticatedUser): boolean {
  return note.owner.toHexString() === caller.id;
}

function isAdmin(caller: AuthenticatedUser): boolean {
  return caller.roles.includes(UserRole.Admin);
}

function notFound(id: Types.ObjectId): NotFoundException {
  return new NotFoundException(`Note ${id.toHexString()} not found`);
}
