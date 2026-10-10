export const VIDEO_FORMATS = "mov,mp4,m4a,3gp,3g2,mj2,matroska,webm";

export function mediaInput(formats = VIDEO_FORMATS): string[] {
  return [
    "-format_whitelist",
    formats,
    "-protocol_whitelist",
    "file,pipe,https,tls,tcp,crypto",
  ];
}
