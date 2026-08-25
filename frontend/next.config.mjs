/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The frontend talks to the backend API only over the network at runtime
  // (cookie-based auth). No backend code is imported here.
};

export default nextConfig;
