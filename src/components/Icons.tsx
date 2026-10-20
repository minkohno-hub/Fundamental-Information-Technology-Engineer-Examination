// 外部アイコンフォントに依存しないインライン SVG アイコン（オフラインでも表示される）
import type { SVGProps } from 'react';

const base = (d: string, extra?: SVGProps<SVGSVGElement>) =>
  function Icon(props: SVGProps<SVGSVGElement>) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...extra} {...props}>
        <path d={d} />
      </svg>
    );
  };

export const IHome = base('M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z');
export const IPractice = base('M4 5h11M4 12h11M4 19h7M18 15l2 2 3-4M18 4l2 2 3-4');
export const IExam = base('M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z');
export const IBook = base('M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5zM4 21.5A2.5 2.5 0 0 1 6.5 19H20');
export const IChart = base('M4 20V10M10 20V4M16 20v-7M22 20H2');
export const ISearch = base('M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-4.3-4.3');
export const ISettings = base('M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z');
export const IStar = base('m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z');
export const IFlag = base('M5 21V4M5 4h11l-2 4 2 4H5');
export const INote = base('M4 20h4L19 9l-4-4L4 16zM14 6l4 4');
export const IReport = base('M12 9v4M12 17h.01M10.3 3.9 2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z');
export const ICheck = base('M20 6 9 17l-5-5');
export const ICross = base('M18 6 6 18M6 6l12 12');
export const IArrowR = base('M5 12h14M13 6l6 6-6 6');
export const IArrowL = base('M19 12H5M11 6l-6 6 6 6');
export const IPlay = base('M7 4v16l13-8z');
export const IReset = base('M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5');
export const IEye = base('M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z');
export const IEyeOff = base('M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a10 10 0 0 0 5.4-1.6');
export const ICode = base('m16 18 6-6-6-6M8 6l-6 6 6 6');
export const ILesson = base('M2 7l10-4 10 4-10 4zM6 9v5c0 1.7 2.7 3 6 3s6-1.3 6-3V9');
export const IDict = base('M4 19.5V5a2 2 0 0 1 2-2h14v18H6a2 2 0 0 1-2-1.5zM8 7h8M8 11h6');
export const IReview = base('M21 12a9 9 0 1 1-3-6.7M21 4v5h-5');
export const IInfo = base('M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16v-4M12 8h.01');
export const ICloud = base('M17.5 19H8a6 6 0 1 1 1.3-11.9A7 7 0 0 1 22 12.5 4.5 4.5 0 0 1 17.5 19z');
export const IPlan = base('M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z');
export const IChevron = base('m9 18 6-6-6-6');
