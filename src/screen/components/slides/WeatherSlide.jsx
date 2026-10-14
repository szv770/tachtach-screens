import React from 'react';
import { Panel, PageTitle, F, he } from '../../design/ui.jsx';
import { WeatherIcon } from '../../design/graphics.jsx';
import { describeWeather } from '../../../shared/weatherCodes.js';
import { placeName } from '../../design/hooks.js';
import { Empty } from '../../design/ui.jsx';

/**
 * Optional Weather page (built-in slide type WEATHER, off by default): the
 * current conditions large, the next hours, and the coming days. Data from
 * cache.weather (src/fetchers/weather.js, Open-Meteo).
 */
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DOW_HE = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'שבת'];

function hourLabel(iso) {
  const h = Number(String(iso).slice(11, 13));
  return `${((h + 11) % 12) + 1}${h < 12 ? 'a' : 'p'}`;
}

export default function WeatherSlide({ cache, settings }) {
  const w = cache?.weather;
  const place = placeName(cache, settings);
  if (!w?.current) {
    return (
      <Panel>
        <PageTitle en={`Weather${place ? ` · ${place}` : ''}`} heText="מזג אוויר" />
        <Empty en="Weather isn’t available yet" />
      </Panel>
    );
  }
  const cur = describeWeather(w.current.code, w.current.isDay !== false);
  const unit = w.units === 'C' ? 'C' : 'F';
  const hours = (w.hours || []).filter((_, i) => i % 2 === 0).slice(0, 6);
  const days = (w.days || []).slice(1, 5);
  return (
    <Panel pad="30px 48px 34px">
      <PageTitle en={`Weather${place ? ` · ${place}` : ''}`} heText="מזג אוויר" />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: 0, paddingTop: 14 }}>
        <div data-s="" style={{ '--i': 1, display: 'flex', alignItems: 'center', gap: 44 }}>
          <WeatherIcon icon={cur.icon} size={200} strokeWidth={2.6} fill="var(--panel)" style={{ color: 'var(--accentText)' }} />
          <div style={{ minWidth: 0 }}>
            <div className="tt-num" style={{ fontSize: 200, fontWeight: 600, letterSpacing: '-.05em', lineHeight: 0.9 }}>{w.current.temp}°</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 22, marginTop: 14 }}>
              <span style={{ fontFamily: F.enD, fontSize: 46, fontWeight: 600 }}>{cur.en}</span>
              <span className="tt-he" style={{ fontFamily: F.heD, fontSize: he(40), color: 'var(--inkDim)', fontWeight: 500 }}>{cur.he}</span>
            </div>
            <div className="tt-num" style={{ fontFamily: F.en, fontSize: 28, color: 'var(--inkDim)', marginTop: 10, fontWeight: 500 }}>
              {w.today?.hi != null ? `H ${w.today.hi}° · L ${w.today.lo}°` : ''}
              {w.current.feels != null ? `  ·  Feels like ${w.current.feels}°` : ''}
              {w.current.wind != null ? `  ·  Wind ${w.current.wind} ${unit === 'C' ? 'km/h' : 'mph'}` : ''}
            </div>
          </div>
        </div>

        {hours.length > 0 && (
          <div data-s="" style={{ '--i': 2, display: 'grid', gridTemplateColumns: `repeat(${hours.length}, minmax(0, 1fr))`, columnGap: 20 }}>
            {hours.map((h, i) => {
              const d = describeWeather(h.code, h.isDay !== false);
              return (
                <div key={h.time} style={{ borderTop: '2px solid var(--line)', paddingTop: 14, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
                  <span className="tt-num" style={{ fontSize: 26, color: 'var(--inkDim)', fontWeight: 600 }}>{i === 0 ? 'Now' : hourLabel(h.time)}</span>
                  <WeatherIcon icon={d.icon} size={52} fill="var(--panel)" />
                  <span className="tt-num" style={{ fontSize: 40, fontWeight: 650, letterSpacing: '-.03em' }}>{h.temp}°</span>
                </div>
              );
            })}
          </div>
        )}

        {days.length > 0 && (
          <div data-s="" style={{ '--i': 3, display: 'grid', gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`, columnGap: 20 }}>
            {days.map((d) => {
              const dt = new Date(`${d.date}T12:00:00`);
              const info = describeWeather(d.code, true);
              return (
                <div key={d.date} style={{ borderTop: '2px solid var(--line)', paddingTop: 14, display: 'flex', alignItems: 'center', gap: 16 }}>
                  <WeatherIcon icon={info.icon} size={48} fill="var(--panel)" />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: F.en, fontSize: 26, fontWeight: 600 }}>{DOW[dt.getDay()]} <span className="tt-he" style={{ fontFamily: F.he, color: 'var(--inkDim)', fontSize: he(22) }}>{DOW_HE[dt.getDay()]}</span></div>
                    <div className="tt-num" style={{ fontSize: 26, color: 'var(--inkDim)', fontWeight: 500 }}>{d.hi}° / {d.lo}°</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Panel>
  );
}
