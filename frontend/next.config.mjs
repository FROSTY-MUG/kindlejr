/** @type {import('next').NextConfig} */

// `output: "standalone"` produces the self-contained server bundle that Docker
// and Railway deploy. Next.js fails to assemble that bundle on Windows when the
// project path contains a space (a known bug in its trace-copy step), so it is
// disabled on Windows to keep `npm run build` working locally. Production
// images build on Linux, where the flag applies as normal.
const isWindows = process.platform === "win32";

const nextConfig = {
  reactStrictMode: true,
  ...(isWindows ? {} : { output: "standalone" }),
};

export default nextConfig;
