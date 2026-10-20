/**
 * The commands the admin can send to the REAL screen (the TV) over SSE `screen-command`.
 * One allow-list for the server route, the kiosk handler and the admin buttons; each needs the
 * `screen.control` capability (the `/api/screen/*` rule in permissions.js).
 */
export const SCREEN_COMMANDS = ['pause', 'resume', 'blank', 'advance', 'previous'];

/** Plain-English confirmation toast for each command ('TV moved to next slide'). */
export const SCREEN_COMMAND_DONE = {
  pause: 'TV paused',
  resume: 'TV playing again',
  blank: 'TV blank toggled',
  advance: 'TV moved to next slide',
  previous: 'TV moved to previous slide',
};

export const isScreenCommand = (a) => typeof a === 'string' && SCREEN_COMMANDS.includes(a);
