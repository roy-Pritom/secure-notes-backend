import { PartialType } from '@nestjs/swagger';

import { CreateNoteDto } from './create-note.dto';

/** Ownership is immutable: a note cannot be handed to another account. */
export class UpdateNoteDto extends PartialType(CreateNoteDto) {}
