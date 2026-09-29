import { Types } from 'mongoose';

import { NoteColor } from '../enums';

export interface CreateNoteData {
  owner: Types.ObjectId;
  title: string;
  content: string;
  tags?: string[];
  isPinned?: boolean;
  isArchived?: boolean;
  color?: NoteColor;
}
