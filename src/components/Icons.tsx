import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };

const base = (size = 18): SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.25,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
});

export const IconSettings = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <circle cx="12" cy="12" r="2.6" />
    <path d="M12 3.5v2.2M12 18.3v2.2M20.5 12h-2.2M5.7 12H3.5M18 6l-1.6 1.6M7.6 16.4 6 18M18 18l-1.6-1.6M7.6 7.6 6 6" />
    <circle cx="12" cy="12" r="6.2" strokeDasharray="2 2.2" />
  </svg>
);

export const IconInspect = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4" />
    <circle cx="12" cy="12" r="3.2" />
    <path d="M12 6.5v1.6M12 15.9v1.6M6.5 12h1.6M15.9 12h1.6" />
  </svg>
);

export const IconMeasure = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M4 17 17 4l3 3L7 20z" />
    <path d="M8 13l1.5 1.5M10.5 10.5l2 2M13 8l1.5 1.5M15.5 5.5l1.5 1.5" />
  </svg>
);

export const IconExplode = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <rect x="9.5" y="9.5" width="5" height="5" rx="0.6" />
    <path d="M4 4h4v4H4zM16 4h4v4h-4zM4 16h4v4H4zM16 16h4v4h-4z" />
    <path d="M8 8l1.5 1.5M16 8l-1.5 1.5M8 16l1.5-1.5M16 16l-1.5-1.5" strokeDasharray="1 1.4" />
  </svg>
);

export const IconInternal = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M3.5 12c2.2-4 5-6 8.5-6s6.3 2 8.5 6c-2.2 4-5 6-8.5 6s-6.3-2-8.5-6z" strokeDasharray="2 1.6" />
    <rect x="9" y="9.6" width="6" height="4.8" rx="0.6" />
    <path d="M10.5 11.2h3M10.5 12.8h2" />
  </svg>
);

export const IconXray = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <circle cx="12" cy="12" r="7.5" />
    <circle cx="12" cy="12" r="4.5" strokeOpacity="0.5" />
    <path d="M8.5 8.5l7 7M15.5 8.5l-7 7" />
  </svg>
);

export const IconSection = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M12 3.5 19.5 8v8L12 20.5 4.5 16V8z" />
    <path d="M3 12h18" strokeDasharray="1.6 1.4" />
    <path d="M4.5 12 12 16.4 19.5 12" strokeOpacity="0.55" />
  </svg>
);

export const IconOverlay = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M3.5 12h17M12 3.5v17" strokeDasharray="1.5 1.5" />
    <circle cx="12" cy="12" r="6" />
    <path d="M5 5l2 2M19 5l-2 2M5 19l2-2M19 19l-2-2" />
  </svg>
);

export const IconLight = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <circle cx="12" cy="12" r="3.5" />
    <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />
  </svg>
);

export const IconClose = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

export const IconEye = ({ size, off, ...p }: P & { off?: boolean }) => (
  <svg {...base(size)} {...p}>
    <path d="M2.5 12c2.4-4.2 5.6-6.3 9.5-6.3s7.1 2.1 9.5 6.3c-2.4 4.2-5.6 6.3-9.5 6.3S4.9 16.2 2.5 12z" />
    <circle cx="12" cy="12" r="2.6" />
    {off && <path d="M4 20 20 4" />}
  </svg>
);

export const IconChevron = ({ size, open, ...p }: P & { open?: boolean }) => (
  <svg {...base(size)} {...p} style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .2s' }}>
    <path d="M9 6l6 6-6 6" />
  </svg>
);

export const IconLayers = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M12 4 20.5 8.5 12 13 3.5 8.5z" />
    <path d="M3.5 12.5 12 17l8.5-4.5M3.5 16.5 12 21l8.5-4.5" strokeOpacity="0.6" />
  </svg>
);

export const IconFocus = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <circle cx="12" cy="12" r="1.5" />
    <circle cx="12" cy="12" r="6" />
    <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" />
  </svg>
);

export const IconIsolate = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <rect x="8" y="8" width="8" height="8" rx="1" />
    <path d="M3.5 3.5h3M3.5 3.5v3M20.5 3.5h-3M20.5 3.5v3M3.5 20.5h3M3.5 20.5v-3M20.5 20.5h-3M20.5 20.5v-3" strokeOpacity="0.6" />
  </svg>
);

export const IconRotate = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M20 12a8 8 0 1 1-2.6-5.9" />
    <path d="M20 4v4h-4" />
  </svg>
);

export const IconCamera = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M3.5 8.5h11v8h-11z" />
    <path d="M14.5 11 20.5 8v9l-6-3" />
  </svg>
);

export const IconPresent = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4" />
  </svg>
);

export const IconSound = ({ size, off, ...p }: P & { off?: boolean }) => (
  <svg {...base(size)} {...p}>
    <path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z" />
    {off ? <path d="M16 9.5l5 5M21 9.5l-5 5" /> : <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />}
  </svg>
);

export const IconLink = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
    <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
  </svg>
);

export const IconSearch = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <circle cx="11" cy="11" r="6" />
    <path d="M20 20l-4.5-4.5" />
  </svg>
);

export const IconEmbed = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M8 7 3 12l5 5M16 7l5 5-5 5M13.5 5l-3 14" />
  </svg>
);
