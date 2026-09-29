import { Types } from 'mongoose';

export interface CreateNoteData {
  owner: Types.ObjectId;
  title: string;
  content: string;
}
