/** @type {import('next').NextConfig} */
const nextConfig = {
  // `output: 'standalone'` produces the self-contained server bundle that the
  // production Docker runtime stage copies into the image and runs on :3000.
  // It is required for the container image, and harmless for local dev/build.
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
};
export default nextConfig;
