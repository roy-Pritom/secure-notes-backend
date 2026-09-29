import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';

import {
  PaginatedResponseDto,
  PaginationQueryDto,
  PaginationService,
} from '../../common/pagination';
import { AuthenticatedUser } from '../../common/types';
import { UserRole } from '../users/enums';
import { CreateNoteDto, NoteResponseDto, UpdateNoteDto } from './dto';
import { NotesRepository } from './notes.repository';
import { NoteDocument } from './schemas/note.schema';

@Injectable()
export class NotesService {
  constructor(
    private readonly notesRepository: NotesRepository,
    private readonly pagination: PaginationService,
  ) {}

  async create(
    owner: Types.ObjectId,
    dto: CreateNoteDto,
  ): Promise<NoteResponseDto> {
    const note = await this.notesRepository.create({ owner, ...dto });
    return NoteResponseDto.fromEntity(note);
  }

  async findOwn(
    owner: Types.ObjectId,
    query: PaginationQueryDto,
  ): Promise<PaginatedResponseDto<NoteResponseDto>> {
    return this.pagination.toResponse(
      await this.notesRepository.findPaginated(query, owner),
      query,
      NoteResponseDto.fromEntities,
    );
  }

  async findAll(
    query: PaginationQueryDto,
  ): Promise<PaginatedResponseDto<NoteResponseDto>> {
    return this.pagination.toResponse(
      await this.notesRepository.findPaginated(query),
      query,
      NoteResponseDto.fromEntities,
    );
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

  /**
   * Cascade for a deleted account. No ownership check: the caller has already
   * established the right to remove the owner themselves.
   */
  removeAllForOwner(owner: Types.ObjectId): Promise<number> {
    return this.notesRepository.softDeleteByOwner(owner);
  }

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
