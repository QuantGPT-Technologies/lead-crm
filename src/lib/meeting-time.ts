/** Converts an explicit wall-clock time in an IANA zone without using the server/browser zone. */
export function meetingLocalTime(instant: string | Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(instant));
  const field = (name: string) => parts.find(part => part.type === name)!.value;
  return `${field('year')}-${field('month')}-${field('day')}T${field('hour')}:${field('minute')}`;
}

export function meetingInstant(local: string, timezone: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) throw new Error('Enter a valid meeting date and time.');
  const target = Date.parse(`${local}:00Z`);
  if (!Number.isFinite(target) || new Date(target).toISOString().slice(0, 16) !== local) throw new Error('Enter a valid meeting date and time.');
  let guess = target;
  for (let attempt = 0; attempt < 3; attempt++) {
    const represented = Date.parse(`${meetingLocalTime(new Date(guess), timezone)}:00Z`);
    guess += target - represented;
  }
  if (meetingLocalTime(new Date(guess), timezone) !== local) throw new Error('That time does not exist in the selected time zone.');
  return new Date(guess).toISOString();
}
