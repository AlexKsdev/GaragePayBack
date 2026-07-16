import { UserResponseDto } from './user-response.dto';

/**
 * One page of users plus the size of the whole match, so an admin table can
 * render a pager. Deliberately concrete rather than a generic wrapper — there
 * is one consumer today; `GET /payments` still returns a bare array and can be
 * folded in when phase 4 gives it filters.
 */
export class PaginatedUsersResponseDto {
  items: UserResponseDto[];
  /** Total rows matching the filter, not just this page. */
  total: number;
  page: number;
  limit: number;
}
