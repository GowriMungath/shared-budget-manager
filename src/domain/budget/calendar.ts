const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const millisecondsPerDay = 86_400_000;

export function assertCalendarDate(value: string, label: string): void {
  if (!isoDatePattern.test(value)) {
    throw new Error(`${label} must be an ISO YYYY-MM-DD date`);
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);

  if (parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`${label} must be a valid calendar date`);
  }
}

export function calendarDayNumber(value: string): number {
  assertCalendarDate(value, "Calendar date");
  return Date.parse(`${value}T00:00:00.000Z`) / millisecondsPerDay;
}

export function inclusiveDayCount(startDate: string, endDate: string): number {
  const start = calendarDayNumber(startDate);
  const end = calendarDayNumber(endDate);

  if (start > end) {
    throw new Error("Start date must be on or before end date");
  }

  return end - start + 1;
}

export function periodElapsedPercent(period: { startDate: string; endDate: string }, today: string): number {
  const start = calendarDayNumber(period.startDate);
  const end = calendarDayNumber(period.endDate);
  const current = calendarDayNumber(today);

  if (start > end) {
    throw new Error("Budget period startDate must be on or before endDate");
  }

  if (current < start) {
    return 0;
  }

  if (current > end) {
    return 1;
  }

  return (current - start + 1) / inclusiveDayCount(period.startDate, period.endDate);
}
