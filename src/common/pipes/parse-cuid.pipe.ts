import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

// cuid starts with 'c' followed by at least 20 alphanumeric chars
const CUID_REGEX = /^c[a-z0-9]{20,}$/;

@Injectable()
export class ParseCuidPipe implements PipeTransform<string> {
  transform(value: string): string {
    if (!CUID_REGEX.test(value)) {
      throw new BadRequestException(`Invalid id format: ${value}`);
    }
    return value;
  }
}
