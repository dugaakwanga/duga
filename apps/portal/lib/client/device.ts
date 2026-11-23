type DeviceNavigator = {
  userAgent: string;
  maxTouchPoints?: number;
  userAgentData?: { mobile?: boolean };
};

export function isMobileDevice(device: DeviceNavigator): boolean {
  if (device.userAgentData?.mobile === true) return true;
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(device.userAgent)) return true;
  // iPad Safari can identify itself as a desktop Mac.
  return /Macintosh/i.test(device.userAgent) && (device.maxTouchPoints ?? 0) > 1;
}

export function requiresMobileInstall(role: string, mobile: boolean, pathname: string): boolean {
  return mobile && ["PARENT", "TEACHER", "STUDENT"].includes(role) &&
    !pathname.startsWith("/portal/set-password");
}
