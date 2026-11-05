import React from "react";
const paths = {
  moon: "M20.8 13A8.5 8.5 0 0 1 11 3.2 8.5 8.5 0 1 0 20.8 13Z",
  branch:
    "M6 3v12m0 0a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm0-12a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm12 0a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM6 15c0-5 12-1 12-6",
  film: "M4 3h16v18H4ZM4 8h16M4 16h16M8 3v18M16 3v18",
  layers: "m12 3 10 6-10 6L2 9Zm-10 12 10 6 10-6M2 12l10 6 10-6",
  document: "M14 2H5v20h14V7Zm0 0v5h5M8 12h8M8 16h6",
  folder: "M3 6h7l2 3h9v12H3Zm0 0V3h7l2 3h9v3",
  save: "M4 3h13l4 4v14H3V3Zm3 0v6h9V3M7 21v-8h10v8",
  play: "m8 4 13 8-13 8Z",
  close: "m6 6 12 12M6 18 18 6",
  plus: "M12 5v14M5 12h14",
  back: "m14 5-7 7 7 7",
  settings: "M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M10 15v6",
  alert: "m12 3 10 18H2ZM12 9v5M12 17v.1",
  check: "m5 12 4 4L19 6",
  sound: "M4 9h4l5-5v16l-5-5H4Zm13-1a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14",
  search: "M20 20l-5-5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0",
  refresh:
    "M20 10a8 8 0 0 0-14-5L3 8m0-5v5h5M4 14a8 8 0 0 0 14 5l3-3m0 5v-5h-5",
} as const;
export default function WorkbenchIcon({
  name,
  className = "h-4 w-4",
}: {
  name: keyof typeof paths;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d={paths[name]} />
    </svg>
  );
}
