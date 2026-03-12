function getLastDayOfMonth(year: number, monthIndex: number) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

export function getEffectivePayday(year: number, monthIndex: number, paydayOfMonth: number) {
  return Math.min(paydayOfMonth, getLastDayOfMonth(year, monthIndex));
}

export function getPeriodId(inputDate: string | Date, paydayOfMonth: number) {
  const date = typeof inputDate === "string" ? new Date(`${inputDate}T00:00:00.000Z`) : inputDate;
  const year = date.getUTCFullYear();
  const monthIndex = date.getUTCMonth();
  const day = date.getUTCDate();
  const currentPayday = getEffectivePayday(year, monthIndex, paydayOfMonth);

  if (day >= currentPayday) {
    return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(currentPayday).padStart(2, "0")}`;
  }

  const previousMonthIndex = monthIndex === 0 ? 11 : monthIndex - 1;
  const previousYear = monthIndex === 0 ? year - 1 : year;
  const previousPayday = getEffectivePayday(previousYear, previousMonthIndex, paydayOfMonth);

  return `${previousYear}-${String(previousMonthIndex + 1).padStart(2, "0")}-${String(previousPayday).padStart(2, "0")}`;
}
