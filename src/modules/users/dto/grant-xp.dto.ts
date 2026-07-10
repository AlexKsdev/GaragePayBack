import { IsInt, Max, Min } from 'class-validator';

export class GrantXpDto {
  @IsInt()
  @Min(1)
  @Max(100000)
  amount: number;
}
