import { ApiProperty } from '@nestjs/swagger';

/** One user inside an interest group. */
export class InterestMemberDto {
  @ApiProperty({ example: '6650f1a2b3c4d5e6f7a8b9c0' }) id!: string;
  @ApiProperty({ example: 'Ada Lovelace' }) fullName!: string;
  @ApiProperty({ example: 'ada@example.com' }) email!: string;
  @ApiProperty({ nullable: true }) avatarUrl!: string | null;
}

export class InterestGroupDto {
  @ApiProperty({ example: 'chess' }) interest!: string;
  @ApiProperty({ example: 12 }) userCount!: number;
  @ApiProperty({ type: [InterestMemberDto] }) users!: InterestMemberDto[];
}
