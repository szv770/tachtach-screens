/**
 * WMO weather interpretation codes (Open-Meteo `weather_code`) → label + icon
 * key. Shared by the screen (rail readout, Weather page) and the admin.
 * Icon keys are drawn by src/screen/design/graphics.jsx (monochrome line art).
 */

const CODES = {
  0: { en: 'Clear', he: 'בהיר', icon: 'clear' },
  1: { en: 'Mostly clear', he: 'בהיר ברובו', icon: 'clear' },
  2: { en: 'Partly cloudy', he: 'מעונן חלקית', icon: 'partly' },
  3: { en: 'Cloudy', he: 'מעונן', icon: 'cloudy' },
  45: { en: 'Fog', he: 'ערפל', icon: 'fog' },
  48: { en: 'Fog', he: 'ערפל', icon: 'fog' },
  51: { en: 'Light drizzle', he: 'טפטוף', icon: 'drizzle' },
  53: { en: 'Drizzle', he: 'טפטוף', icon: 'drizzle' },
  55: { en: 'Heavy drizzle', he: 'טפטוף', icon: 'drizzle' },
  56: { en: 'Freezing drizzle', he: 'טפטוף קפוא', icon: 'drizzle' },
  57: { en: 'Freezing drizzle', he: 'טפטוף קפוא', icon: 'drizzle' },
  61: { en: 'Light rain', he: 'גשם קל', icon: 'rain' },
  63: { en: 'Rain', he: 'גשם', icon: 'rain' },
  65: { en: 'Heavy rain', he: 'גשם כבד', icon: 'rain' },
  66: { en: 'Freezing rain', he: 'גשם קפוא', icon: 'rain' },
  67: { en: 'Freezing rain', he: 'גשם קפוא', icon: 'rain' },
  71: { en: 'Light snow', he: 'שלג קל', icon: 'snow' },
  73: { en: 'Snow', he: 'שלג', icon: 'snow' },
  75: { en: 'Heavy snow', he: 'שלג כבד', icon: 'snow' },
  77: { en: 'Snow grains', he: 'שלג', icon: 'snow' },
  80: { en: 'Showers', he: 'ממטרים', icon: 'rain' },
  81: { en: 'Showers', he: 'ממטרים', icon: 'rain' },
  82: { en: 'Heavy showers', he: 'ממטרים כבדים', icon: 'rain' },
  85: { en: 'Snow showers', he: 'שלג', icon: 'snow' },
  86: { en: 'Snow showers', he: 'שלג', icon: 'snow' },
  95: { en: 'Thunderstorms', he: 'סופות רעמים', icon: 'storm' },
  96: { en: 'Thunderstorms', he: 'סופות רעמים', icon: 'storm' },
  99: { en: 'Thunderstorms', he: 'סופות רעמים', icon: 'storm' },
};

/** { en, he, icon } for a WMO code; night turns clear/partly into moon icons. */
export function describeWeather(code, isDay = true) {
  const c = CODES[Number(code)] || { en: '', he: '', icon: 'cloudy' };
  let icon = c.icon;
  if (!isDay && icon === 'clear') icon = 'clear-night';
  if (!isDay && icon === 'partly') icon = 'partly-night';
  return { ...c, icon };
}

export const WEATHER_UNITS = { F: '°F', C: '°C' };
