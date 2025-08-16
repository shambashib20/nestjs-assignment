import { IsArray, IsIn, IsString } from 'class-validator';

export class BatchProcessDto {
  @IsArray()
  @IsString({ each: true })
  tasks: string[];

  @IsIn(['complete', 'delete'])
  action: string;
}
