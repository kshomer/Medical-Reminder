import { format } from 'date-fns';

export function formatDateRange(start: Date, end: Date | null): string {
  const startStr = format(start, 'dd.MM.yyyy');
  if (!end) {
    return `с ${startStr} (бессрочно)`;
  }
  const endStr = format(end, 'dd.MM.yyyy');
  return `${startStr} - ${endStr}`;
}