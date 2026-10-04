type P = { size?: number; className?: string };
const svg = (size: number, children: React.ReactNode, className?: string, sw = 2) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={sw}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden
  >
    {children}
  </svg>
);

export const IconBack = ({ size = 20, className }: P) => svg(size, <path d="M15 18l-6-6 6-6" />, className);
export const IconChevron = ({ size = 18, className }: P) => svg(size, <path d="M9 18l6-6-6-6" />, className);
export const IconDown = ({ size = 18, className }: P) => svg(size, <path d="M6 9l6 6 6-6" />, className);
export const IconHelp = ({ size = 20, className }: P) =>
  svg(
    size,
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6" />
      <path d="M12 17h.01" />
    </>,
    className,
  );
export const IconPin = ({ size = 20, className }: P) =>
  svg(
    size,
    <>
      <path d="M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </>,
    className,
  );
export const IconMic = ({ size = 20, className }: P) =>
  svg(
    size,
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </>,
    className,
  );
export const IconCheck = ({ size = 20, className }: P) => svg(size, <path d="M5 12.5l4.5 4.5L19 7.5" />, className, 2.6);
export const IconX = ({ size = 20, className }: P) => svg(size, <path d="M6 6l12 12M18 6L6 18" />, className);
export const IconSad = ({ size = 40, className }: P) =>
  svg(
    size,
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 16.5c1-1.2 2.2-1.8 3.5-1.8s2.5.6 3.5 1.8" />
      <path d="M9 10h.01M15 10h.01" />
    </>,
    className,
  );
export const IconWallet = ({ size = 18, className }: P) =>
  svg(
    size,
    <>
      <rect x="3" y="6" width="18" height="13" rx="2.5" />
      <path d="M3 10h18M16 14.5h2" />
    </>,
    className,
  );
export const IconQr = ({ size = 20, className }: P) =>
  svg(
    size,
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3M21 14v.01M14 21h3M21 18v3" />
    </>,
    className,
  );
export const IconCard = ({ size = 20, className }: P) =>
  svg(
    size,
    <>
      <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
      <path d="M2.5 10h19M6 15h4" />
    </>,
    className,
  );
export const IconBank = ({ size = 20, className }: P) =>
  svg(
    size,
    <>
      <path d="M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18" />
    </>,
    className,
  );
export const IconUser = ({ size = 20, className }: P) =>
  svg(
    size,
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
    </>,
    className,
  );
export const IconCar = ({ size = 20, className }: P) =>
  svg(
    size,
    <>
      <path d="M5 17h14M5 17a2 2 0 1 1-4 0v-4l2.5-5.5A2 2 0 0 1 5.3 6h13.4a2 2 0 0 1 1.8 1.5L23 13v4a2 2 0 1 1-4 0" />
      <circle cx="6.5" cy="17" r="1.5" />
      <circle cx="17.5" cy="17" r="1.5" />
    </>,
    className,
  );
export const IconClock = ({ size = 18, className }: P) =>
  svg(
    size,
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>,
    className,
  );
export const IconArrow = ({ size = 16, className }: P) => svg(size, <path d="M5 12h14M13 6l6 6-6 6" />, className);
export const IconEdit = ({ size = 16, className }: P) =>
  svg(size, <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z" />, className);
export const IconLady = ({ size = 18, className }: P) =>
  svg(
    size,
    <>
      <circle cx="12" cy="8" r="5" />
      <path d="M12 13v8M9 18h6" />
    </>,
    className,
  );
export const IconBolt = ({ size = 18, className }: P) => svg(size, <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />, className);
export const IconBell = ({ size = 20, className }: P) =>
  svg(
    size,
    <>
      <path d="M6 9a6 6 0 1 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </>,
    className,
  );
export const IconTrash = ({ size = 18, className }: P) =>
  svg(
    size,
    <>
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
    </>,
    className,
  );
export const IconPlus = ({ size = 18, className }: P) => svg(size, <path d="M12 5v14M5 12h14" />, className);
export const IconStar = ({ size = 16, className }: P) =>
  svg(size, <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />, className);
export const IconRefresh = ({ size = 18, className }: P) =>
  svg(
    size,
    <>
      <path d="M20 11a8 8 0 0 0-14.7-4.4L4 8M4 4v4h4M4 13a8 8 0 0 0 14.7 4.4L20 16M20 20v-4h-4" />
    </>,
    className,
  );
export const IconShield = ({ size = 18, className }: P) =>
  svg(size, <path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6l8-3z" />, className);
