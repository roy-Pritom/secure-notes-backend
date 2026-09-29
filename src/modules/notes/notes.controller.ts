import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Types } from 'mongoose';

import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { API_VERSION } from '../../utils/constant';
import { CurrentUser, CurrentUserId, Roles } from '../auth/decorators';
import type { AuthenticatedUser } from '../auth/types';
import { UserRole } from '../users/enums';
import { CreateNoteDto, NoteResponseDto, UpdateNoteDto } from './dto';
import { NotesService } from './notes.service';

@ApiTags('notes')
@ApiBearerAuth()
@Controller({ path: 'notes', version: API_VERSION.V1 })
export class NotesController {
  constructor(private readonly notesService: NotesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a note' })
  @ApiCreatedResponse({ type: NoteResponseDto })
  create(
    @CurrentUserId() userId: Types.ObjectId,
    @Body() dto: CreateNoteDto,
  ): Promise<NoteResponseDto> {
    return this.notesService.create(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List my notes, newest first' })
  findOwn(
    @CurrentUserId() userId: Types.ObjectId,
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResponseDto<NoteResponseDto>> {
    return this.notesService.findOwn(userId, query);
  }

  // Before `:id`, and admin-only: this is the cross-account view.
  @Roles(UserRole.Admin)
  @Get('all')
  @ApiOperation({ summary: "List everyone's notes" })
  @ApiForbiddenResponse({ description: 'Requires the admin role' })
  findAll(
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResponseDto<NoteResponseDto>> {
    return this.notesService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Fetch one note (mine, or any note for an admin)' })
  @ApiOkResponse({ type: NoteResponseDto })
  @ApiNotFoundResponse({ description: 'Note does not exist or is not yours' })
  findOne(
    @Param('id', ParseObjectIdPipe) id: Types.ObjectId,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<NoteResponseDto> {
    return this.notesService.findOne(id, caller);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update my note' })
  @ApiOkResponse({ type: NoteResponseDto })
  update(
    @Param('id', ParseObjectIdPipe) id: Types.ObjectId,
    @CurrentUser() caller: AuthenticatedUser,
    @Body() dto: UpdateNoteDto,
  ): Promise<NoteResponseDto> {
    return this.notesService.update(id, caller, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete my note' })
  @ApiNoContentResponse({ description: 'Note removed' })
  remove(
    @Param('id', ParseObjectIdPipe) id: Types.ObjectId,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<void> {
    return this.notesService.remove(id, caller);
  }
}
