import dayjs from "dayjs";

// Shared logic: Disable any date after the end of the current month
export const disabledFutureMonthDates = (current) => {
  return current && current > dayjs().endOf("month");
};